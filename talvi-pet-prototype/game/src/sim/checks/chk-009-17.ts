import type { Content } from '../../content/types';
import type { Item } from '../../content/schema/charms';
import { rewardItems, type Condition } from '../../content/schema/pet';
import type { Slot } from '../../content/schema/room';
import { homeSpaceOf, spaceDef } from '../space';
import { finding, type Finding } from './types';

/** CHK-009-17 (DEC-043): every want is satisfiable from the copies owned at its activation (a lower bound). */
export type Owned = Record<string, number>;
export type Satisfiability = { satisfiable: boolean; owned: Owned; unmet: string[]; maxStars: number };

function addItems(owned: Owned, items: readonly Item[]): void {
  for (const { typeId, count } of items) owned[typeId] = (owned[typeId] ?? 0) + count;
}

/** Copies owned when want `wantIndex` of `petId` activates. The opening pet (resident of a `completeAtStart`
 * project): the starter set, from want 1 on also `phaseRewards[0]` of every rising project. An arriving pet
 * (resident of a rising project): the starter set + every phase of its project. Plus the pet's own earlier Heart items. */
export function ownedAtActivation(c: Content, petId: string, wantIndex: number): Owned {
  const home = c.pets[petId]?.home;
  if (home?.kind === 'space') return ownedAtSiteWant(c, petId, home.siteId, wantIndex);
  const owned: Owned = {};
  addItems(owned, c.charms.starterSet);
  const own = c.projects.find(project => project.residentPetId === petId);
  if (own && !own.completeAtStart) own.phaseRewards.forEach(items => addItems(owned, items));
  else if (own && wantIndex >= 1)
    c.projects.filter(project => !project.completeAtStart).forEach(project => addItems(owned, project.phaseRewards[0] ?? []));
  c.pets[petId].wants.slice(0, wantIndex).forEach(want => addItems(owned, rewardItems(want)));
  return owned;
}

/** WORK-034-2: the pet and want index whose reward unlocks `siteId` (kind `space`), or null. */
export function unlockWantOf(c: Content, siteId: string): { petId: string; wantIndex: number } | null {
  for (const pet of Object.values(c.pets)) {
    const wantIndex = pet.wants.findIndex(want => want.reward.some(entry => entry.kind === 'space' && entry.siteId === siteId));
    if (wantIndex >= 0) return { petId: pet.id, wantIndex };
  }
  return null;
}

/** Copies owned once the site's unlock want is fulfilled (its bundle included): the starter set, every phase of every
 * project and the unlocking pet's Heart items up to that want. Stripping is allowed, so placed copies count. */
export function ownedAfterUnlock(c: Content, siteId: string): Owned | null {
  const unlock = unlockWantOf(c, siteId);
  if (!unlock) return null;
  const owned: Owned = {};
  addItems(owned, c.charms.starterSet);
  c.projects.forEach(project => project.phaseRewards.forEach(items => addItems(owned, items)));
  c.pets[unlock.petId].wants.slice(0, unlock.wantIndex + 1).forEach(want => addItems(owned, rewardItems(want)));
  return owned;
}

/** A space-homed pet's want: the copies owned after the unlock plus the pet's own earlier Heart items. */
function ownedAtSiteWant(c: Content, petId: string, siteId: string, wantIndex: number): Owned {
  const owned = ownedAfterUnlock(c, siteId) ?? {};
  c.pets[petId].wants.slice(0, wantIndex).forEach(want => addItems(owned, rewardItems(want)));
  return owned;
}

type Search = { c: Content; slots: Slot[]; owned: Owned; tags: string[]; best: number };

const typeOf = (c: Content, typeId: string) => c.charms.types.find(type => type.id === typeId);
const carries = (c: Content, typeId: string, tag: string) => typeOf(c, typeId)?.tags.includes(tag) ?? false;

/** Max Stars once `placed` (type ids, one per slot) is extended optimally: per size class, fill the free slots
 * with unplaced types first (starsFirstCopy each), then repeat copies (starsRepeat each). */
function fillStars(s: Search, placed: string[]): number {
  const { starsFirstCopy, starsRepeat } = s.c.tuning;
  const used: Owned = {};
  placed.forEach(id => { used[id] = (used[id] ?? 0) + 1; });
  let points = Object.values(used).reduce((sum, n) => sum + starsFirstCopy + (n - 1) * starsRepeat, 0);
  for (const sizeClass of ['small', 'large', 'wall'] as const) {
    let free = s.slots.filter(slot => slot.sizeClass === sizeClass).length
      - placed.filter(id => typeOf(s.c, id)?.sizeClass === sizeClass).length;
    const ofClass = Object.keys(s.owned).filter(id => typeOf(s.c, id)?.sizeClass === sizeClass);
    const fresh = ofClass.filter(id => !used[id] && s.owned[id] > 0);
    const firsts = Math.min(free, fresh.length);
    free -= firsts;
    const repeats = ofClass.reduce((sum, id) => sum + s.owned[id] - (used[id] ?? 0), 0) - firsts;
    points += firsts * starsFirstCopy + Math.min(free, Math.max(0, repeats)) * starsRepeat;
  }
  return points;
}

function fits(s: Search, placed: string[], typeId: string): boolean {
  const type = typeOf(s.c, typeId);
  if (!type || placed.filter(id => id === typeId).length >= (s.owned[typeId] ?? 0)) return false;
  const capacity = s.slots.filter(slot => slot.sizeClass === type.sizeClass).length;
  return placed.filter(id => typeOf(s.c, id)?.sizeClass === type.sizeClass).length < capacity;
}

/** Cover every tag condition (first uncovered tag first), then record the best Stars reachable. */
function coverTags(s: Search, placed: string[]): void {
  const tag = s.tags.find(candidate => !placed.some(id => carries(s.c, id, candidate)));
  if (tag === undefined) { s.best = Math.max(s.best, fillStars(s, placed)); return; }
  for (const typeId of Object.keys(s.owned))
    if (carries(s.c, typeId, tag) && fits(s, placed, typeId)) coverTags(s, [...placed, typeId]);
}

/** Every ordered adjacent slot pair holding a tagA type and a tagB type, or one empty start without adjacency. */
function adjacentStarts(s: Search, adjacent: Extract<Condition, { kind: 'adjacent' }> | undefined): string[][] {
  if (!adjacent) return [[]];
  const starts: string[][] = [];
  for (const slot of s.slots)
    for (const otherId of slot.adjacent) {
      const other = s.slots.find(candidate => candidate.id === otherId);
      if (!other || other.id === slot.id) continue;
      for (const a of Object.keys(s.owned))
        for (const b of Object.keys(s.owned)) {
          if (!carries(s.c, a, adjacent.tagA) || !carries(s.c, b, adjacent.tagB)) continue;
          if (typeOf(s.c, a)?.sizeClass !== slot.sizeClass || typeOf(s.c, b)?.sizeClass !== other.sizeClass) continue;
          if ((s.owned[a] ?? 0) < 1 || (s.owned[b] ?? 0) < (a === b ? 2 : 1)) continue;
          starts.push([a, b]);
        }
    }
  return starts;
}

/** The best Stars of an assignment meeting every tag and adjacency condition, or -1 when none exists. */
function bestStars(c: Content, slots: Slot[], owned: Owned, conditions: readonly Condition[]): number {
  const tags = conditions.flatMap(condition => condition.kind === 'tag' ? [condition.tag] : []);
  const adjacent = conditions.find((condition): condition is Extract<Condition, { kind: 'adjacent' }> => condition.kind === 'adjacent');
  const s: Search = { c, slots, owned, tags, best: -1 };
  for (const start of adjacentStarts(s, adjacent)) coverTags(s, start);
  return s.best;
}

const describe = (condition: Condition): string => condition.kind === 'tag' ? `tag ${condition.tag}`
  : condition.kind === 'adjacent' ? `adjacent ${condition.tagA}+${condition.tagB}`
  : condition.kind === 'greeted' ? `greeted ${condition.withPetId}` : `stars >= ${condition.min}`;

/** The pet's home slots (room or site, WORK-034-2), or null when it has none. */
function homeSlots(c: Content, petId: string): Slot[] | null {
  try { return spaceDef(c, homeSpaceOf(c, petId)).slots; } catch { return null; }
}

/** Exact for the home space (a room or a site): tag conditions (hidden included), the adjacent condition over
 * `slot.adjacent`, Stars floor. A `greeted` condition is not placement-driven (DEC-046) and is left out. */
export function wantSatisfiable(c: Content, petId: string, wantIndex: number): Satisfiability {
  const conditions = c.pets[petId].wants[wantIndex].conditions.filter(condition => condition.kind !== 'greeted');
  const slots = homeSlots(c, petId);
  const owned = ownedAtActivation(c, petId, wantIndex);
  if (!slots) return { satisfiable: false, owned, unmet: conditions.map(describe), maxStars: -1 };
  const best = bestStars(c, slots, owned, conditions);
  const floor = conditions.find((condition): condition is Extract<Condition, { kind: 'stars' }> => condition.kind === 'stars');
  const satisfiable = best >= 0 && (!floor || best >= floor.min);
  if (satisfiable) return { satisfiable, owned, unmet: [], maxStars: best };
  const alone = conditions.filter(condition => condition.kind !== 'stars' && bestStars(c, slots, owned, [condition]) < 0);
  const unmet = alone.length ? alone.map(describe) : floor && best >= 0 ? [describe(floor)] : conditions.map(describe);
  return { satisfiable, owned, unmet, maxStars: best };
}

export function check009Satisfiable(c: Content): Finding[] {
  const out: Finding[] = [];
  for (const pet of Object.values(c.pets))
    pet.wants.forEach((want, wantIndex) => {
      const result = wantSatisfiable(c, pet.id, wantIndex);
      if (!result.satisfiable)
        out.push(finding('CHK-009-17', 'error', `pets/${pet.id}.json`, `/wants/${wantIndex}/conditions`,
          `Want "${want.id}" is not satisfiable from the copies owned at its activation: ${result.unmet.join(', ')}`,
          undefined, { petId: pet.id, wantIndex, owned: result.owned, unmet: result.unmet }));
    });
  return out;
}

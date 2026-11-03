import type { Content } from '../content/types';
import { pointInPolygon } from './geometry';
import { doorEnabled, phaseOf, starsOf } from './select';
import type { GameState } from './state';
import { playerSpace, sitesOf } from './space';

type Check = (content: Content, state: GameState) => string | null;

/** Invariant 1 (DEC-028): 0 ≤ acknowledgedPhase ≤ phaseOf(currentCents) ≤ 5 and 0 ≤ currentCents ≤ goalCents. */
const projectBounds: Check = (content, state) => {
  for (const project of content.projects) {
    const progress = state.projects[project.id];
    if (!progress) return `invariant 1: projects.${project.id} missing`;
    if (progress.currentCents < 0 || progress.currentCents > project.goalCents)
      return `invariant 1: projects.${project.id}.currentCents ${progress.currentCents} outside 0..${project.goalCents}`;
    if (progress.acknowledgedPhase < 0 || progress.acknowledgedPhase > phaseOf(progress.currentCents, project.goalCents))
      return `invariant 1: projects.${project.id}.acknowledgedPhase ${progress.acknowledgedPhase} above phaseOf(currentCents)`;
  }
  return null;
};

/** Invariant 2: hearts = fulfilled count; fulfilled ids are a prefix of the pet's wants; want ids known. */
const wantPrefix: Check = (content, state) => {
  for (const [petId, pet] of Object.entries(state.pets)) {
    const wants = content.pets[petId]?.wants.map(want => want.id) ?? [];
    if (pet.hearts !== pet.fulfilledWantIds.length)
      return `invariant 2: pets.${petId}.hearts ${pet.hearts} ≠ fulfilledWantIds.length ${pet.fulfilledWantIds.length}`;
    if (pet.fulfilledWantIds.some((id, index) => wants[index] !== id))
      return `invariant 2: pets.${petId}.fulfilledWantIds is not a prefix of the pet's wants`;
    const unknown = Object.keys(pet.revealedHiddenTags).find(id => !wants.includes(id));
    if (unknown !== undefined) return `invariant 2: pets.${petId}.revealedHiddenTags has unknown want id "${unknown}"`;
  }
  return null;
};

/** Invariant 3 (v1.5, DEC-043): every count is an integer ≥ 0; every placement is a granted (`counts` key), known
 * type on a known slot of the same size class; per pet `strippedPending ⊆ heartCharms ⊆ counts keys`. */
const placementsOwned: Check = (content, state) => {
  const counts = state.inventory.counts;
  for (const [typeId, count] of Object.entries(counts))
    if (!Number.isInteger(count) || count < 0) return `invariant 3: inventory.counts.${typeId} ${count} is not an integer ≥ 0`;
  const spaces = [...Object.entries(state.rooms).map(([id, room]) => ({ where: `rooms.${id}`, placements: room.placements, slots: content.rooms[id]?.slots })),
    ...sitesOf(content).map(site => ({ where: `spaces.${site.id}`, placements: state.spaces[site.id]?.placements ?? {}, slots: site.slots }))];
  for (const space of spaces) {
    for (const [slotId, typeId] of Object.entries(space.placements)) {
      const slot = space.slots?.find(candidate => candidate.id === slotId);
      const type = content.charms.types.find(candidate => candidate.id === typeId);
      const where = `${space.where}.placements.${slotId}`;
      if (!slot) return `invariant 3: ${where} names an unknown slot`;
      if (!type) return `invariant 3: ${where} names unknown type "${typeId}"`;
      if (!Object.hasOwn(counts, typeId)) return `invariant 3: ${where} type "${typeId}" never granted`;
      if (slot.sizeClass !== type.sizeClass) return `invariant 3: ${where} size ${type.sizeClass} ≠ slot ${slot.sizeClass}`;
    }
  }
  for (const [petId, pet] of Object.entries(state.pets)) {
    if (pet.heartCharms.some(id => !Object.hasOwn(counts, id))) return `invariant 3: pets.${petId}.heartCharms ⊄ counts keys`;
    if (pet.strippedPending.some(id => !pet.heartCharms.includes(id))) return `invariant 3: pets.${petId}.strippedPending ⊄ heartCharms`;
  }
  return null;
};

/** Invariant 4 (DEC-030), recomputed here independently of `starsOf`'s own loop. */
const starsSum: Check = (content, state) => {
  const { starsFirstCopy, starsRepeat } = content.tuning;
  for (const [roomId, room] of Object.entries(state.rooms)) {
    const known = new Set(content.charms.types.map(type => type.id));
    const values = Object.values(room.placements);
    if (!content.rooms[roomId] || values.some(id => !known.has(id))) continue; // invariant 3 reports these
    const counts = values.reduce<Record<string, number>>((all, id) => ({ ...all, [id]: (all[id] ?? 0) + 1 }), {});
    const points = Object.values(counts).reduce((sum, count) => sum + starsFirstCopy + (count - 1) * starsRepeat, 0);
    const stars = starsOf(content, state, roomId);
    if (stars.points !== points || stars.max !== starsFirstCopy * content.rooms[roomId].slots.length)
      return `invariant 4: rooms.${roomId} starsOf ${stars.points}/${stars.max} ≠ recomputed ${points}`;
  }
  return null;
};

/** Invariant 5: a celebration only on the street; design mode only in an interior. */
const sceneModes: Check = (content, state) => {
  if (state.celebration !== null && state.scene.kind !== 'street') return 'invariant 5: celebration open outside the street';
  // WORK-034-2 (MEC-001 as amended): design mode on the street needs an unlocked site.
  if (state.mode === 'design' && state.scene.kind !== 'interior' && playerSpace(content, state) === null)
    return 'invariant 5: mode design on the street with no unlocked site';
  return null;
};

/** Invariant 6: complete ⇒ acknowledgedPhase 5; the house door is enabled ⇔ complete && arrivalDone. */
const completion: Check = (content, state) => {
  for (const project of content.projects) {
    const progress = state.projects[project.id];
    if (progress.complete && progress.acknowledgedPhase !== 5)
      return `invariant 6: projects.${project.id}.complete with acknowledgedPhase ${progress.acknowledgedPhase}`;
    const house = content.street.houses.find(candidate => candidate.projectId === project.id);
    if (house && doorEnabled(content, state, house.door) !== (progress.complete && progress.arrivalDone))
      return `invariant 6: projects.${project.id} door enabled ≠ complete && arrivalDone`;
  }
  return null;
};

function isPlain(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isPlain);
  if (typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every(child => child !== undefined && isPlain(child));
}

/** Invariant 7 (the state half): `JSON.parse(JSON.stringify(state))` would deep-equal `state`. */
const jsonPlain: Check = (_content, state) => (isPlain(state) ? null : 'invariant 7: state is not plain JSON');

/** Invariant 9 (MEC-008): an empty current means an empty queue; the current index is in range. */
const dialogueShape: Check = (_content, state) => {
  const { current, queue } = state.dialogue;
  if (current === null) return queue.length === 0 ? null : 'invariant 9: dialogue.queue non-empty with no current';
  return current.index >= 0 && current.index < current.lines.length ? null
    : `invariant 9: dialogue.current.index ${current.index} outside 0..${current.lines.length - 1}`;
};

/** Invariant 10 (mec-007 §1, as amended by WORK-035-1): `using` targets a filled slot with a verb; each room resident stands
 * inside its room's walkArea while inside, and inside the street walkArea while outside (DEC-045). */
const petBehaviour: Check = (content, state) => {
  for (const room of Object.values(content.rooms)) {
    const behaviour = state.pets[room.residentPetId]?.behaviour;
    if (!behaviour) continue;
    const where = `pets.${room.residentPetId}.behaviour`;
    if (state.pets[room.residentPetId].outside) {
      if (behaviour.phase === 'using') return `invariant 10: ${where} using while outside`;
      if (!pointInPolygon(behaviour, content.street.walkArea))
        return `invariant 10: ${where} (${behaviour.x}, ${behaviour.y}) outside the street walkArea while outside`;
      continue;
    }
    if (behaviour.phase === 'using') {
      const slotId = behaviour.target !== null && 'slotId' in behaviour.target ? behaviour.target.slotId : null;
      if (slotId === null || state.rooms[room.id]?.placements[slotId] === undefined || behaviour.verb === null)
        return `invariant 10: ${where} using without a filled slot target and a verb`;
    }
    if (!pointInPolygon(behaviour, room.walkArea)) return `invariant 10: ${where} (${behaviour.x}, ${behaviour.y}) outside walkArea`;
  }
  return null;
};

/** Invariant 11 (WORK-035-1, never in two places): in an interior its resident is inside. */
const residentInside: Check = (content, state) => {
  if (state.scene.kind !== 'interior') return null;
  const petId = content.rooms[state.scene.roomId]?.residentPetId;
  return petId && state.pets[petId]?.outside ? `invariant 11: pets.${petId}.outside in its own room` : null;
};

const checks: readonly Check[] = [projectBounds, wantPrefix, placementsOwned, starsSum, sceneModes, completion,
  jsonPlain, dialogueShape, petBehaviour, residentInside];

/** Core §8 invariants 1–6, 9, 10 and the JSON half of 7: one message per violated invariant, `[]` when valid.
 * Invariant 8 and the replay half of 7 are harness properties (tests/sim/invariants.test.ts). */
export function checkInvariants(content: Content, state: GameState): string[] {
  return checks.map(check => check(content, state)).filter((message): message is string => message !== null);
}

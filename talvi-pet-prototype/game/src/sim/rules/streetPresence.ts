import type { Content } from '../../content/types';
import type { Action } from '../actions';
import type { RuleResult, SimEvent } from '../events';
import { mulberry32 } from '../rng';
import type { GameState, PetId, RoomId } from '../state';
import { housePets, sitesOf, siteRef, yardRef, type SpaceRef } from '../space';
import { verbEndedOf } from './reactions';

/** DEC-045 / gate Q7(a): the chance a pet with ≥ 1 Heart is outside on a street visit. Named constant until the run
 * moves it to tuning.json (WORK-038-3 owns tuning.json in this wave; order fork (f)). */
export const STREET_OUTSIDE_P = 0.6;

/** FNV-1a 32-bit hash of a string (the pet id). */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/** Pure per-visit roll: one mulberry32 step over a hash of (seed, petId, visit); reads and writes no rngState. */
export function rollOutside(seed: number, petId: PetId, visit: number): boolean {
  const mixed = (seed ^ fnv1a32(petId) ^ Math.imul(visit, 0x9e3779b9)) >>> 0;
  return mulberry32(mixed).value < STREET_OUTSIDE_P;
}

type PetsOutside = GameState['session']['petsOutside'];

/** Whether a house pet should be outside for this visit, before any presence change. */
function wantedOutside(state: GameState, petId: PetId, roomId: RoomId, justLeft: RoomId | null, mode: PetsOutside): boolean {
  if (state.pets[petId].hearts < 1 || mode === 'none') return false;
  if (mode === 'all') return true;
  return justLeft !== roomId && rollOutside(state.session.seed, petId, state.streetVisits);
}

/** "Never in two places" (gate Q8(a)): flip `outside`, standing the pet idle at the first wander point of the space it is
 * now in (its yard on the street, its room inside); a no-op when the value is unchanged. No pet-stream draw. */
export function setOutside(content: Content, state: GameState, petId: PetId, outside: boolean): RuleResult {
  const pet = state.pets[petId];
  if (pet.outside === outside) return { state, events: [] };
  const entry = housePets(content).find(candidate => candidate.petId === petId);
  if (!entry) return { state, events: [] }; // only house pets change presence; a site's resident is always outside
  const [point] = outside ? entry.house.wanderPoints! : content.rooms[entry.roomId].wanderPoints;
  const behaviour = { phase: 'idle' as const, x: point.x, y: point.y, facing: pet.behaviour.facing,
    timerMs: content.tuning.idleMs.min, target: null, verb: null, reaction: null };
  const events: SimEvent[] = [...verbEndedOf(petId, pet.behaviour), { type: 'pet.outside', petId, outside }];
  return { state: { ...state, pets: { ...state.pets, [petId]: { ...pet, outside, behaviour } } }, events };
}

function applyAll(content: Content, state: GameState, wanted: (petId: PetId, roomId: RoomId) => boolean): RuleResult {
  let current = state;
  const events: SimEvent[] = [];
  for (const { petId, roomId } of housePets(content)) {
    const result = setOutside(content, current, petId, wanted(petId, roomId));
    current = result.state; events.push(...result.events);
  }
  return { state: current, events };
}

/** Tick step 2 hook, same dispatch as `scene.changed`: a street arrival counts the visit then rolls each house pet; entering
 * a house brings its pet inside before tick step 4's entry greeting. No roll on load, boot or reset. */
export function afterSceneChange(content: Content, doors: RuleResult): RuleResult {
  const changed = doors.events.find(event => event.type === 'scene.changed');
  if (!changed || changed.type !== 'scene.changed') return doors;
  if (changed.to.kind === 'interior') {
    const roomId = changed.to.roomId;
    const entry = housePets(content).find(candidate => candidate.roomId === roomId);
    if (!entry) return doors;
    const inside = setOutside(content, doors.state, entry.petId, false);
    return { state: inside.state, events: [...doors.events, ...inside.events] };
  }
  const counted = { ...doors.state, streetVisits: doors.state.streetVisits + 1 };
  const justLeft = changed.from.kind === 'interior' ? changed.from.roomId : null;
  const mode = counted.session.petsOutside;
  const rolled = applyAll(content, counted,
    (petId, roomId) => wantedOutside(counted, petId, roomId, mode === 'roll' ? justLeft : null, mode));
  return { state: rolled.state, events: [...doors.events, ...rolled.events] };
}

/** CONTRACT-SELECT (WORK-035-1): every pet on the street, content order — each arrived site's resident and each house
 * pet with `outside`; `ref` is the space it wanders in (its site, or its house's yard). */
export function streetPets(content: Content, state: GameState): { petId: PetId; ref: SpaceRef }[] {
  const sites = new Map(sitesOf(content).filter(site => state.spaces[site.id]?.arrivalDone)
    .map(site => [site.residentPetId, siteRef(site.id)]));
  const houses = new Map(housePets(content).filter(entry => state.pets[entry.petId]?.outside)
    .map(entry => [entry.petId, yardRef(entry.house.projectId)]));
  return Object.keys(content.pets).flatMap(petId => {
    const ref = sites.get(petId) ?? houses.get(petId);
    return ref ? [{ petId, ref }] : [];
  });
}

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;
const MODES: readonly PetsOutside[] = ['roll', 'all', 'none'];

/** MEC-010 row 23 "Pets outside": sets the override; 'all'/'none' apply at once on the street, 'roll' waits for the next
 * arrival. 'all' keeps the ≥ 1 Heart rule (order fork (d)). */
export function debugSetPetsOutside(content: Content, state: GameState, action: ActionOf<'debugSetPetsOutside'>): RuleResult {
  if (!MODES.includes(action.mode)) return { state, events: [{ type: 'action.rejected', action, reason: 'unknownMode' }] };
  const next = { ...state, session: { ...state.session, petsOutside: action.mode } };
  const applied: SimEvent = { type: 'debug.applied', action };
  if (state.scene.kind !== 'street' || action.mode === 'roll') return { state: next, events: [applied] };
  const result = applyAll(content, next, (petId, roomId) => wantedOutside(next, petId, roomId, null, action.mode));
  return { state: result.state, events: [applied, ...result.events] };
}

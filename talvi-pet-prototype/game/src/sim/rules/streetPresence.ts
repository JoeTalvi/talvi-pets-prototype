import type { Content } from '../../content/types';
import type { Action, TickAction } from '../actions';
import type { RuleResult, SimEvent } from '../events';
import { mulberry32 } from '../rng';
import type { GameState, PetBehaviour, PetId, RoomId } from '../state';
import { housePets, sitesOf, siteRef, yardRef, type SpaceRef } from '../space';
import { phaseChanged } from './petBehaviour';
import { verbEndedOf } from './reactions';

/**
 * Indoor / outdoor presence of the house pets (the Dog and the Owl; DEC-045), 2026-11-03 rule, replacing the WORK-035-1
 * per-visit roll. `pets[p].outside` is kept at all times; every `tuning.presenceRollMs` (one global countdown) each house
 * pet with ≥ 1 Heart is rolled once:
 *   - inside, player on the street            → comes out with `presenceOutP`;
 *   - outside (wherever the player is)        → goes back into its own house with `presenceInP` (not mid-meeting);
 *   - player in the pet's own room            → brought in at that roll, so within `presenceRollMs`; stays in while the player is there;
 *   - inside, player in another building      → stays in.
 * Row 23 "Pets outside" overrides the roll: 'all' keeps every eligible pet out (the own-room rule still wins), 'none' keeps all in.
 */

/** FNV-1a 32-bit hash of a string (the pet id). */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return hash >>> 0;
}

/** Pure uniform draw in [0, 1) for one (seed, pet, roll index): one mulberry32 step over their hash; reads and writes no rngState. */
export function presenceDraw(seed: number, petId: PetId, roll: number): number {
  const mixed = (seed ^ fnv1a32(petId) ^ Math.imul(roll, 0x9e3779b9)) >>> 0;
  return mulberry32(mixed).value;
}

const playerInRoom = (state: GameState, roomId: RoomId) => state.scene.kind === 'interior' && state.scene.roomId === roomId;

/** Where a house pet should be after this roll; `draw` is consulted only in mode 'roll'. */
export function wantedOutside(content: Content, state: GameState, petId: PetId, roomId: RoomId, draw: () => number): boolean {
  const pet = state.pets[petId];
  const mode = state.session.petsOutside;
  if (playerInRoom(state, roomId) || pet.hearts < 1 || mode === 'none') return false;
  if (mode === 'all') return true;
  if (pet.outside) return pet.behaviour.phase === 'meeting' || draw() >= content.tuning.presenceInP;
  return state.scene.kind === 'street' && draw() < content.tuning.presenceOutP;
}

/** Flip `outside`, standing the pet idle at the door it came through (its house door on the street, its room's street door
 * inside); a pet coming home to the player's room holds its entry greeting (idle, reaction greeting, `greetingDelayMs`).
 * A no-op when the value is unchanged. No pet-stream draw. */
export function setOutside(content: Content, state: GameState, petId: PetId, outside: boolean): RuleResult {
  const pet = state.pets[petId];
  if (pet.outside === outside) return { state, events: [] };
  const entry = housePets(content).find(candidate => candidate.petId === petId);
  if (!entry) return { state, events: [] }; // only house pets change presence; a site's resident is always outside
  const room = content.rooms[entry.roomId];
  const door = outside ? entry.house.door.spawn
    : room.doors.find(candidate => candidate.target.scene === 'street')?.spawn ?? room.wanderPoints[0];
  const greets = !outside && playerInRoom(state, entry.roomId);
  const behaviour: PetBehaviour = { phase: 'idle', x: door.x, y: door.y, facing: pet.behaviour.facing,
    timerMs: greets ? content.tuning.greetingDelayMs : content.tuning.idleMs.min,
    target: null, verb: null, reaction: greets ? 'greeting' : null };
  const events: SimEvent[] = [...verbEndedOf(petId, pet.behaviour), { type: 'pet.outside', petId, outside },
    phaseChanged(petId, pet.behaviour.phase, behaviour)];
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

/** Tick step 2b (after doors, before pets): count the presence countdown down; at zero re-arm it and roll every house pet. */
export function stepPresence(content: Content, state: GameState, action: TickAction): RuleResult {
  const remaining = state.presence.rollInMs - action.dtMs;
  if (remaining > 0) return { state: { ...state, presence: { ...state.presence, rollInMs: remaining } }, events: [] };
  const rolls = state.presence.rolls + 1;
  const armed: GameState = { ...state, presence: { rollInMs: content.tuning.presenceRollMs, rolls } };
  return applyAll(content, armed, (petId, roomId) =>
    wantedOutside(content, armed, petId, roomId, () => presenceDraw(armed.session.seed, petId, rolls)));
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
type PetsOutside = GameState['session']['petsOutside'];
const MODES: readonly PetsOutside[] = ['roll', 'all', 'none'];

/** MEC-010 row 23 "Pets outside": sets the override; 'all' / 'none' apply at once in any scene (the own-room and ≥ 1 Heart
 * rules still hold), 'roll' leaves every pet where it is until the next timed roll. */
export function debugSetPetsOutside(content: Content, state: GameState, action: ActionOf<'debugSetPetsOutside'>): RuleResult {
  if (!MODES.includes(action.mode)) return { state, events: [{ type: 'action.rejected', action, reason: 'unknownMode' }] };
  const next = { ...state, session: { ...state.session, petsOutside: action.mode } };
  const applied: SimEvent = { type: 'debug.applied', action };
  if (action.mode === 'roll') return { state: next, events: [applied] };
  const noDraw = () => { throw new Error('mode all/none never draws'); };
  const result = applyAll(content, next, (petId, roomId) => wantedOutside(content, next, petId, roomId, noDraw));
  return { state: result.state, events: [applied, ...result.events] };
}

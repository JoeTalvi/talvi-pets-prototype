import type { Slot } from '../../content/schema/room';
import type { Content } from '../../content/types';
import type { Action } from '../actions';
import type { RuleResult } from '../events';
import type { CharmTypeId, GameState, RoomId, SlotId } from '../state';
import { placementsOf, playerSpace, spaceDef, spaceKey, withSpacePlacements, type SpaceRef } from '../space';
import { petUsingSlot } from './pets';

/** The change handed to every placement-chain link (core §6.1). */
export type PlacementChange =
  | { kind: 'placed'; space: SpaceRef; slotId: SlotId; typeId: CharmTypeId; replacedTypeId: CharmTypeId | null }
  | { kind: 'removed'; space: SpaceRef; slotId: SlotId; typeId: CharmTypeId };
/** `change === null` means the action was rejected and `state` is the input object. */
export type SlotsResult = RuleResult & { change: PlacementChange | null };

/** The slot of the player's space: the interior's room, or on the street an unlocked site (WORK-034-2). */
export function slotOf(content: Content, state: GameState, slotId: SlotId): Slot | null {
  if (state.scene.kind === 'interior' && !content.rooms[state.scene.roomId]) return null;
  const ref = playerSpace(content, state, slotId);
  return ref ? spaceDef(content, ref).slots.find(slot => slot.id === slotId) ?? null : null;
}

export function placementAt(_content: Content, state: GameState, roomId: RoomId, slotId: SlotId): CharmTypeId | null {
  return state.rooms[roomId]?.placements[slotId] ?? null;
}

function commonReason(content: Content, state: GameState, slotId: SlotId): string | null {
  if (state.mode !== 'design') return 'notDesignMode';
  if (state.dialogue.current !== null) return 'dialogueOpen';
  return slotOf(content, state, slotId) === null ? 'unknownSlot' : null;
}

function rejected(state: GameState, action: Action, reason: string): SlotsResult {
  return { state, events: [{ type: 'action.rejected', action, reason }], change: null };
}

/** DEC-043: copies available for placing `typeId` at a slot (a same-type replace re-uses the placed copy). */
function availableCopies(state: GameState, ref: SpaceRef, slotId: SlotId, typeId: CharmTypeId): number {
  return state.inventory.counts[typeId] + (placementsOf(state, ref)[slotId] === typeId ? 1 : 0);
}

function withCounts(state: GameState, deltas: [CharmTypeId, number][]): GameState {
  const counts = { ...state.inventory.counts };
  for (const [typeId, delta] of deltas) counts[typeId] += delta;
  return { ...state, inventory: { counts } };
}

/** MEC-007 strip record (DEC-043 / OQ-26): `typeId` just left `slotId` of `roomId`; when the resident earned a
 * Heart with it and no other slot of the room still holds it, queue it once and emit `charm.stripped`. */
function stripRecord(content: Content, state: GameState, roomId: RoomId, slotId: SlotId, typeId: CharmTypeId): SlotsResult['events'] {
  const petId = content.rooms[roomId]?.residentPetId;
  const pet = petId ? state.pets[petId] : undefined;
  if (!petId || !pet || !pet.heartCharms.includes(typeId)) return [];
  if (Object.values(state.rooms[roomId].placements).includes(typeId)) return [];
  return [{ type: 'charm.stripped', roomId, slotId, typeId, petId }];
}

function queueStripped(state: GameState, petId: string, typeId: CharmTypeId): GameState {
  const pet = state.pets[petId];
  if (pet.strippedPending.includes(typeId)) return state;
  return { ...state, pets: { ...state.pets, [petId]: { ...pet, strippedPending: [...pet.strippedPending, typeId] } } };
}

/** Placing a pending Heart charm back into its pet's room clears it from the queue (no event). */
function clearStripped(content: Content, state: GameState, roomId: RoomId, typeId: CharmTypeId): GameState {
  const petId = content.rooms[roomId]?.residentPetId;
  const pet = petId ? state.pets[petId] : undefined;
  if (!petId || !pet || !pet.strippedPending.includes(typeId)) return state;
  return { ...state, pets: { ...state.pets,
    [petId]: { ...pet, strippedPending: pet.strippedPending.filter(id => id !== typeId) } } };
}

/** Applies the strip record for a type that left a slot: the queue write and its event (or nothing). */
function afterLeave(content: Content, state: GameState, ref: SpaceRef, slotId: SlotId,
  typeId: CharmTypeId): { state: GameState; events: SlotsResult['events'] } {
  // The stripped-charm record stays room-only (WORK-034-2, tier 1): a site's Heart charms are not tracked.
  if (ref.kind !== 'room') return { state, events: [] };
  const roomId = ref.roomId;
  const events = stripRecord(content, state, roomId, slotId, typeId);
  if (events.length === 0) return { state, events };
  return { state: queueStripped(state, content.rooms[roomId].residentPetId, typeId), events };
}

/** WORK-034-2: write a placement into `ref` (counts, strip record) with no precondition; `debugFillSpace` shares it. */
export function placeAt(content: Content, state: GameState, ref: SpaceRef, slotId: SlotId, typeId: CharmTypeId): SlotsResult {
  const replacedTypeId = placementsOf(state, ref)[slotId] ?? null;
  const swapped = replacedTypeId === typeId ? state
    : withCounts(state, replacedTypeId === null ? [[typeId, -1]] : [[typeId, -1], [replacedTypeId, 1]]);
  let next = withSpacePlacements(swapped, ref, { ...placementsOf(state, ref), [slotId]: typeId });
  if (ref.kind === 'room') next = clearStripped(content, next, ref.roomId, typeId);
  const left = replacedTypeId !== null && replacedTypeId !== typeId
    ? afterLeave(content, next, ref, slotId, replacedTypeId) : { state: next, events: [] };
  return {
    state: left.state,
    events: [{ type: 'charm.placed', ...spaceKey(ref), slotId, typeId, replacedTypeId }, ...left.events],
    change: { kind: 'placed', space: ref, slotId, typeId, replacedTypeId },
  };
}

/** MEC-005 R5, R7, R8 + DEC-043: preconditions in order; placing spends a copy, a replaced different type
 * returns one; a same-type replace is applied with no count change. */
export function applyPlace(content: Content, state: GameState,
  action: Extract<Action, { type: 'placeCharm' }>): SlotsResult {
  const { slotId, typeId } = action;
  const common = commonReason(content, state, slotId);
  if (common) return rejected(state, action, common);
  const type = content.charms.types.find(candidate => candidate.id === typeId);
  if (!type || !Object.hasOwn(state.inventory.counts, typeId)) return rejected(state, action, 'typeNotOwned');
  if (type.sizeClass !== slotOf(content, state, slotId)!.sizeClass) return rejected(state, action, 'sizeClassMismatch');
  const ref = playerSpace(content, state, slotId)!;
  if (availableCopies(state, ref, slotId, typeId) <= 0) return rejected(state, action, 'noCopiesLeft');
  return placeAt(content, state, ref, slotId, typeId);
}

/** MEC-005 R6, R9 + DEC-043: removing returns the copy; `interruptedPetId` via `petUsingSlot` (rooms only). */
export function applyRemove(content: Content, state: GameState,
  action: Extract<Action, { type: 'removeCharm' }>): SlotsResult {
  const { slotId } = action;
  const common = commonReason(content, state, slotId);
  if (common) return rejected(state, action, common);
  const ref = playerSpace(content, state, slotId)!;
  const typeId = placementsOf(state, ref)[slotId] ?? null;
  if (typeId === null) return rejected(state, action, 'slotEmpty');
  const placements = { ...placementsOf(state, ref) };
  delete placements[slotId];
  const left = afterLeave(content, withCounts(withSpacePlacements(state, ref, placements), [[typeId, 1]]), ref, slotId, typeId);
  const interruptedPetId = ref.kind === 'room' ? petUsingSlot(content, state, ref.roomId, slotId) : null;
  return {
    state: left.state,
    events: [{ type: 'charm.removed', ...spaceKey(ref), slotId, typeId, interruptedPetId }, ...left.events],
    change: { kind: 'removed', space: ref, slotId, typeId },
  };
}

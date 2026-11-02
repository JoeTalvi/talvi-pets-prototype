import type { Slot } from '../../content/schema/room';
import type { Content } from '../../content/types';
import type { Action } from '../actions';
import type { RuleResult } from '../events';
import type { CharmTypeId, GameState, RoomId, SlotId } from '../state';
import { petUsingSlot } from './pets';

/** The change handed to every placement-chain link (core §6.1). */
export type PlacementChange =
  | { kind: 'placed'; slotId: SlotId; typeId: CharmTypeId; replacedTypeId: CharmTypeId | null }
  | { kind: 'removed'; slotId: SlotId; typeId: CharmTypeId };
/** `change === null` means the action was rejected and `state` is the input object. */
export type SlotsResult = RuleResult & { change: PlacementChange | null };

export function slotOf(content: Content, state: GameState, slotId: SlotId): Slot | null {
  if (state.scene.kind !== 'interior') return null;
  return content.rooms[state.scene.roomId]?.slots.find(slot => slot.id === slotId) ?? null;
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

function withPlacements(state: GameState, roomId: RoomId, placements: Record<SlotId, CharmTypeId>): GameState {
  return { ...state, rooms: { ...state.rooms, [roomId]: { ...state.rooms[roomId], placements } } };
}

/** DEC-043: copies available for placing `typeId` at a slot (a same-type replace re-uses the placed copy). */
function availableCopies(state: GameState, roomId: RoomId, slotId: SlotId, typeId: CharmTypeId): number {
  return state.inventory.counts[typeId] + (state.rooms[roomId].placements[slotId] === typeId ? 1 : 0);
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
function afterLeave(content: Content, state: GameState, roomId: RoomId, slotId: SlotId,
  typeId: CharmTypeId): { state: GameState; events: SlotsResult['events'] } {
  const events = stripRecord(content, state, roomId, slotId, typeId);
  if (events.length === 0) return { state, events };
  return { state: queueStripped(state, content.rooms[roomId].residentPetId, typeId), events };
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
  const roomId = (state.scene as { roomId: RoomId }).roomId;
  if (availableCopies(state, roomId, slotId, typeId) <= 0) return rejected(state, action, 'noCopiesLeft');
  const replacedTypeId = placementAt(content, state, roomId, slotId);
  const swapped = replacedTypeId === typeId ? state
    : withCounts(state, replacedTypeId === null ? [[typeId, -1]] : [[typeId, -1], [replacedTypeId, 1]]);
  let next = withPlacements(swapped, roomId, { ...state.rooms[roomId].placements, [slotId]: typeId });
  next = clearStripped(content, next, roomId, typeId);
  const left = replacedTypeId !== null && replacedTypeId !== typeId
    ? afterLeave(content, next, roomId, slotId, replacedTypeId) : { state: next, events: [] };
  return {
    state: left.state,
    events: [{ type: 'charm.placed', roomId, slotId, typeId, replacedTypeId }, ...left.events],
    change: { kind: 'placed', slotId, typeId, replacedTypeId },
  };
}

/** MEC-005 R6, R9 + DEC-043: removing returns the copy; `interruptedPetId` via `petUsingSlot`. */
export function applyRemove(content: Content, state: GameState,
  action: Extract<Action, { type: 'removeCharm' }>): SlotsResult {
  const { slotId } = action;
  const common = commonReason(content, state, slotId);
  if (common) return rejected(state, action, common);
  const roomId = (state.scene as { roomId: RoomId }).roomId;
  const typeId = placementAt(content, state, roomId, slotId);
  if (typeId === null) return rejected(state, action, 'slotEmpty');
  const placements = { ...state.rooms[roomId].placements };
  delete placements[slotId];
  const left = afterLeave(content, withCounts(withPlacements(state, roomId, placements), [[typeId, 1]]), roomId, slotId, typeId);
  return {
    state: left.state,
    events: [{ type: 'charm.removed', roomId, slotId, typeId,
      interruptedPetId: petUsingSlot(content, state, roomId, slotId) }, ...left.events],
    change: { kind: 'removed', slotId, typeId },
  };
}

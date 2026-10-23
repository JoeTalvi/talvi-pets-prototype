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

/** MEC-005 R5, R7, R8: preconditions in order; a same-type replace is applied. */
export function applyPlace(content: Content, state: GameState,
  action: Extract<Action, { type: 'placeCharm' }>): SlotsResult {
  const { slotId, typeId } = action;
  const common = commonReason(content, state, slotId);
  if (common) return rejected(state, action, common);
  const type = content.charms.types.find(candidate => candidate.id === typeId);
  if (!type || !state.inventory.ownedTypeIds.includes(typeId)) return rejected(state, action, 'typeNotOwned');
  if (type.sizeClass !== slotOf(content, state, slotId)!.sizeClass) return rejected(state, action, 'sizeClassMismatch');
  const roomId = (state.scene as { roomId: RoomId }).roomId;
  const replacedTypeId = placementAt(content, state, roomId, slotId);
  return {
    state: withPlacements(state, roomId, { ...state.rooms[roomId].placements, [slotId]: typeId }),
    events: [{ type: 'charm.placed', roomId, slotId, typeId, replacedTypeId }],
    change: { kind: 'placed', slotId, typeId, replacedTypeId },
  };
}

/** MEC-005 R6, R9: `interruptedPetId` via `petUsingSlot`. */
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
  return {
    state: withPlacements(state, roomId, placements),
    events: [{ type: 'charm.removed', roomId, slotId, typeId,
      interruptedPetId: petUsingSlot(content, state, roomId, slotId) }],
    change: { kind: 'removed', slotId, typeId },
  };
}

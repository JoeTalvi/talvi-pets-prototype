import type { Content } from '../../content/types';
import type { GameState, PetId, RoomId, SlotId } from '../state';

/** MEC-007 §3 selectors only; pet behaviour lands in WORK-003-3. */
export function residentPet(content: Content, state: GameState): PetId | null {
  return state.scene.kind === 'interior' ? content.rooms[state.scene.roomId]?.residentPetId ?? null : null;
}

export function petUsingSlot(content: Content, state: GameState, roomId: RoomId, slotId: SlotId): PetId | null {
  const petId = content.rooms[roomId]?.residentPetId;
  const behaviour = petId ? state.pets[petId]?.behaviour : undefined;
  if (!petId || !behaviour || behaviour.phase !== 'using' || behaviour.target === null) return null;
  return 'slotId' in behaviour.target && behaviour.target.slotId === slotId ? petId : null;
}

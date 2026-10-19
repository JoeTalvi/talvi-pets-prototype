import { ContentError, type Content } from '../../content/load';
import type { SimEvent } from '../events';
import type { GameState, RoomId } from '../state';

/** MEC-006 R1–R3: derived per room; tags, pet preferences and visibility never score. */
export function starsOf(content: Content, state: GameState, roomId: RoomId): {
  points: number; max: number;
} {
  const room = content.rooms[roomId];
  if (!room) throw new ContentError([{
    code: 'custom', file: `rooms/${roomId}.json`, path: ['id'], message: `Unknown room id "${roomId}"`,
  }]);
  const known = new Set(content.charms.types.map(type => type.id));
  const counts = new Map<string, number>();
  for (const [slotId, typeId] of Object.entries(state.rooms[roomId].placements)) {
    if (!known.has(typeId)) throw new ContentError([{
      code: 'custom', file: `rooms/${roomId}.json`, path: ['placements', slotId],
      message: `Unknown charm type id "${typeId}"`,
    }]);
    counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  }
  const { starsFirstCopy, starsRepeat } = content.tuning;
  const points = [...counts.values()].reduce((sum, count) => sum + starsFirstCopy + (count - 1) * starsRepeat, 0);
  return { points, max: starsFirstCopy * room.slots.length };
}

/** MEC-006 R4: called later by the complete placement dispatch, after its placement event. */
export function afterRoomChange(content: Content, before: GameState, after: GameState,
  roomId: RoomId): SimEvent[] {
  const from = starsOf(content, before, roomId).points;
  const { points: to, max } = starsOf(content, after, roomId);
  return to === from ? [] : [{ type: 'stars.changed', roomId, from, to, delta: to - from, max }];
}

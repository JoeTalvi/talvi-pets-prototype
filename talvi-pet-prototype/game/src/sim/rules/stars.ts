import { ContentError, type Content } from '../../content/load';
import type { SimEvent } from '../events';
import type { GameState, RoomId } from '../state';
import { placementsOf, roomRef, spaceDef, type SpaceRef } from '../space';

const fileOf = (ref: SpaceRef) => ref.kind === 'room' ? `rooms/${ref.roomId}.json` : 'street.json';

/** MEC-006 R1–R3: derived per space (a room or an outdoor site, WORK-034-2); tags, pet preferences and visibility
 * never score. One formula for both kinds. */
export function starsOfSpace(content: Content, state: GameState, ref: SpaceRef): { points: number; max: number } {
  if (ref.kind === 'room' && !content.rooms[ref.roomId]) throw new ContentError([{
    code: 'custom', file: fileOf(ref), path: ['id'], message: `Unknown room id "${ref.roomId}"`,
  }]);
  const known = new Set(content.charms.types.map(type => type.id));
  const counts = new Map<string, number>();
  for (const [slotId, typeId] of Object.entries(placementsOf(state, ref))) {
    if (!known.has(typeId)) throw new ContentError([{
      code: 'custom', file: fileOf(ref), path: ['placements', slotId], message: `Unknown charm type id "${typeId}"`,
    }]);
    counts.set(typeId, (counts.get(typeId) ?? 0) + 1);
  }
  const { starsFirstCopy, starsRepeat } = content.tuning;
  const points = [...counts.values()].reduce((sum, count) => sum + starsFirstCopy + (count - 1) * starsRepeat, 0);
  return { points, max: starsFirstCopy * spaceDef(content, ref).slots.length };
}

/** CONTRACT-SELECT `starsOf` (room-keyed signature kept). */
export function starsOf(content: Content, state: GameState, roomId: RoomId): { points: number; max: number } {
  return starsOfSpace(content, state, roomRef(roomId));
}

/** MEC-006 R4: after the placement event; rooms emit `stars.changed`, sites `space.stars.changed`. */
export function afterRoomChange(content: Content, before: GameState, after: GameState, space: SpaceRef | RoomId): SimEvent[] {
  const ref = typeof space === 'string' ? roomRef(space) : space;
  const from = starsOfSpace(content, before, ref).points;
  const { points: to, max } = starsOfSpace(content, after, ref);
  if (to === from) return [];
  return ref.kind === 'room' ? [{ type: 'stars.changed', roomId: ref.roomId, from, to, delta: to - from, max }]
    : [{ type: 'space.stars.changed', siteId: ref.siteId, from, to, delta: to - from, max }];
}

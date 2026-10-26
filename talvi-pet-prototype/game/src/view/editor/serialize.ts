import type { Point } from '@content/schema/common';
import type { Door } from '@content/schema/common';
import type { Room, Slot } from '@content/schema/room';

const point = (p: Point) => ({ x: p.x, y: p.y });
const facingPoint = <F extends string>(p: Point & { facing: F }) => ({ x: p.x, y: p.y, facing: p.facing });
const door = (d: Door) => ({
  id: d.id, rect: { x: d.rect.x, y: d.rect.y, w: d.rect.w, h: d.rect.h },
  target: d.target.scene === 'street' ? { scene: d.target.scene, doorId: d.target.doorId } : { scene: d.target.scene, roomId: d.target.roomId, doorId: d.target.doorId },
  spawn: facingPoint(d.spawn),
});
const slot = (s: Slot) => ({
  id: s.id, sizeClass: s.sizeClass, x: s.x, y: s.y,
  ...(s.wall !== undefined ? { wall: s.wall } : {}),
  ...(s.depthOverride !== undefined ? { depthOverride: s.depthOverride } : {}),
  anchor: facingPoint(s.anchor), adjacent: [...s.adjacent],
  ...(s.floorY !== undefined ? { floorY: s.floorY } : {}),
});

/**
 * TOOL-002 (a) "Output": the room rebuilt in `RoomSchema` / `SlotSchema` / `DoorSchema` / `AnchorSchema` key order (optional keys
 * omitted when absent), arrays in authored order, 2-space indent, trailing newline. Wander points keep the authored `id, x, y` order.
 */
export function serializeRoom(room: Room): string {
  const ordered = {
    id: room.id, name: room.name, background: room.background,
    walkArea: room.walkArea.map(point), doors: room.doors.map(door), slots: room.slots.map(slot),
    wanderPoints: room.wanderPoints.map(w => ({ id: w.id, x: w.x, y: w.y })),
    petSpawn: facingPoint(room.petSpawn), residentPetId: room.residentPetId,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

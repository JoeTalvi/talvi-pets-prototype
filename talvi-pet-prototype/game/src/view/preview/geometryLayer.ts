import type Phaser from 'phaser';
import type { Point } from '@content/schema/common';
import type { Room } from '@content/schema/room';
import type { Street } from '@content/schema/street';
import type { ViewContext } from '../context';
import { BAND, COLOURS, LABEL_STYLE, objectBag, PREVIEW_DEPTH, roomOf, spawnArrow, type PreviewLayer } from './layer';

type Bag = ReturnType<typeof objectBag>;
type Rect = { x: number; y: number; w: number; h: number };

/** Content points are plain {x, y}, not Vector2: draw edges with `lineBetween`. */
function polyline(g: Phaser.GameObjects.Graphics, points: readonly Point[]): void {
  for (let i = 1; i < points.length; i++) g.lineBetween(points[i - 1].x, points[i - 1].y, points[i].x, points[i].y);
}
const polygon = (g: Phaser.GameObjects.Graphics, points: readonly Point[], colour: number) =>
  polyline(g.lineStyle(3, colour, 1), [...points, points[0]]);
const label = (scene: Phaser.Scene, bag: Bag, x: number, y: number, text: string) =>
  bag.add(scene.add.text(x, y, text, LABEL_STYLE).setOrigin(0, 1).setDepth(PREVIEW_DEPTH + 1));
const door = (g: Phaser.GameObjects.Graphics, rect: Rect) => g.lineStyle(3, COLOURS.door, 1).strokeRect(rect.x, rect.y, rect.w, rect.h);
const cross = (g: Phaser.GameObjects.Graphics, p: Point, colour: number) =>
  g.lineStyle(3, colour, 1).lineBetween(p.x - 12, p.y - 12, p.x + 12, p.y + 12).lineBetween(p.x - 12, p.y + 12, p.x + 12, p.y - 12);

/** TECH-006 band: guides at world y 128 and 951 across the 1920 art. */
function band(g: Phaser.GameObjects.Graphics): void {
  g.lineStyle(2, COLOURS.band, 1).lineBetween(0, BAND.top, 1920, BAND.top).lineBetween(0, BAND.bottom, 1920, BAND.bottom);
}

/** Presentation §3.2 joystick rect from `tuning.joystick` in viewport space (centred at (x, H − bottomOffset)). */
function joystickRect(scene: Phaser.Scene, bag: Bag, context: ViewContext): Phaser.GameObjects.Graphics {
  const { x, bottomOffset, baseDiameter } = context.content.tuning.joystick;
  const cy = scene.scale.gameSize.height - bottomOffset;
  const g = bag.add(scene.add.graphics().setScrollFactor(0).setDepth(PREVIEW_DEPTH));
  g.lineStyle(2, COLOURS.band, 1).strokeRect(x - baseDiameter / 2, cy - baseDiameter / 2, baseDiameter, baseDiameter);
  g.setData('rect', { x: x - baseDiameter / 2, y: cy - baseDiameter / 2, w: baseDiameter, h: baseDiameter });
  return g;
}

function drawRoom(scene: Phaser.Scene, bag: Bag, g: Phaser.GameObjects.Graphics, room: Room): void {
  polygon(g, room.walkArea, COLOURS.walk);
  for (const d of room.doors) { door(g, d.rect); spawnArrow(g, d.spawn, COLOURS.door); label(scene, bag, d.rect.x, d.rect.y - 2, d.id); }
  spawnArrow(g, room.petSpawn, COLOURS.anchor);
  g.lineStyle(3, COLOURS.anchor, 1).strokeCircle(room.petSpawn.x, room.petSpawn.y, 14);
  label(scene, bag, room.petSpawn.x + 16, room.petSpawn.y, 'petSpawn');
  for (const w of room.wanderPoints) { g.fillStyle(COLOURS.walk, 1).fillCircle(w.x, w.y, 7); label(scene, bag, w.x + 10, w.y, w.id); }
  // Authored `adjacent` lines between slot base points, each unordered pair once.
  const byId = new Map(room.slots.map(s => [s.id, s]));
  g.lineStyle(1, COLOURS.slot, 1);
  for (const s of room.slots) for (const id of s.adjacent) {
    const t = byId.get(id);
    if (t && s.id < id) g.lineBetween(s.x, s.y, t.x, t.y);
  }
}

function drawStreet(scene: Phaser.Scene, bag: Bag, g: Phaser.GameObjects.Graphics, street: Street): void {
  polygon(g, street.walkArea, COLOURS.walk);
  spawnArrow(g, street.playerSpawn, COLOURS.anchor);
  label(scene, bag, street.playerSpawn.x + 16, street.playerSpawn.y, 'playerSpawn');
  for (const house of street.houses) {
    door(g, house.door.rect); spawnArrow(g, house.door.spawn, COLOURS.door);
    label(scene, bag, house.door.rect.x, house.door.rect.y - 2, house.door.id);
    cross(g, house.attentionAnchor, COLOURS.slot);
    polyline(g.lineStyle(2, COLOURS.anchor, 1), house.arrivalPath);
  }
}

/** TOOL-002 geometry layer (rooms) and its read-only street variant (QT-2 (a)). */
export function createGeometryLayer(kind: 'interior' | 'street'): PreviewLayer & { joystick(): Phaser.GameObjects.Graphics | null } {
  const bag = objectBag();
  let joystick: Phaser.GameObjects.Graphics | null = null;
  const hide = () => { bag.clear(); joystick = null; };
  return {
    objects: bag.objects, hide, destroy: hide, joystick: () => joystick,
    show(scene, context) {
      const g = bag.add(scene.add.graphics().setDepth(PREVIEW_DEPTH));
      band(g);
      if (kind === 'interior') drawRoom(scene, bag, g, roomOf(scene));
      else drawStreet(scene, bag, g, context.content.street);
      joystick = joystickRect(scene, bag, context);
    },
  };
}

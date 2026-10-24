import Phaser from 'phaser';
import type { Room, Slot } from '@content/schema/room';
import { outlinePoints } from '../objects/SlotOutline';
import { BAND, COLOURS, LABEL_STYLE, PREVIEW_DEPTH, spawnArrow } from '../preview/layer';
import type { InteriorScene } from '../scenes/InteriorScene';

/** TOOL-002 (a) "Layers drawn": the editor's handles draw above the preview layers. */
export const EDITOR_DEPTH = PREVIEW_DEPTH + 100;
export const HANDLE_R = 10;
export const GHOST_ALPHA = 0.6;
const CLASS_COLOUR: Record<Slot['sizeClass'], number> = { small: COLOURS.slot, large: COLOURS.door, wall: COLOURS.band };

export type Selection = { kind: string; id: string } | null;
export type HandleTarget = { selection(): Selection; adjacencyFirst(): string | null; down(key: string, pointer: Phaser.Input.Pointer): void };
export type Handles = {
  readonly objects: Map<string, Phaser.GameObjects.GameObject>;
  readonly graphics: Phaser.GameObjects.Graphics;
  render(room: Room, skipKey?: string): void;
  destroy(): void;
};

/** The resident pet's idle frame (petsLayer.ts recipe); a missing sheet records one `app.error` instead of drawing `missing` silently. */
function ghostTexture(scene: InteriorScene, room: Room, missing: { recorded: boolean }): { key: string; frame?: string | number } {
  const own = scene.pet?.idleFrameTexture();
  if (own) return own;
  const sheet = `pets/${room.residentPetId}-sheet`;
  if (scene.textures.exists(sheet)) return { key: sheet, frame: 0 };
  if (!missing.recorded) { missing.recorded = true; scene.context.log.record('app.error', { message: `room editor: anchor ghost texture ${sheet} missing`, stack: '' }); }
  return { key: 'missing' };
}

function drawStatic(g: Phaser.GameObjects.Graphics, room: Room, target: HandleTarget): void {
  g.clear().lineStyle(2, COLOURS.band, 1).lineBetween(0, BAND.top, 1920, BAND.top).lineBetween(0, BAND.bottom, 1920, BAND.bottom);
  g.lineStyle(3, COLOURS.walk, 1).strokePoints([...room.walkArea, room.walkArea[0]].map(p => new Phaser.Math.Vector2(p.x, p.y)));
  const sel = target.selection(), first = target.adjacencyFirst();
  for (const slot of room.slots) {
    const points = outlinePoints(slot);
    const hot = (sel?.id === slot.id && (sel.kind === 'slot' || sel.kind === 'anchor')) || first === slot.id;
    g.lineStyle(hot ? 4 : 2, hot ? COLOURS.bad : CLASS_COLOUR[slot.sizeClass], 1).strokePoints([...points, points[0]]);
  }
  for (const door of room.doors) {
    g.lineStyle(sel?.id === door.id ? 4 : 2, sel?.id === door.id ? COLOURS.bad : COLOURS.door, 1).strokeRect(door.rect.x, door.rect.y, door.rect.w, door.rect.h);
    spawnArrow(g, door.spawn, COLOURS.door);
  }
  spawnArrow(g, room.petSpawn, COLOURS.anchor);
  for (const slot of room.slots) spawnArrow(g, slot.anchor, COLOURS.anchor);
  if (sel?.kind === 'vertex') { const v = room.walkArea[Number(sel.id)]; if (v) g.lineStyle(3, COLOURS.bad, 1).strokeCircle(v.x, v.y, HANDLE_R + 6); }
  if (sel && ['petSpawn', 'wander', 'doorSpawn'].includes(sel.kind)) {
    const p = sel.kind === 'petSpawn' ? room.petSpawn : sel.kind === 'wander' ? room.wanderPoints.find(w => w.id === sel.id) : room.doors.find(d => d.id === sel.id)?.spawn;
    if (p) g.lineStyle(3, COLOURS.bad, 1).strokeCircle(p.x, p.y, HANDLE_R + 6);
  }
}

type Spec = { key: string; make: () => Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Depth; drag: boolean };

function specsFor(scene: InteriorScene, room: Room, ghost: () => { key: string; frame?: string | number }): Spec[] {
  const dot = (x: number, y: number, colour: number, r = HANDLE_R) => () => scene.add.circle(x, y, r, colour, 1).setStrokeStyle(2, 0xffffff, 1);
  const specs: Spec[] = [];
  room.walkArea.forEach((p, i) => {
    const q = room.walkArea[(i + 1) % room.walkArea.length];
    specs.push({ key: `vertex:${i}`, make: dot(p.x, p.y, COLOURS.walk), drag: true });
    specs.push({ key: `mid:${i}`, make: dot((p.x + q.x) / 2, (p.y + q.y) / 2, COLOURS.walk, 6), drag: false });
  });
  for (const d of room.doors) {
    specs.push({ key: `door:${d.id}`, make: () => scene.add.rectangle(d.rect.x, d.rect.y, d.rect.w, d.rect.h, COLOURS.door, 0.25).setOrigin(0), drag: true });
    specs.push({ key: `doorSize:${d.id}`, make: () => scene.add.rectangle(d.rect.x + d.rect.w, d.rect.y + d.rect.h, 14, 14, COLOURS.door, 1), drag: true });
    specs.push({ key: `doorSpawn:${d.id}`, make: dot(d.spawn.x, d.spawn.y, COLOURS.door), drag: true });
  }
  for (const s of room.slots) {
    specs.push({ key: `anchor:${s.id}`, drag: true, make: () => { const t = ghost(); return scene.add.image(s.anchor.x, s.anchor.y, t.key, t.frame).setOrigin(0.5, 1).setAlpha(GHOST_ALPHA).setFlipX(s.anchor.facing === 'left'); } });
    specs.push({ key: `slot:${s.id}`, make: dot(s.x, s.y, CLASS_COLOUR[s.sizeClass]), drag: true });
  }
  specs.push({ key: 'petSpawn:petSpawn', make: dot(room.petSpawn.x, room.petSpawn.y, COLOURS.anchor), drag: true });
  for (const w of room.wanderPoints) specs.push({ key: `wander:${w.id}`, make: dot(w.x, w.y, COLOURS.walk), drag: true });
  return specs;
}

/** Rebuilt from the draft after every change; the handle being dragged is kept (Phaser keeps dragging that object). */
export function createHandles(scene: InteriorScene, target: HandleTarget): Handles {
  const objects = new Map<string, Phaser.GameObjects.GameObject>();
  const labels: Phaser.GameObjects.Text[] = [];
  const graphics = scene.add.graphics().setDepth(EDITOR_DEPTH);
  const missing = { recorded: false };
  const render = (room: Room, skipKey?: string) => {
    drawStatic(graphics, room, target);
    for (const [key, o] of objects) if (key !== skipKey) { o.destroy(); objects.delete(key); }
    for (const t of labels.splice(0)) t.destroy();
    specsFor(scene, room, () => ghostTexture(scene, room, missing)).forEach((spec, i) => {
      if (spec.key === skipKey) return;
      const o = spec.make().setDepth(EDITOR_DEPTH + 1 + i / 1000);
      o.setInteractive(spec.drag ? { draggable: true } : undefined);
      o.setData('key', spec.key);
      o.on('pointerdown', (p: Phaser.Input.Pointer) => target.down(spec.key, p));
      objects.set(spec.key, o);
    });
    labels.push(scene.add.text(24, 172, 'ROOM EDITOR · drag handles · Alt-drag anchor · N+1/2/3 add · A adjacency · F flip · Del · ⌘Z', LABEL_STYLE).setDepth(EDITOR_DEPTH + 2));
  };
  return { objects, graphics, render, destroy() { for (const o of objects.values()) o.destroy(); objects.clear(); for (const t of labels.splice(0)) t.destroy(); graphics.destroy(); } };
}

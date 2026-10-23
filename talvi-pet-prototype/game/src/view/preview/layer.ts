import type Phaser from 'phaser';
import type { Point } from '@content/schema/common';
import type { ViewContext } from '../context';

/** TOOL-002 stage 1 layer names (debug row 16, `ui.preview {layer}`). */
export const PREVIEW_LAYERS = ['fill', 'pets', 'geometry', 'segments'] as const;
export type PreviewLayerName = typeof PREVIEW_LAYERS[number];
export type PreviewFlags = Record<PreviewLayerName, boolean>;
export const noPreview = (): PreviewFlags => ({ fill: false, pets: false, geometry: false, segments: false });

/** Presentation §6.1: preview layers draw above everything. */
export const PREVIEW_DEPTH = 10_000;

/** TECH-006 / ASSET-012 amendment: gameplay geometry stays inside world y 128..951. */
export const BAND = { top: 128, bottom: 951 } as const;

/** Phase 3 harness palette (tools/asset-trial.ts `drawGuides`), reused for continuity. */
export const COLOURS = { band: 0x287dbe, walk: 0x139151, slot: 0xdc8422, anchor: 0x087f9b, door: 0xaa368b, bad: 0xd62828, ok: 0x139151 } as const;
export const LABEL_STYLE = { fontFamily: 'monospace', fontSize: '15px', color: '#ffffff', backgroundColor: 'rgba(0,0,0,0.55)' };

/** One view-only layer: built on `show`, destroyed on `hide` (rebuilt on every toggle). Never dispatches. */
export type PreviewLayer = {
  readonly objects: readonly Phaser.GameObjects.GameObject[];
  show(scene: Phaser.Scene, context: ViewContext): void;
  hide(): void;
  destroy(): void;
};

/** Holds the objects one layer created so `hide` can destroy them all. */
export function objectBag() {
  const objects: Phaser.GameObjects.GameObject[] = [];
  return {
    objects,
    add<T extends Phaser.GameObjects.GameObject>(object: T): T { objects.push(object); return object; },
    clear(): void { for (const o of objects.splice(0)) o.destroy(); },
  };
}

const ARROW: Record<string, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };

/** A spawn point with a 12 px facing arrow. */
export function spawnArrow(g: Phaser.GameObjects.Graphics, p: Point & { facing: string }, colour: number): void {
  const [dx, dy] = ARROW[p.facing] ?? [0, 1];
  g.fillStyle(colour, 1).fillCircle(p.x, p.y, 6);
  g.lineStyle(3, colour, 1).lineBetween(p.x, p.y, p.x + dx * 24, p.y + dy * 24);
  g.fillTriangle(p.x + dx * 36, p.y + dy * 36, p.x + dx * 24 - dy * 6, p.y + dy * 24 - dx * 6, p.x + dx * 24 + dy * 6, p.y + dy * 24 + dx * 6);
}

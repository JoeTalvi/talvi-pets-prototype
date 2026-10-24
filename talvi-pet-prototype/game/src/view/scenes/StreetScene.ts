import Phaser from 'phaser';
import { attentionVisible, displayedPhase } from '@sim/select';
import type { ProjectId } from '@sim/state';
import { recordPointer, type PointerSample } from '@app/input/pointerRouting';
import { AttentionIcon, HouseSprite } from '../objects/HouseSprite';
import { depthAtBase } from '../depth';
import { MISSING_TEXTURE } from './BootScene';
import type { ScenePointer } from './InteriorScene';
import { WorldScene } from './WorldScene';

export type { ScenePointer };

/** ASSET-009 tile size: the rect a tile covers when its texture is missing. */
export const TILE_SIZE = { w: 320, h: 213 } as const;
export const GROUND_DEPTH = -1;
type Rect = { x: number; y: number; w: number; h: number };

/** Presentation §4.2 street column (plus `celebration.stepped`, when `displayedPhase` moves to `toPhase`). */
const REFRESH_ON = ['phase.reached', 'completeNow.shown', 'completeNow.taken', 'celebration.started', 'celebration.stepped',
  'celebration.ended', 'rewards.collected', 'arrival.started', 'arrival.finished', 'debug.applied'] as const;

/** Presentation §5.3: the axis-aligned union of the given rects. */
export function unionRect(rects: readonly Rect[]): Rect {
  if (rects.length === 0) throw new Error('street.groundTiles is empty: no camera bounds');
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  return { x, y, w: Math.max(...rects.map(r => r.x + r.w)) - x, h: Math.max(...rects.map(r => r.y + r.h)) - y };
}

/** Presentation §4 Street: ground tiles, props and houses from `street.json`, house textures and attention icons from state. */
export class StreetScene extends WorldScene {
  protected readonly previewKind = 'street';
  houses = new Map<ProjectId, HouseSprite>();
  icons = new Map<ProjectId, AttentionIcon>();
  tiles: Phaser.GameObjects.Image[] = [];
  private downs = new Map<number, PointerSample>();
  private joystickPointer: number | null = null;
  constructor() { super('Street'); }
  init(): void {
    this.transitioning = false;
    this.houses = new Map();
    this.icons = new Map();
    this.tiles = [];
    this.downs = new Map();
    this.joystickPointer = null;
  }
  drawWorld(): void {
    const { street } = this.context.content;
    const rects = street.groundTiles.map(tile => this.drawTile(tile));
    for (const prop of street.props) this.add.image(prop.x, prop.y, this.keyOf(prop.sprite)).setOrigin(0.5, 1).setDepth(depthAtBase(prop.y));
    for (const house of street.houses) {
      const sprite = new HouseSprite(this, house, displayedPhase(this.context.content, this.context.store.getState(), house.projectId));
      this.houses.set(house.projectId, sprite);
      this.icons.set(house.projectId, sprite.icon);
    }
    const bounds = unionRect(rects);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.w, bounds.h);
    this.refreshHouses();
  }
  private keyOf(key: string): string { return this.textures.exists(key) ? key : MISSING_TEXTURE; }
  private drawTile(tile: { sprite: string; x: number; y: number }): Rect {
    const key = this.keyOf(tile.sprite);
    const image = this.add.image(tile.x, tile.y, key).setOrigin(0, 0).setDepth(GROUND_DEPTH);
    if (key === MISSING_TEXTURE) image.setDisplaySize(TILE_SIZE.w, TILE_SIZE.h);
    this.tiles.push(image);
    return key === MISSING_TEXTURE ? { x: tile.x, y: tile.y, ...TILE_SIZE } : { x: tile.x, y: tile.y, w: image.frame.width, h: image.frame.height };
  }
  /** Mec-002 §2.4: each icon iff `attentionVisible`; each house at `displayedPhase` (order fork 4: WORK-020-2 owns the cutscene swap). */
  refreshHouses(): void {
    const { content, store } = this.context;
    const state = store.getState();
    for (const [projectId, house] of this.houses) {
      house.icon.setVisible(attentionVisible(content, state, projectId));
      const phase = displayedPhase(content, state, projectId);
      if (phase !== house.phase) house.setPhase(phase);
    }
  }
  /** Order fork 3: a house (or its icon) is a tap target iff its icon is visible; the icon wins over the sprites. */
  private targetAt(x: number, y: number): ProjectId | null {
    const { content, store } = this.context;
    const state = store.getState();
    const targets = [...this.houses.values()].filter(h => attentionVisible(content, state, h.projectId));
    const onIcon = targets.find(h => h.icon.contains(x, y));
    if (onIcon) return onIcon.projectId;
    return targets.sort((a, b) => b.depth - a.depth).find(h => h.hitContains(x, y))?.projectId ?? null;
  }
  /** Presentation §3.1: a pointer the joystick captured is not classified. */
  pointerDown = (p: ScenePointer): void => {
    if (this.joystick.active && this.joystickPointer === null) { this.joystickPointer = p.id; return; }
    this.downs.set(p.id, { x: p.worldX, y: p.worldY, t: p.downTime });
  };
  /** TECH-004: record `input.tap`/`input.drag`; a tap on `house:<projectId>` dispatches `acknowledgeProject` (mec-002 §2.4). */
  pointerUp = (p: ScenePointer): void => {
    if (p.id === this.joystickPointer) { this.joystickPointer = null; return; }
    const down = this.downs.get(p.id);
    if (!down) return;
    this.downs.delete(p.id);
    const projectId = this.targetAt(p.worldX, p.worldY);
    const result = recordPointer(this.context.log.record, projectId ? `house:${projectId}` : 'world', down, { x: p.worldX, y: p.worldY, t: p.upTime });
    if (result.kind === 'tap' && projectId) this.context.store.dispatch({ type: 'acknowledgeProject', projectId });
  };
  protected subscribeScene(): void {
    this.input.on('pointerdown', this.pointerDown); this.input.on('pointerup', this.pointerUp);
    this.unsubscribes.push(() => { this.input.off('pointerdown', this.pointerDown); this.input.off('pointerup', this.pointerUp); });
    for (const type of REFRESH_ON) this.on(type, () => this.refreshHouses());
  }
}

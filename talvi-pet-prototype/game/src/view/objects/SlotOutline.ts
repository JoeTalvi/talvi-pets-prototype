import Phaser from 'phaser';
import type { Slot } from '@content/schema/room';

export type OutlineState = 'empty' | 'filled' | 'selected';

/** Presentation §6.2 geometry (renders `SIZE` ×2 and `WALL_SLOPE`). */
const FLOOR_HALF = { small: [68, 34], large: [144, 72] } as const;
const WALL = { w: 120, h: 108 };
const WALL_SLOPE = { left: -0.533, right: 0.549 } as const;
const LABEL = { small: 'floor', large: 'large', wall: 'wall' } as const;
const WHITE = 0xfffaf0, RED = 0xb5523f;
const DASH = 12, GAP = 8;
const FADE_MS = 250;

/** Floor diamond centred on the base point; wall parallelogram whose bottom-centre is the base point. */
export function outlinePoints(slot: Pick<Slot, 'x' | 'y' | 'sizeClass' | 'wall'>): Phaser.Math.Vector2[] {
  const { x, y } = slot;
  if (slot.sizeClass === 'wall') {
    const s = WALL_SLOPE[slot.wall ?? 'left'], hw = WALL.w / 2, hh = WALL.h / 2, cy = y - hh;
    return [[x - hw, cy - hh - s * hw], [x + hw, cy - hh + s * hw], [x + hw, cy + hh + s * hw], [x - hw, cy + hh - s * hw]]
      .map(([px, py]) => new Phaser.Math.Vector2(px, py));
  }
  const [w, h] = FLOOR_HALF[slot.sizeClass];
  return [[x, y - h], [x + w, y], [x, y + h], [x - w, y]].map(([px, py]) => new Phaser.Math.Vector2(px, py));
}

/** Presentation §6.2 `SlotOutline`: dashed when empty (with its class label), solid when filled, red while selected. */
export class SlotOutline extends Phaser.GameObjects.Graphics {
  readonly slotId: string;
  readonly polygon: Phaser.Geom.Polygon;
  readonly label: Phaser.GameObjects.Text;
  outlineState: OutlineState = 'empty';
  private points: Phaser.Math.Vector2[];
  constructor(scene: Phaser.Scene, slot: Slot) {
    super(scene);
    scene.add.existing(this);
    this.slotId = slot.id;
    this.points = outlinePoints(slot);
    this.polygon = new Phaser.Geom.Polygon(this.points);
    const depth = (slot.depthOverride ?? slot.y) - 0.5;
    const centre = Phaser.Geom.Polygon.GetAABB(this.polygon);
    this.label = scene.add.text(centre.centerX, centre.centerY, LABEL[slot.sizeClass], { fontFamily: 'Nunito, sans-serif', fontStyle: '800', fontSize: '22px', color: '#ffffff' })
      .setOrigin(0.5).setDepth(depth);
    this.setDepth(depth);
    this.setShown(false);
    this.draw();
  }
  setOutlineState(state: OutlineState): void {
    if (state === this.outlineState) return;
    this.outlineState = state;
    this.draw();
  }
  /** Visible only in design mode; the hit polygon is interactive only while visible. */
  setShown(shown: boolean, fade = false): void {
    this.setVisible(shown); this.label.setVisible(shown && this.outlineState === 'empty');
    if (shown) this.setInteractive(this.polygon, Phaser.Geom.Polygon.Contains); else this.disableInteractive();
    if (fade && shown) this.scene.tweens.add({ targets: [this, this.label], alpha: { from: 0, to: 1 }, duration: FADE_MS });
    else this.setAlpha(1);
  }
  contains(x: number, y: number): boolean { return this.visible && Phaser.Geom.Polygon.Contains(this.polygon, x, y); }
  private draw(): void {
    this.clear();
    const closed = [...this.points, this.points[0]];
    if (this.outlineState === 'selected') {
      this.fillStyle(RED, 0.22).fillPoints(this.points, true);
      this.lineStyle(6, RED, 1).strokePoints(closed);
    } else if (this.outlineState === 'filled') this.lineStyle(4, WHITE, 0.7).strokePoints(closed);
    else this.dashed(closed);
    this.label.setVisible(this.visible && this.outlineState === 'empty');
  }
  /** Presentation §12 "slot outline dashes": 12/8 px `lineBetween` segments along each edge. */
  private dashed(closed: Phaser.Math.Vector2[]): void {
    this.lineStyle(4, WHITE, 0.7);
    for (let i = 0; i < closed.length - 1; i++) {
      const a = closed[i], b = closed[i + 1], length = Phaser.Math.Distance.BetweenPoints(a, b);
      for (let d = 0; d < length; d += DASH + GAP) {
        const t0 = d / length, t1 = Math.min(d + DASH, length) / length;
        this.lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
      }
    }
  }
}

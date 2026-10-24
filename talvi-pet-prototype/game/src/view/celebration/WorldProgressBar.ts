import Phaser from 'phaser';
import { MISSING_TEXTURE } from '../scenes/BootScene';
import { BAR_FADE_IN, BAR_FADE_OUT, FINAL_STAGGER, POP } from './timings';

/** Presentation §6.1 cutscene world bar depth. */
export const WORLD_BAR_DEPTH = 6500;
/** Presentation §7.3 (sizes proposed): backing 300×140 α 0.59, five 36×96 chunks with 8 px gaps, "NN %" 26 px below. */
export const WORLD_BAR = {
  offsetY: -40, backing: { key: 'ui/Panel_ModalDialog', w: 300, h: 140, slice: 100, alpha: 0.59 },
  chunk: { bg: 'ui/Bar_ChunkBackground_No_Fill', fill: 'ui/Bar_ChunkFill', w: 36, h: 96, gap: 8, y: -12 },
  label: { px: 26, y: 50, color: '#ffffff' },
  colors: { completed: 0x1a801a, inProgress: 0x33d933, background: 0x666666 },
} as const;

/** Chunk i's vertical fill at pct (presentation §7.3). */
export const chunkFill = (pct: number, i: number): number => Math.min(1, Math.max(0, pct / 20 - i));

type Chunk = { box: Phaser.GameObjects.Container; fill: Phaser.GameObjects.Image; completed: boolean };

/** Presentation §7.3 `WorldProgressBar` (production `BuildProgressBar.prefab`), shown only during the celebration. */
export class WorldProgressBar extends Phaser.GameObjects.Container {
  pct = 0;
  readonly chunks: Chunk[] = [];
  readonly label: Phaser.GameObjects.Text;
  constructor(scene: Phaser.Scene, anchor: { x: number; y: number }, pct: number, completedChunks: number) {
    super(scene, anchor.x, anchor.y + WORLD_BAR.offsetY);
    this.add(this.backing());
    for (let i = 0; i < 5; i++) this.chunks.push(this.chunk(i, i < completedChunks));
    this.label = scene.add.text(0, WORLD_BAR.label.y, '', { fontFamily: 'Nunito, sans-serif', fontStyle: '800',
      fontSize: `${WORLD_BAR.label.px}px`, color: WORLD_BAR.label.color }).setOrigin(0.5);
    this.add(this.label);
    scene.add.existing(this);
    this.setDepth(WORLD_BAR_DEPTH).setAlpha(0);
    this.setPct(pct);
  }
  private key(id: string): string { return this.scene.textures.exists(id) ? id : MISSING_TEXTURE; }
  private backing(): Phaser.GameObjects.GameObject {
    const { key, w, h, slice, alpha } = WORLD_BAR.backing;
    const texture = this.key(key);
    if (texture === MISSING_TEXTURE) return this.scene.add.image(0, 0, texture).setDisplaySize(w, h).setAlpha(alpha);
    // Tier 1 (journal): the 100 px slices overlap inside 140 px, so the nineslice is built at 2× and scaled to 300×140.
    return this.scene.add.nineslice(0, 0, texture, undefined, w * 2, h * 2, slice, slice, slice, slice).setScale(0.5).setAlpha(alpha);
  }
  private chunk(i: number, completed: boolean): Chunk {
    const { bg, fill, w, h, gap, y } = WORLD_BAR.chunk;
    const x = (i - 2) * (w + gap);
    const back = this.scene.add.image(0, 0, this.key(bg)).setDisplaySize(w, h).setTint(WORLD_BAR.colors.background);
    const front = this.scene.add.image(0, 0, this.key(fill)).setDisplaySize(w, h);
    const box = this.scene.add.container(x, y, [back, front]);
    this.add(box);
    const chunk = { box, fill: front, completed };
    this.tintChunk(chunk);
    return chunk;
  }
  private tintChunk(chunk: Chunk): void {
    chunk.fill.setTint(chunk.completed ? WORLD_BAR.colors.completed : WORLD_BAR.colors.inProgress);
  }
  /** Fills chunk i bottom-up to clamp(pct/20 − i, 0, 1) and writes "NN %". */
  setPct(pct: number): this {
    this.pct = pct;
    this.chunks.forEach((chunk, i) => {
      const f = chunkFill(pct, i), frame = chunk.fill.frame;
      chunk.fill.setCrop(0, frame.height * (1 - f), frame.width, frame.height * f);
      chunk.fill.setVisible(f > 0);
    });
    this.label.setText(`${Math.round(pct)} %`);
    return this;
  }
  /** Beat 3b: scale 1 → 1.2 → 1 (yoyo 300 + 300, Quad.easeOut); colour in progress → completed. */
  pop(i: number, delay = 0): Phaser.Tweens.Tween {
    const chunk = this.chunks[i];
    return this.scene.tweens.add({ targets: chunk.box, scale: 1.2, duration: POP / 2, yoyo: true, delay, ease: 'Quad.easeOut',
      onStart: () => { chunk.completed = true; this.tintChunk(chunk); } });
  }
  /** Beat 3c: every chunk pops left → right with a 125 ms stagger. */
  popAll(): Phaser.Tweens.Tween[] { return this.chunks.map((_, i) => this.pop(i, i * FINAL_STAGGER)); }
  /** Snap (§7.5): chunks below `completedChunks` drawn completed, no tween. */
  markCompleted(completedChunks: number): this {
    this.chunks.forEach((chunk, i) => { chunk.completed = i < completedChunks; this.tintChunk(chunk); });
    return this;
  }
  fadeIn(): Phaser.Tweens.Tween { return this.scene.tweens.add({ targets: this, alpha: 1, duration: BAR_FADE_IN }); }
  fadeOut(): Phaser.Tweens.Tween {
    return this.scene.tweens.add({ targets: this, alpha: 0, duration: BAR_FADE_OUT, onComplete: () => this.destroy() });
  }
}

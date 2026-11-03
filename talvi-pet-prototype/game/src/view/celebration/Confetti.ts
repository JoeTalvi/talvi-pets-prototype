import Phaser from 'phaser';
import { FLASH, FLASH_PEAK } from './timings';
import { reducedMotion } from './motion';

/** ASSET-019: the runtime 8×12 `confetti` texture (never a file or manifest row; order fork 5). */
export const CONFETTI_TEXTURE = 'confetti';
export const CONFETTI_DEPTH = 7000;
export const FLASH_DEPTH = 9000;
/** Presentation §7.4 / renders `confetti()` palette. */
export const CONFETTI_TINTS = [0xb5523f, 0xd9a441, 0x6f7f3f, 0x6b8fb5, 0xc98ba1];
export const CONFETTI_COUNT = 60;

/** Generates `confetti` once (white, tinted per particle) from a filled canvas: `Graphics.generateTexture` needs a renderer HEADLESS lacks (journal). */
export function ensureConfettiTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(CONFETTI_TEXTURE)) return;
  const canvas = document.createElement('canvas');
  canvas.width = 8; canvas.height = 12;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('confetti: no 2d context for the 8×12 texture');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 8, 12);
  if (!scene.textures.addCanvas(CONFETTI_TEXTURE, canvas)) throw new Error('confetti: texture not added');
}

/** DEC-049 spec §0 confetti parameters; every field defaults to presentation §7.4 (60, 200–340°, `CONFETTI_TINTS`). */
export type ConfettiOptions = { count?: number; angle?: { min: number; max: number }; tints?: readonly number[] };
/** DEC-049 spec §0 flash parameters; defaults are presentation §7.4 (`FLASH_PEAK` 0.75 over `FLASH` 350 ms). */
export type FlashOptions = { peak?: number; ms?: number };

/** Presentation §7.4 confetti: one `explode(count)` over the bounds; gravity 600, lifespan 1500–3000, rotate 0–360. Not motion-gated (confetti is kept under reduced motion). */
export function burstConfetti(scene: Phaser.Scene, bounds: Phaser.Geom.Rectangle, opts: ConfettiOptions = {}): Phaser.GameObjects.Particles.ParticleEmitter {
  ensureConfettiTexture(scene);
  const emitter = scene.add.particles(0, 0, CONFETTI_TEXTURE, {
    emitting: false, gravityY: 600, lifespan: { min: 1500, max: 3000 }, rotate: { min: 0, max: 360 },
    speed: { min: 200, max: 520 }, angle: opts.angle ?? { min: 200, max: 340 }, tint: [...(opts.tints ?? CONFETTI_TINTS)],
    emitZone: new Phaser.GameObjects.Particles.Zones.RandomZone(
      new Phaser.Geom.Rectangle(bounds.x, bounds.y, bounds.width, bounds.height) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource),
  });
  emitter.setDepth(CONFETTI_DEPTH);
  emitter.explode(opts.count ?? CONFETTI_COUNT);
  return emitter;
}

/**
 * Presentation §7.4 flash: full-viewport white Rectangle, scrollFactor 0, depth 9000, α `peak` → 0 over `ms` Quad.easeOut, destroyed on
 * complete (not `cameras.main.flash`). Under reduced motion (DEC-049 rule 5) no flash is drawn: the rectangle is created invisible
 * (α 0) and destroyed at once, so callers that hold it keep working.
 */
export function screenFlash(scene: Phaser.Scene, opts: FlashOptions = {}): Phaser.GameObjects.Rectangle {
  const { width, height } = scene.scale.gameSize;
  const rect = scene.add.rectangle(0, 0, width, height, 0xffffff).setOrigin(0, 0).setScrollFactor(0).setDepth(FLASH_DEPTH);
  if (reducedMotion()) { rect.setAlpha(0).destroy(); return rect; }
  rect.setAlpha(opts.peak ?? FLASH_PEAK);
  scene.tweens.add({ targets: rect, alpha: 0, duration: opts.ms ?? FLASH, ease: 'Quad.easeOut', onComplete: () => rect.destroy() });
  return rect;
}

/** DEC-049 spec §0 shake: the main camera shakes for `ms` at `intensity`; a no-op under reduced motion. */
export function shake(scene: Phaser.Scene, ms: number, intensity: number): void {
  if (ms <= 0 || reducedMotion()) return;
  scene.cameras.main.shake(ms, intensity);
}

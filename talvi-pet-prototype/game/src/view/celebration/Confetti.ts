import Phaser from 'phaser';
import { FLASH, FLASH_PEAK } from './timings';

/** ASSET-019: the runtime 8×12 `confetti` texture (never a file or manifest row; order fork 5). */
export const CONFETTI_TEXTURE = 'confetti';
export const CONFETTI_DEPTH = 7000;
export const FLASH_DEPTH = 9000;
/** Presentation §7.4 / renders `confetti()` palette. */
export const CONFETTI_TINTS = [0xb5523f, 0xd9a441, 0x6f7f3f, 0x6b8fb5, 0xc98ba1];
export const CONFETTI_COUNT = 60;

/** Generates `confetti` once (white, tinted per particle). */
export function ensureConfettiTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(CONFETTI_TEXTURE)) return;
  const g = scene.make.graphics({}, false);
  g.fillStyle(0xffffff, 1).fillRect(0, 0, 8, 12);
  g.generateTexture(CONFETTI_TEXTURE, 8, 12);
  g.destroy();
}

/** Presentation §7.4 confetti: one `explode(60)` over the completed sprite bounds; gravity 600, lifespan 1500–3000, rotate 0–360. */
export function burstConfetti(scene: Phaser.Scene, bounds: Phaser.Geom.Rectangle): Phaser.GameObjects.Particles.ParticleEmitter {
  ensureConfettiTexture(scene);
  const emitter = scene.add.particles(0, 0, CONFETTI_TEXTURE, {
    emitting: false, gravityY: 600, lifespan: { min: 1500, max: 3000 }, rotate: { min: 0, max: 360 },
    speed: { min: 200, max: 520 }, angle: { min: 200, max: 340 }, tint: CONFETTI_TINTS,
    emitZone: new Phaser.GameObjects.Particles.Zones.RandomZone(
      new Phaser.Geom.Rectangle(bounds.x, bounds.y, bounds.width, bounds.height) as unknown as Phaser.Types.GameObjects.Particles.RandomZoneSource),
  });
  emitter.setDepth(CONFETTI_DEPTH);
  emitter.explode(CONFETTI_COUNT);
  return emitter;
}

/** Presentation §7.4 flash: full-viewport white Rectangle, scrollFactor 0, depth 9000, α 0.75 → 0 over 350 Quad.easeOut, destroyed on complete (not `cameras.main.flash`). */
export function screenFlash(scene: Phaser.Scene): Phaser.GameObjects.Rectangle {
  const { width, height } = scene.scale.gameSize;
  const rect = scene.add.rectangle(0, 0, width, height, 0xffffff).setOrigin(0, 0).setScrollFactor(0).setDepth(FLASH_DEPTH).setAlpha(FLASH_PEAK);
  scene.tweens.add({ targets: rect, alpha: 0, duration: FLASH, ease: 'Quad.easeOut', onComplete: () => rect.destroy() });
  return rect;
}

import Phaser from 'phaser';
import { clipKey } from '../anims';
import type { CharmSprite } from '../objects/CharmSprite';
import { burstConfetti } from './Confetti';
import { CONFETTI_LIFETIME, HEART_MOMENT, HEART_PET_DEPTH } from './timings';

export type HeartSceneOptions = {
  petId: string;
  /** The slot whose charm fulfilled the want (from `want.fulfilled` in the same dispatch), or null. */
  focusSlotId: string | null;
  /** The scene's charm sprite at a slot (Interior: its room; Street: the site), for beats that touch the charm. */
  charmAt(slotId: string): CharmSprite | undefined;
};

export type HeartScene = {
  /** The big `react` pet, null when the sheet or clip is missing or once it has ended. */
  readonly pet: Phaser.GameObjects.Sprite | null;
  /** Removes the big pet (the overlay's end event, a new moment); the confetti keeps falling. */
  end(): void;
  /** `end()` plus every pending timer (scene teardown). */
  destroy(): void;
};

/**
 * WORK-032-2 fix 6b, the scene half of the Heart moment (moved verbatim from `InteriorScene.heartMoment()` by WORK-038-1 so it runs
 * in any world scene, fork (a)): the confetti bursts up from mid-screen and the pet's `react` clip plays large in the overlay's
 * spotlight, camera-fixed above the world, while the scene's own pet keeps following the simulation. The dim, the heart and the
 * input capture are the overlay's (`heartMoment.ts`).
 */
export function startHeartScene(scene: Phaser.Scene, opts: HeartSceneOptions): HeartScene {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let pet: Phaser.GameObjects.Sprite | null = null;
  const end = () => { pet?.destroy(); pet = null; };
  const handle: HeartScene = {
    get pet() { return pet; },
    end,
    destroy() { end(); for (const t of timers.splice(0)) clearTimeout(t); },
  };
  const { width, height } = scene.scale.gameSize, top = scene.cameras.main.scrollY;
  const emitter = burstConfetti(scene, new Phaser.Geom.Rectangle(width / 2 - 360, top + height / 2 - 80, 720, 160));
  timers.push(setTimeout(() => emitter.destroy(), CONFETTI_LIFETIME));
  const sheet = `pets/${opts.petId}-sheet`, react = clipKey(sheet, 'react');
  if (!react || !scene.anims.exists(react) || !scene.textures.exists(sheet)) return handle;
  pet = scene.add.sprite(width / 2, height * HEART_MOMENT.petBaseY, sheet).setOrigin(0.5, 1).setScale(HEART_MOMENT.petScale)
    .setScrollFactor(0).setDepth(HEART_PET_DEPTH).play(react);
  scene.tweens.add({ targets: pet, alpha: { from: 0, to: 1 }, duration: 160 });
  timers.push(setTimeout(end, HEART_MOMENT.totalMs));
  return handle;
}

/** Ends a scene half's big pet (null-safe). */
export function endHeartScene(heart: HeartScene | null): void { heart?.end(); }

import Phaser from 'phaser';
import { clipKey } from '../anims';
import type { CharmSprite } from '../objects/CharmSprite';
import { burstConfetti, CONFETTI_TINTS, screenFlash, shake } from './Confetti';
import { HEART_HIT, HEART_SETTLE, type HeartHitDetail, type HeartSettleDetail } from './heartMoment';
import { hitstop, type Hitstop } from './hitstop';
import { reducedMotion } from './motion';
import { CONFETTI_LIFETIME, HEART, HEART_MOMENT, HEART_PET_DEPTH } from './timings';

export type HeartSceneOptions = {
  petId: string;
  /** The slot whose charm fulfilled the want (from `want.fulfilled` in the same dispatch), or null. */
  focusSlotId: string | null;
  /** The scene's charm sprite at a slot (Interior: its room; Street: the site), for beats that touch the charm. */
  charmAt(slotId: string): CharmSprite | undefined;
};

export type HeartScene = {
  /** The big `react` pet, null before the hit, when the sheet or clip is missing, or once it has ended. */
  readonly pet: Phaser.GameObjects.Sprite | null;
  /** Removes the big pet (the overlay's end event, a new moment); the confetti keeps falling. */
  end(): void;
  /** `end()` plus every pending timer and listener (scene teardown). */
  destroy(): void;
};

/** Spec §5 Hit confetti: red, pink and gold from the presentation §7.4 palette. */
export const HEART_CONFETTI_TINTS = [CONFETTI_TINTS[0], CONFETTI_TINTS[4], CONFETTI_TINTS[1]] as const;
/** Spec §5 Hit: the big pet hops `HEART.hops` times this high (y −36). */
export const HEART_HOP_PX = 36;
/** Spec §5 Hit: the big pet fades in over 160 ms. */
const PET_FADE_IN_MS = 160;
/** Only the newest scene half answers the overlay's beats (a later `heart.earned` supersedes an earlier half). */
let newest: object | null = null;

/** Beat 0 (spec §5): the placed charm punches 1 → 1.25 → 1; it replaces the charm's placement pop (same `scale` property). */
function punchCharm(scene: Phaser.Scene, sprite: CharmSprite | undefined): void {
  if (!sprite) return;
  scene.tweens.killTweensOf(sprite);
  sprite.setScale(1);
  scene.tweens.add({ targets: sprite, scale: 1.25, duration: HEART.charmPunchMs / 2, yoyo: true, ease: 'Quad.easeOut' });
}

/** Beat 450 (spec §5 Hit): the ×2 pet fades in at the spotlight and plays `react`, hopping twice (no hop under reduced motion). */
function bigPet(scene: Phaser.Scene, petId: string): Phaser.GameObjects.Sprite | null {
  const sheet = `pets/${petId}-sheet`, react = clipKey(sheet, 'react');
  if (!react || !scene.anims.exists(react) || !scene.textures.exists(sheet)) return null;
  const { width, height } = scene.scale.gameSize, baseY = height * HEART_MOMENT.petBaseY;
  const pet = scene.add.sprite(width / 2, baseY, sheet).setOrigin(0.5, 1).setScale(HEART.petScale)
    .setScrollFactor(0).setDepth(HEART_PET_DEPTH).play(react);
  scene.tweens.add({ targets: pet, alpha: { from: 0, to: 1 }, duration: PET_FADE_IN_MS });
  if (!reducedMotion()) {
    scene.tweens.add({ targets: pet, y: baseY - HEART_HOP_PX, duration: HEART.hopMs, yoyo: true, repeat: HEART.hops - 1, ease: 'Quad.easeOut' });
  }
  return pet;
}

/**
 * DEC-049 spec §5, the scene half of the Heart moment (WORK-038-2; started by `WorldScene` on `heart.earned` in any world scene):
 * the hitstop and the charm punch at 0; on the overlay's hit frame (`HEART_HIT`) the flash, the shake, 120 radial confetti from the
 * heart's centre and the ×2 `react` pet; on `HEART_SETTLE` the pet fades out. The scene's own pet keeps following the simulation
 * (m4 row B3 not folded). The dim, the heart, the cards, the sounds and the input capture are the overlay's (`heartMoment.ts`).
 */
export function startHeartScene(scene: Phaser.Scene, opts: HeartSceneOptions): HeartScene {
  const id = {};
  newest = id;
  const timers: ReturnType<typeof setTimeout>[] = [];
  let pet: Phaser.GameObjects.Sprite | null = null;
  const stop: Hitstop = hitstop(scene, HEART.hitstopMs ?? 0);
  punchCharm(scene, opts.focusSlotId === null ? undefined : opts.charmAt(opts.focusSlotId));
  const onHit = (e: Event) => {
    if (newest !== id || !scene.sys.isActive()) return;
    const { petId, at } = (e as CustomEvent<HeartHitDetail>).detail;
    screenFlash(scene, { peak: HEART.flashPeak, ms: HEART.flashMs });
    shake(scene, HEART.shakeMs, HEART.shakeIntensity);
    const top = scene.cameras.main.scrollY;
    const emitter = burstConfetti(scene, new Phaser.Geom.Rectangle(at.x - 8, top + at.y - 8, 16, 16),
      { count: HEART.confetti, angle: { min: 0, max: 360 }, tints: HEART_CONFETTI_TINTS });
    timers.push(setTimeout(() => emitter.destroy(), CONFETTI_LIFETIME));
    pet?.destroy();
    pet = bigPet(scene, petId);
  };
  const onSettle = (e: Event) => {
    if (newest !== id || !pet) return;
    scene.tweens.add({ targets: pet, alpha: 0, duration: (e as CustomEvent<HeartSettleDetail>).detail.ms });
  };
  window.addEventListener(HEART_HIT, onHit);
  window.addEventListener(HEART_SETTLE, onSettle);
  const end = () => { pet?.destroy(); pet = null; };
  return {
    get pet() { return pet; },
    end,
    destroy() {
      end(); stop.cancel();
      for (const t of timers.splice(0)) clearTimeout(t);
      window.removeEventListener(HEART_HIT, onHit); window.removeEventListener(HEART_SETTLE, onSettle);
      if (newest === id) newest = null;
    },
  };
}

/** Ends a scene half's big pet (null-safe). */
export function endHeartScene(heart: HeartScene | null): void { heart?.end(); }

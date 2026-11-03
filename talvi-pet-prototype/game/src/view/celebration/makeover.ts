import type Phaser from 'phaser';
import type { Audio } from '@app/audio';
import type { AvatarSprite } from '../objects/AvatarSprite';
import { directorClock } from './CelebrationDirector';
import { burstConfetti } from './Confetti';
import { DustPoof } from './DustPoof';
import { reducedMotion } from './motion';
import { CONFETTI_LIFETIME, DUST_CLIP, DUST_LIFETIME, OUTFIT, SFX_VOLUMES } from './timings';

/** Spec §10 "Outfit worn": the shiver amplitude (x ± 4 px) and its legs over `OUTFIT.shiverMs`. */
export const SHIVER_PX = 4;
const SHIVER_LEGS = 6;
/** Spec §10: 12 sparkle confetti at the swap, in the gold / white sparkle tints. */
export const SPARKLE_COUNT = 12;
export const SPARKLE_TINTS = [0xd9a441, 0xfffaf0, 0xe9ba23] as const;

export type Makeover = { cancel(): void };

/**
 * WORK-037-3 (gate Q12; spec §10 "Outfit worn", the house stage-swap pattern scaled down) on the avatar: 0 shiver + `riser` →
 * `OUTFIT.dustAt` DustPoof over the avatar → `OUTFIT.swapAt` the sheet swap under the dust, `phasePop` and 12 sparkles. The sim
 * already wears `to`; the sprite holds `from` on screen until the swap. Reduced motion: no shiver and no sparkles (order and sounds kept).
 */
export function playMakeover(scene: Phaser.Scene, avatar: AvatarSprite, from: string, audio: () => Pick<Audio, 'play'> | null): Makeover {
  const clock = directorClock.create(scene), still = reducedMotion();
  const cancels: (() => void)[] = [];
  const effects: Phaser.GameObjects.GameObject[] = [];
  const after = (ms: number, fn: () => void) => cancels.push(clock.after(ms, fn));
  avatar.hold(from);
  audio()?.play('riser', { volume: SFX_VOLUMES.riser });
  if (!still) {
    const tween = scene.tweens.add({ targets: avatar, offsetX: SHIVER_PX, duration: OUTFIT.shiverMs / SHIVER_LEGS, yoyo: true,
      repeat: SHIVER_LEGS / 2 - 1, onComplete: () => { avatar.offsetX = 0; } });
    cancels.push(() => { tween.remove(); avatar.offsetX = 0; });
  }
  after(OUTFIT.dustAt, () => {
    const poof = new DustPoof(scene, avatar.getBounds(), avatar.depth + 1);
    effects.push(poof);
    after(DUST_CLIP, () => { if (poof.active) poof.fade(); });
    after(DUST_LIFETIME, () => poof.destroy());
  });
  after(OUTFIT.swapAt, () => {
    avatar.hold(null);
    audio()?.play('phasePop');
    if (still) return;
    const sparkles = burstConfetti(scene, avatar.getBounds(), { count: SPARKLE_COUNT, tints: SPARKLE_TINTS });
    effects.push(sparkles);
    after(CONFETTI_LIFETIME, () => sparkles.destroy());
  });
  return {
    cancel() {
      for (const off of cancels.splice(0)) off();
      for (const effect of effects.splice(0)) effect.destroy();
      avatar.hold(null);
    },
  };
}

import type Phaser from 'phaser';
import { reducedMotion } from './motion';

export type Hitstop = { /** Ends this freeze at once (scene teardown, cancel). */ cancel(): void };

/** Open freezes per scene: Phaser's tween/anim pause is global, so only the last freeze to end may resume (review WORK-038-1 A5). */
const open = new WeakMap<Phaser.Scene, number>();

/**
 * DEC-049 spec §0 hitstop (gate Q5(a)): pauses the world scene's tweens and sprite animations for `ms`, then resumes them. The
 * simulation keeps stepping (the store and the scene's update loop are untouched) and the DOM overlay is not frozen. A no-op under
 * reduced motion or for `ms <= 0`. Re-entrant: overlapping calls pause once and resume when the last of them ends.
 */
export function hitstop(scene: Phaser.Scene, ms: number): Hitstop {
  if (ms <= 0 || reducedMotion()) return { cancel: () => {} };
  const depth = open.get(scene) ?? 0;
  if (depth === 0) { scene.tweens.pauseAll(); scene.anims.pauseAll(); }
  open.set(scene, depth + 1);
  let done = false;
  const resume = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    const left = (open.get(scene) ?? 1) - 1;
    open.set(scene, left);
    if (left > 0) return;
    scene.tweens.resumeAll();
    scene.anims.resumeAll();
  };
  const timer = setTimeout(resume, ms);
  return { cancel: resume };
}

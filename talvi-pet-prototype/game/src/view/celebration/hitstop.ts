import type Phaser from 'phaser';
import { reducedMotion } from './motion';

export type Hitstop = { /** Resumes at once (scene teardown, cancel). */ cancel(): void };

/**
 * DEC-049 spec §0 hitstop (gate Q5(a)): pauses the world scene's tweens and sprite animations for `ms`, then resumes them. The
 * simulation keeps stepping (the store and the scene's update loop are untouched) and the DOM overlay is not frozen. A no-op under
 * reduced motion or for `ms <= 0`.
 */
export function hitstop(scene: Phaser.Scene, ms: number): Hitstop {
  if (ms <= 0 || reducedMotion()) return { cancel: () => {} };
  scene.tweens.pauseAll();
  scene.anims.pauseAll();
  let done = false;
  const resume = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    scene.tweens.resumeAll();
    scene.anims.resumeAll();
  };
  const timer = setTimeout(resume, ms);
  return { cancel: resume };
}

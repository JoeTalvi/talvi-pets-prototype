import type { Audio } from '@app/audio';
import { TICK_MIN_GAP_MS, TICK_STEPS } from './timings';

export type TickSeq = {
  /** Plays the next tick (0, +4, +7, +12, then +12 held); a tick < `TICK_MIN_GAP_MS` after the last played one is dropped (returns false). */
  tick(): boolean;
  /** Starts a new moment: the next tick is at 0 again. */
  reset(): void;
};

/**
 * DEC-049 tick arpeggio (gate Q6(a)): one sequence per moment (a Stars burst, a coin flight); each landing calls `tick()`. Plays
 * `tick` through `Audio.play` with the semitone option, so the pitch steps reach the Phaser player as `detune`.
 */
export function createTickSeq(audio: () => Pick<Audio, 'play'> | null, now: () => number = () => performance.now()): TickSeq {
  let index = 0;
  let last: number | null = null;
  return {
    tick() {
      const t = now();
      if (last !== null && t - last < TICK_MIN_GAP_MS) return false;
      last = t;
      const semitones = TICK_STEPS[Math.min(index, TICK_STEPS.length - 1)];
      index++;
      audio()?.play('tick', { semitones });
      return true;
    },
    reset() { index = 0; last = null; },
  };
}

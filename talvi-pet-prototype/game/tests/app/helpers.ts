import { readFileSync } from 'node:fs';
import { createLog, type SessionHeader } from '../../src/app/log';
import type { Content } from '../../src/content/types';
import type { GameState } from '../../src/sim/state';
import { createMemoryStorage } from './memoryStorage';

/** Fixture text read with node:fs (never imported, so invalid JSON stays loadable as text). */
export const fixtureText = (path: string) => readFileSync(`tests/fixtures/${path}`, 'utf8');

/** Deterministic clocks: `now` advances `stepMs` per read; `wall` derives from it. */
export function testClock(stepMs = 0) {
  let ms = 0;
  const clock = {
    advance(by: number) { ms += by; },
    now: () => { const value = ms; ms += stepMs; return value; },
    wall: () => new Date(Date.UTC(2026, 0, 1) + ms).toISOString(),
  };
  return clock;
}

export function headerFor(state: GameState): SessionHeader {
  return { build: 'tpp-test', schemaVersion: 1, seed: state.session.seed, cadence: state.session.eventIntervalMs,
    feedPresentation: state.session.feedPresentation, testerLabel: state.session.testerLabel,
    userAgent: 'vitest', viewport: { w: 1920, h: 885, dpr: 3 } };
}

/** A started log on FX-STORAGE with a deterministic clock. */
export function testLog(content: Content, storage: Storage = createMemoryStorage(), clock = testClock()) {
  const log = createLog({ storage, ringLines: content.tuning.logRingLines, now: clock.now, wall: clock.wall });
  return { log, storage, clock };
}

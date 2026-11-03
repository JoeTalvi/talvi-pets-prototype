import { vi } from 'vitest';
import * as confetti from '../../src/view/celebration/Confetti';
import * as hitstop from '../../src/view/celebration/hitstop';

/** VERIFY-WORK-038-3-10: stubs `matchMedia` so `prefers-reduced-motion: reduce` matches (or not); undo with `vi.unstubAllGlobals()`. */
export function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduce && query.includes('reduce'), media: query,
    addEventListener() {}, removeEventListener() {} }));
}

/** VERIFY-WORK-038-3-11: spies on the signature-only blocks; `calls()` is [screenFlash, shake, hitstop]. Undo with `vi.restoreAllMocks()`. */
export function blockSpies(): { calls(): [number, number, number] } {
  const flash = vi.spyOn(confetti, 'screenFlash'), shake = vi.spyOn(confetti, 'shake'), stop = vi.spyOn(hitstop, 'hitstop');
  return { calls: () => [flash.mock.calls.length, shake.mock.calls.length, stop.mock.calls.length] };
}

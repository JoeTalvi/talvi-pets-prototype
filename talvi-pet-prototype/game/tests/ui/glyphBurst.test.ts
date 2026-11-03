// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGlyphBursts, glyphBurst } from '../../src/view/celebration/glyphBurst';

let root: HTMLElement;
beforeEach(() => { root = document.createElement('div'); document.body.append(root); vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

describe('VERIFY-WORK-038-1-07 glyph burst', () => {
  it('N glyphs of the glyph and px; with `to`, onArrival(i) in order at i × staggerMs + flightMs; container pointer-events none, removed at the end', () => {
    const arrivals: [number, number][] = [];
    let t = 0;
    const burst = glyphBurst(root, { glyph: '♥', px: 40, count: 4, from: { x: 960, y: 540 }, to: { x: 100, y: 40 }, spreadPx: 70, staggerMs: 90, flightMs: 520,
      onArrival: i => arrivals.push([i, t]) });
    const glyphs = [...burst.el.querySelectorAll<HTMLElement>('.tpp-glyph')];
    expect(glyphs.map(g => [g.textContent, g.style.fontSize])).toEqual(Array(4).fill(['♥', '40px']));
    expect([burst.el.style.pointerEvents, burst.totalMs, root.contains(burst.el)]).toEqual(['none', 3 * 90 + 520, true]);
    for (; t < burst.totalMs; t++) vi.advanceTimersByTime(1);
    expect(arrivals).toEqual([[0, 519], [1, 609], [2, 699], [3, 789]]);
    expect(root.contains(burst.el)).toBe(false);
  });

  it('without `to`: spray and fade, no arrivals; removed at the end', () => {
    const onArrival = vi.fn();
    const burst = glyphBurst(root, { glyph: '✦', px: 24, count: 6, from: { x: 0, y: 0 }, spreadPx: 50, staggerMs: 20, flightMs: 300, onArrival });
    vi.advanceTimersByTime(burst.totalMs);
    expect([onArrival.mock.calls.length, root.contains(burst.el)]).toEqual([0, false]);
  });

  it('clearGlyphBursts empties the root and stops pending arrivals', () => {
    const onArrival = vi.fn();
    glyphBurst(root, { glyph: '★', px: 56, count: 3, from: { x: 0, y: 0 }, to: { x: 5, y: 5 }, spreadPx: 70, staggerMs: 90, flightMs: 520, onArrival });
    glyphBurst(root, { glyph: '★', px: 24, count: 3, from: { x: 0, y: 0 }, spreadPx: 70, staggerMs: 90, flightMs: 520 });
    expect(root.querySelectorAll('.tpp-glyph-burst')).toHaveLength(2);
    clearGlyphBursts(root);
    vi.advanceTimersByTime(5000);
    expect([root.querySelectorAll('.tpp-glyph-burst').length, onArrival.mock.calls.length]).toEqual([0, 0]);
  });
});

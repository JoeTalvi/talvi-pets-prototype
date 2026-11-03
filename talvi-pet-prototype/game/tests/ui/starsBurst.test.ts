// @vitest-environment jsdom
import '../view/setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destroyScene } from '../view/sceneHarness';
import { designSetup } from '../view/designHarness';
import { STARS } from '../../src/view/celebration/timings';
import { worldToOverlay } from '../../src/view/celebration/starsBurst';
import * as confetti from '../../src/view/celebration/Confetti';
import * as hitstop from '../../src/view/celebration/hitstop';

afterEach(() => { vi.useRealTimers(); destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const bursts = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.tpp-stars-burst')];
const large = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.tpp-stars-large .tpp-glyph')];
const small = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.tpp-stars-burst .tpp-glyph-burst:not(.tpp-stars-large) .tpp-glyph')];
const rings = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.tpp-stars-ring')];
const deltas = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.tpp-stars-delta')];
const fillWidth = (root: HTMLElement) => root.querySelector<HTMLElement>('.tpp-hudInterior .tpp-stars-track i')!.style.width;
const ticks = (play: ReturnType<typeof vi.fn>) => play.mock.calls.filter(c => c[0] === 'tick').map(c => (c[1] as { semitones: number }).semitones);

describe('VERIFY-WORK-038-3-04 Stars by value (DEC-049 §4)', () => {
  it('VERIFY-WORK-038-3-04: a first copy (+4) shows the ring, 8 small ★ and 4 large ★ that land 90 ms apart after 520 ms, stepping the fill with a pulse and the 0/4/7/12 tick; all gone by 1000', async () => {
    const { root, context } = await designSetup();
    const play = vi.spyOn(context.audio!, 'play');
    vi.useFakeTimers();
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(bursts(root).map(b => b.dataset.kind)).toEqual(['first']);
    expect([rings(root).length, small(root).length, large(root).length]).toEqual([1, 8, 4]);
    expect(large(root)[0].style.fontSize).toBe(`${STARS.largePx}px`);
    expect(small(root)[0].style.fontSize).toBe(`${STARS.smallPx}px`);
    expect(deltas(root).map(d => d.textContent)).toEqual(['+4 ★']);
    const before = fillWidth(root);
    vi.advanceTimersByTime(STARS.flightMs - 1);
    expect([fillWidth(root), ticks(play)]).toEqual([before, []]);
    const widths: string[] = [];
    for (let i = 0; i < 4; i++) { vi.advanceTimersByTime(i === 0 ? 1 : STARS.staggerMs); widths.push(fillWidth(root)); }
    expect(new Set(widths).size).toBe(4);
    expect(ticks(play)).toEqual([0, 4, 7, 12]);
    expect(root.querySelector<HTMLElement>('.tpp-hudInterior .tpp-stars-track')!.dataset.pulses).toBe('4');
    expect(play.mock.calls.filter(c => c[0] !== 'tick')).toEqual([]);
    vi.advanceTimersByTime(STARS.totalMs.first - (STARS.flightMs + 3 * STARS.staggerMs) - 1);
    expect(bursts(root)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(bursts(root)).toHaveLength(0);
  });

  it('VERIFY-WORK-038-3-04: a repeat (+1) has no ring, 2 small ★ and 1 large ★ landing at 420; done by 500', async () => {
    const { root, context } = await designSetup({ edit: st => { st.rooms['dog-room'].placements['floor-1'] = 'lamp'; } });
    const play = vi.spyOn(context.audio!, 'play');
    vi.useFakeTimers();
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-2', typeId: 'lamp' });
    expect(deltas(root).map(d => d.textContent)).toEqual(['+1 ★']);
    expect(bursts(root).map(b => b.dataset.kind)).toEqual(['repeat']);
    expect([rings(root).length, small(root).length, large(root).length]).toEqual([0, 2, 1]);
    vi.advanceTimersByTime(STARS.repeatFlightMs - 1);
    expect(ticks(play)).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ticks(play)).toEqual([0]);
    vi.advanceTimersByTime(STARS.totalMs.repeat - STARS.repeatFlightMs - 1);
    expect(bursts(root)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(bursts(root)).toHaveLength(0);
  });

  it('VERIFY-WORK-038-3-04: the burst starts at the placed slot in overlay coordinates', async () => {
    const { root, context } = await designSetup();
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    try {
      context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
      const slot = context.content.rooms['dog-room'].slots.find(s => s.id === 'floor-1')!;
      const from = worldToOverlay({ x: slot.x, y: slot.y - 60 }, 1080);
      const half = STARS.largePx / 2;
      const first = animate.mock.calls.map(c => (c[0] as Keyframe[])[0].transform?.toString())
        .find(t => t?.startsWith(`translate(${from.x - half}px`));
      expect(first).toBe(`translate(${from.x - half}px, ${from.y - half}px) scale(0.3)`);
    } finally { delete (HTMLElement.prototype as { animate?: unknown }).animate; }
    expect(bursts(root)).toHaveLength(1);
  });

  it('VERIFY-WORK-038-3-04: a loss shows the red delta only; no burst', async () => {
    const { root, context } = await designSetup({ edit: st => { st.rooms['dog-room'].placements['floor-1'] = 'lamp'; } });
    context.store.dispatch({ type: 'removeCharm', slotId: 'floor-1' });
    expect(bursts(root)).toHaveLength(0);
    expect(deltas(root).map(d => d.classList.contains('loss'))).toEqual([true]);
  });

  it('VERIFY-WORK-038-3-04 / VERIFY-MEC-006-011: while Stars are hidden a gain shows nothing; hiding mid-burst clears it and releases the held fill', async () => {
    const { root, context } = await designSetup();
    const play = vi.spyOn(context.audio!, 'play');
    vi.useFakeTimers();
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(bursts(root)).toHaveLength(1);
    context.store.dispatch({ type: 'debugSetStarsVisible', on: false });
    expect(bursts(root)).toHaveLength(0);
    vi.advanceTimersByTime(STARS.totalMs.first);
    expect(ticks(play)).toEqual([]);
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-2', typeId: 'lamp' });
    expect([bursts(root).length, deltas(root).length]).toEqual([0, 0]);
  });

  it('VERIFY-WORK-038-3-04: state.reset clears a running burst', async () => {
    const { root, context } = await designSetup();
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(bursts(root)).toHaveLength(1);
    context.store.dispatch({ type: 'reset' });
    expect(bursts(root)).toHaveLength(0);
  });

  it('VERIFY-WORK-038-3-11: a Stars gain never calls screenFlash, shake or hitstop', async () => {
    const flash = vi.spyOn(confetti, 'screenFlash'), shake = vi.spyOn(confetti, 'shake'), stop = vi.spyOn(hitstop, 'hitstop');
    const { context } = await designSetup();
    vi.useFakeTimers();
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    vi.advanceTimersByTime(STARS.totalMs.first);
    expect([flash.mock.calls.length, shake.mock.calls.length, stop.mock.calls.length]).toEqual([0, 0, 0]);
  });
});

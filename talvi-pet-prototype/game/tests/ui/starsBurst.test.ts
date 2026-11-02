// @vitest-environment jsdom
import '../view/setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destroyScene } from '../view/sceneHarness';
import { designSetup } from '../view/designHarness';
import { STARS_BURST } from '../../src/view/celebration/timings';
import { worldToOverlay } from '../../src/view/celebration/starsBurst';

afterEach(() => { vi.useRealTimers(); destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const bursts = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.tpp-stars-burst')];
const stars = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.tpp-burst-star')];
const deltas = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.tpp-stars-delta')];

describe('VERIFY-WORK-032-2-06 Stars burst (WORK-032-2 fix 6a)', () => {
  it('VERIFY-WORK-032-2-06: a gain after charm.placed adds one non-blocking burst of STARS_BURST.count stars beside the +n ★ delta, all removed by totalMs ≤ 900', async () => {
    const { root, context } = await designSetup();
    vi.useFakeTimers();
    expect(STARS_BURST.totalMs).toBeLessThanOrEqual(900);
    expect((STARS_BURST.count - 1) * STARS_BURST.staggerMs + STARS_BURST.flightMs).toBeLessThanOrEqual(STARS_BURST.totalMs);
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(bursts(root)).toHaveLength(1);
    expect(stars(root)).toHaveLength(STARS_BURST.count);
    expect(STARS_BURST.count).toBe(8);
    expect([bursts(root)[0].style.pointerEvents, ...stars(root).map(s => s.style.pointerEvents)].every(v => v === 'none')).toBe(true);
    expect(deltas(root).map(d => [d.textContent, d.classList.contains('gain')])).toEqual([['+4 ★', true]]);
    // Non-blocking: the sim accepts the next action at once, and the state carries nothing from the burst.
    context.store.dispatch({ type: 'removeCharm', slotId: 'floor-1' });
    expect(context.store.getState().rooms['dog-room'].placements['floor-1']).toBeUndefined();
    vi.advanceTimersByTime(STARS_BURST.totalMs - 1);
    expect(bursts(root)).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(bursts(root)).toHaveLength(0);
  });

  it('VERIFY-WORK-032-2-06: the burst starts at the placed slot in overlay coordinates (world → overlay through the camera scroll)', async () => {
    const { root, context } = await designSetup();
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    try {
      context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
      const slot = context.content.rooms['dog-room'].slots.find(s => s.id === 'floor-1')!;
      const from = worldToOverlay({ x: slot.x, y: slot.y - 60 }, 1080);
      const first = (animate.mock.calls.find(c => (c[0] as Keyframe[])[0].transform?.toString().includes('scale(0.3)'))![0] as Keyframe[])[0];
      expect(first.transform).toBe(`translate(${from.x - 24}px, ${from.y - 24}px) scale(0.3)`);
    } finally { delete (HTMLElement.prototype as { animate?: unknown }).animate; }
    expect(worldToOverlay({ x: 10, y: 500 }, 900)).toEqual({ x: 10, y: 410 });
    expect(bursts(root)).toHaveLength(1);
  });

  it('VERIFY-WORK-032-2-06: a loss shows the red delta only; no burst', async () => {
    const { root, context } = await designSetup({ edit: st => { st.rooms['dog-room'].placements['floor-1'] = 'lamp'; } });
    context.store.dispatch({ type: 'removeCharm', slotId: 'floor-1' });
    expect(bursts(root)).toHaveLength(0);
    expect(deltas(root).map(d => d.classList.contains('loss'))).toEqual([true]);
  });

  it('VERIFY-WORK-032-2-06 / VERIFY-MEC-006-011: while Stars are hidden a gain shows nothing; hiding mid-burst clears it', async () => {
    const { root, context } = await designSetup();
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(bursts(root)).toHaveLength(1);
    context.store.dispatch({ type: 'debugSetStarsVisible', on: false });
    expect(bursts(root)).toHaveLength(0);
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-2', typeId: 'lamp' });
    expect([bursts(root).length, deltas(root).length]).toEqual([0, 0]);
  });

  it('VERIFY-WORK-032-2-06: state.reset clears a running burst', async () => {
    const { root, context } = await designSetup();
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(bursts(root)).toHaveLength(1);
    context.store.dispatch({ type: 'reset' });
    expect(bursts(root)).toHaveLength(0);
  });
});

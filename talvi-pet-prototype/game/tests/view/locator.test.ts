// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destroyScene } from './sceneHarness';
import { designSetup } from './designHarness';
import { createText, FALLBACK_STRINGS } from '../../src/ui/overlay';
import realStrings from '../../src/content/strings.json';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

type Setup = Awaited<ReturnType<typeof designSetup>>;
const locator = (s: Setup) => s.root.querySelector<HTMLElement>('aside.tpp-chooser-locator');
const tap = (s: Setup, slotId: string) => s.context.bus.emit({ type: 'slot.tapped', slotId, filled: false });
const near = (points: string) => points.split(' ').map(p => p.split(',').map(Number));

describe('UI-CN05 locator (ux-correction v2; DEC-038)', () => {
  it('UI-CN05 locator — partial: jsdom (no layout, inline styles only): non-interactive 480×220 at left 1400 / bottom 484, heading, miniature from rooms/fixture, floor-3 diamond, removed on close', async () => {
    const s = await designSetup();
    tap(s, 'floor-3');
    const aside = locator(s)!;
    expect([aside.style.pointerEvents, aside.style.left, aside.style.width, aside.style.height, aside.style.bottom, aside.getAttribute('aria-hidden')])
      .toEqual(['none', '1400px', '480px', '220px', '484px', 'true']);
    expect(aside.querySelector('.tpp-locator-heading')!.textContent).toBe('Selected spot · Small floor');
    expect(aside.textContent).not.toMatch(/\d/);
    const mini = aside.querySelector<HTMLElement>('.tpp-locator-miniature')!;
    expect(mini.style.backgroundImage).toContain('synthetic/rooms/');
    expect([mini.style.backgroundSize, mini.style.backgroundPosition]).toEqual(['768px 432px', '0px -108px']);
    const svg = mini.querySelector('svg')!;
    expect([svg.getAttribute('width'), svg.getAttribute('height')]).toEqual(['368', '144']);
    const first = near(svg.querySelector('polygon')!.getAttribute('points')!);
    const expected = [[184, 58.4], [211.2, 72], [184, 85.6], [156.8, 72]];
    first.forEach((p, i) => { expect(p[0]).toBeCloseTo(expected[i][0], 2); expect(p[1]).toBeCloseTo(expected[i][1], 2); });
    expect(svg.querySelector('polygon')!.getAttribute('stroke')).toBe('#b5523f');
    expect(aside.querySelector('.tpp-locator-link')).not.toBeNull();
    s.panels.chooser.close!('cancel');
    expect(locator(s)).toBeNull();
  });

  it('UI-CN05 locator — partial: jsdom: reopening for wall-1 re-renders one locator with the wall parallelogram; no room art → paper only (order fork 6)', async () => {
    const s = await designSetup({ omitAssets: ['rooms/fixture'] });
    tap(s, 'floor-3'); s.panels.chooser.close!('cancel'); tap(s, 'wall-1');
    expect(s.root.querySelectorAll('aside.tpp-chooser-locator')).toHaveLength(1);
    expect(locator(s)!.querySelector('.tpp-locator-heading')!.textContent).toBe('Selected spot · Wall');
    const mini = locator(s)!.querySelector<HTMLElement>('.tpp-locator-miniature')!;
    expect(mini.style.backgroundImage).toBe('');
    const pts = near(mini.querySelector('polygon')!.getAttribute('points')!);
    expect(pts).toHaveLength(4);
    expect(pts[0][1]).not.toBeCloseTo(pts[1][1], 1);
  });
});

describe('presentation §8 mount order (WORK-019-2)', () => {
  it('presentation §8 mount order — #panels panels in document order hudInterior, wantPanel, chooser, replaceRemove, debugPanel; Panels.wantPanel defined', async () => {
    const s = await designSetup();
    // WORK-019-3 inserts toast and dialogue between these; the relative order of WORK-019-2's panels is what this row pins.
    const own = ['hudInterior', 'wantPanel', 'chooser', 'replaceRemove', 'debugPanel'];
    expect([...s.root.querySelectorAll<HTMLElement>('[data-panel]')].map(c => c.dataset.panel!).filter(p => own.includes(p))).toEqual(own);
    expect(s.panels.wantPanel).toBeDefined();
    expect(s.root.querySelector('.tpp-wantPanel')!.classList.contains('tpp-panel')).toBe(true);
  });
});

describe('presentation §8.2 strings fallback (WORK-019-2)', () => {
  it('presentation §8.2 strings fallback (WORK-019-2) — WANT, Selected spot, −4 ★; every new key in strings-additions.json shape; no guess keys', () => {
    const text = createText({});
    expect([text('tpp.want.title'), text('tpp.chooser.selected'), text('tpp.stars.deltaLoss', { delta: 4 })]).toEqual(['WANT', 'Selected spot', '−4 ★']);
    expect(Object.keys(FALLBACK_STRINGS).filter(k => /guess/i.test(k))).toEqual([]);
    const real = realStrings as Record<string, string>;
    for (const key of ['tpp.want.title', 'tpp.chooser.selected', 'tpp.stars.deltaLoss']) expect(real[key]).toBeUndefined();
  });
});

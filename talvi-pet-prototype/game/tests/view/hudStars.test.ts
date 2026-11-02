// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destroyScene } from './sceneHarness';
import { click, designSetup, linesOf } from './designHarness';
import { HUD_TIMING } from '../../src/ui/panels/hudInterior';
import type { GameState } from '../../src/sim/state';

afterEach(() => { vi.useRealTimers(); destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const q = <T extends HTMLElement = HTMLElement>(root: HTMLElement, sel: string) => root.querySelector<T>(sel)!;
const deltas = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('.tpp-stars-delta')];

describe('presentation §8.2 hudInterior stars (MEC-006 R5–R7)', () => {
  it('presentation §8.2 hudInterior stars — partial: jsdom (no layout): labels 4 → 5 → 4 → 0 / 48 ★, one delta per stars.changed (+4, +1, −1, −4 red), removed after 900 ms, 250 ms width transition', async () => {
    const { root, context } = await designSetup();
    vi.useFakeTimers();
    const label = q(root, '.tpp-stars [data-string-key="tpp.stars.label"]'), fill = q(root, '.tpp-stars-track i');
    expect(fill.style.transition).toBe(`width ${HUD_TIMING.tweenMs}ms ease-out`);
    const seen: [string | null, string, string][] = [];
    const step = (action: Parameters<typeof context.store.dispatch>[0]) => {
      context.store.dispatch(action);
      const made = deltas(root);
      expect(made).toHaveLength(1);
      seen.push([made[0].textContent, made[0].style.color, label.textContent!]);
      vi.advanceTimersByTime(HUD_TIMING.deltaMs);
      expect(deltas(root)).toHaveLength(0);
    };
    step({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(fill.style.width).toBe(`${(4 / 48) * 100}%`);
    context.store.dispatch({ type: 'debugGrantCopies', typeId: 'lamp', count: 1 }); // DEC-043: a second Lamp
    step({ type: 'placeCharm', slotId: 'floor-2', typeId: 'lamp' });
    step({ type: 'removeCharm', slotId: 'floor-1' });
    step({ type: 'removeCharm', slotId: 'floor-2' });
    expect(seen).toEqual([['+4 ★', 'var(--olive)', '4 / 48 ★'], ['+1 ★', 'var(--olive)', '5 / 48 ★'], ['−1 ★', 'var(--red)', '4 / 48 ★'],
      ['−4 ★', 'var(--red)', '0 / 48 ★']]);
  });

  it('presentation §8.2 hudInterior stars — partial: VERIFY-MEC-006-011 desktop HUD half: while hidden no delta, .tpp-stars hidden, stars.changed still logged, Hearts stay', async () => {
    const { root, context } = await designSetup();
    context.store.dispatch({ type: 'debugSetStarsVisible', on: false });
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(deltas(root)).toHaveLength(0);
    expect(q(root, '.tpp-stars').hidden).toBe(true);
    expect(q(root, '.tpp-hearts').hidden).toBe(false);
    expect(context.log.lines().some(l => l.type === 'stars.changed')).toBe(true);
    click(q(root, '.tpp-stars'));
    expect(root.querySelector('.tpp-stars-explained')).toBeNull();
    expect(linesOf(context, 'ui.starsExplained')).toEqual([]);
  });

  it('presentation §8.2 hudInterior stars — partial: VERIFY-MEC-006-012 jsdom half: label matches select.starsOf; a bar tap shows tpp.stars.explain for 3 s and records ui.starsExplained {} once', async () => {
    const { root, context } = await designSetup();
    vi.useFakeTimers();
    click(q(root, '.tpp-stars'));
    const aside = q(root, 'aside.tpp-stars-explained.ns-tooltip');
    expect(aside.textContent).toBe('New kinds of charm fill the bar; repeats add a little.');
    expect(linesOf(context, 'ui.starsExplained')).toEqual([{ type: 'ui.starsExplained' }]);
    vi.advanceTimersByTime(HUD_TIMING.tooltipMs);
    expect(root.querySelector('.tpp-stars-explained')).toBeNull();
  });
});

describe('presentation §8.2 hudInterior hearts (MEC-009 R3)', () => {
  it('presentation §8.2 hudInterior hearts — "♥ 0" → "♥ 1" on heart.earned with one pulse; later removals leave the count', async () => {
    const { root, context } = await designSetup();
    const hearts = q(root, '.tpp-hearts');
    expect(hearts.textContent).toBe('♥ 0');
    context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    expect([hearts.textContent, hearts.dataset.pulses]).toEqual(['♥ 1', '1']);
    context.store.dispatch({ type: 'removeCharm', slotId: 'large-1' });
    expect([hearts.textContent, hearts.dataset.pulses]).toEqual(['♥ 1', '1']);
  });
});

describe('MEC-002 Q13(a) interior attention badge', () => {
  it('MEC-002 Q13(a) badge — partial: VERIFY-MEC-002-028 interior badge, jsdom: hidden at owed 0, shown after phase.reached, tap-to-text 3 s with no record, hidden once acknowledged or while celebrating', async () => {
    const { root, context } = await designSetup({ mode: 'play' });
    vi.useFakeTimers();
    const badge = q<HTMLButtonElement>(root, 'button.tpp-attention');
    expect([badge.hidden, badge.textContent, badge.getAttribute('aria-label')]).toEqual([true, '!', 'A home phase is ready, step outside']);
    context.store.dispatch({ type: 'debugSetCurrent', projectId: 'pet-house', cents: 300 });
    expect(context.log.lines().some(l => l.type === 'phase.reached')).toBe(true);
    expect(badge.hidden).toBe(false);
    const before = context.log.lines().length;
    click(badge);
    expect(q(root, 'aside.tpp-stars-explained.attention').textContent).toBe('A home phase is ready, step outside');
    expect(context.log.lines().slice(before).filter(l => l.type.startsWith('ui.'))).toEqual([]);
    vi.advanceTimersByTime(HUD_TIMING.tooltipMs);
    expect(root.querySelector('.tpp-stars-explained.attention')).toBeNull();
    context.store.dispatch({ type: 'debugSetCurrent', projectId: 'pet-house', cents: 0 });
  });

  it('MEC-002 Q13(a) badge — partial: interior badge, jsdom state edits: hidden while a celebration or an arrival is set, and once the owed phase is acknowledged', async () => {
    const owed = (s: GameState) => { s.projects['pet-house'].currentCents = 300; };
    const shown = async (edit: (s: GameState) => void) => {
      const { root } = await designSetup({ mode: 'play', edit: s => { owed(s); edit(s); } });
      const hidden = q(root, 'button.tpp-attention').hidden; destroyScene(); document.body.replaceChildren(); return !hidden;
    };
    expect(await shown(() => {})).toBe(true);
    expect(await shown(s => { s.celebration = { projectId: 'pet-house' } as GameState['celebration']; })).toBe(false);
    expect(await shown(s => { s.arrival = { projectId: 'pet-house', petId: 'dog' }; })).toBe(false);
    expect(await shown(s => { s.projects['pet-house'].acknowledgedPhase = 1 as never; })).toBe(false);
  });
});

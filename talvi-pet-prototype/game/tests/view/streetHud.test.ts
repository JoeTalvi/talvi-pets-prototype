// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Content } from '../../src/content/types';
import type { GameState } from '../../src/sim/state';
import { initialState } from '../../src/sim/state';
import { parseSaveValue } from '../../src/sim/state.schema';
import type { Action } from '../../src/sim/actions';
import { mountOverlay } from '../../src/ui/overlay';
import { chunkFills } from '../../src/ui/panels/hudStreet';
import { ROUNDUP_COINS } from '../../src/ui/panels/toast';
import type { ViewContext } from '../../src/view/context';
import { files, manifest, patchFiles } from '../content/helpers';
import { fixtureText } from '../app/helpers';
import { designIn, owing } from '../sim/helpers';
import { contextFor } from './sceneHarness';
import { click, linesOf, REAL_STRINGS } from './designHarness';

afterEach(() => { document.body.replaceChildren(); });

const STREET_STRINGS = [...REAL_STRINGS, ...Object.entries({ 'tpp.hud.reveal': 'Who is moving in?', 'tpp.hud.moreHomes': 'More homes coming' })
  .map(([key, value]) => ({ file: 'strings.json', path: `/${key}`, value }))];
const content: Content = loadContent(manifest, patchFiles(files(), STREET_STRINGS));

function hud(state: GameState) {
  const context = contextFor(content, state);
  const host = document.createElement('div'); document.body.append(host);
  const panels = mountOverlay(host, context)!;
  const section = host.querySelector<HTMLElement>('.tpp-hudStreet')!;
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => section.querySelector<T>(sel)!;
  const widths = () => [...section.querySelectorAll<HTMLElement>('.tpp-chunks b')].map(b => b.style.width);
  const dispatch = (...actions: Action[]) => { for (const a of actions) context.store.dispatch(a); };
  return { context, host, panels, section, q, widths, dispatch };
}
const milestone = () => (parseSaveValue(content, JSON.parse(fixtureText('save-v1.milestone.json'))) as { state: GameState }).state;
const ends: Action[] = [{ type: 'cutsceneFinished' }, { type: 'collectRewards' }, { type: 'closeReveal' }];
const rows = (context: ViewContext) => linesOf(context, 'roundup.fired') as { currentCents: number }[];

describe('VERIFY-MEC-002-026 street HUD bar', () => {
  const t = 'VERIFY-MEC-002-026 partial: bar part, jsdom (HEADLESS: dataset, inline style and text, no layout or transition progress; Chrome in work-020-1.mjs; toast half WORK-019-3; iPhone not-run (user, play session)) — ';
  it(`${t}label "Pet House" and "$12.60 / $15.00" at current 1260; chunk widths by the mec-002 §3.3 formula`, () => {
    const h = hud(owing(content, 1, 1260));
    expect(h.q('.tpp-project-label').textContent).toBe('Pet House$12.60 / $15.00');
    expect(h.widths()).toEqual(['100%', '100%', '100%', '100%', '20%']);
    expect(chunkFills(410, 1500)).toEqual([100, (110 * 100) / 300, 0, 0, 0]);
    expect(chunkFills(0, 1500)).toEqual([0, 0, 0, 0, 0]);
    expect(chunkFills(1500, 1500)).toEqual([100, 100, 100, 100, 100]);
  });

  it(`${t}every roundup.fired nudges to currentCents over 300 ms (events arm; DEC-049 §1: once the toast's coins land, 600 ms after the shown toast); debugSetCurrent / phase.reached re-render with barMs '0'`, async () => {
    vi.useFakeTimers();
    const h = hud(owing(content, 1, 1260));
    for (let i = 0; i < 3; i++) {
      h.dispatch({ type: 'debugSimulatePurchase' });
      await Promise.resolve();
      vi.advanceTimersByTime(600);
      const last = rows(h.context).at(-1)!;
      expect([h.section.dataset.barCents, h.section.dataset.barMs]).toEqual([String(last.currentCents), '300']);
      expect(h.q('.tpp-chunks b').style.transition).toBe('width 300ms linear');
    }
    expect(rows(h.context)).toHaveLength(3);
    h.dispatch({ type: 'debugSetCurrent', projectId: 'pet-house', cents: 1350 });
    expect([h.section.dataset.barCents, h.section.dataset.barMs]).toEqual(['1350', '0']);
    vi.useRealTimers();
  });

  it(`${t}hidden in an interior, shown on the street; the door walk (scene.changed) hides it`, () => {
    expect(hud(designIn(content)).section.hidden).toBe(true);
    const state = owing(content, 1, 1260);
    state.avatar = { ...state.avatar, x: 480, y: 900, facing: 'up', immunityMs: 0 };
    const h = hud(state);
    expect(h.section.hidden).toBe(false);
    h.dispatch({ type: 'tick', dtMs: 16, move: { x: 0, y: -1 } });
    expect(h.context.store.getState().scene.kind).toBe('interior');
    expect(h.section.hidden).toBe(true);
  });

  it(`${t}WORK-034-3: "More homes coming" is retired (interim contract) — absent with or without an active project`, () => {
    const h = hud(owing(content, 1, 1260));
    expect(h.section.querySelector('.tpp-more-homes')).toBeNull();
    h.dispatch({ type: 'debugCompleteProject', projectId: 'pet-house' });
    expect(h.section.querySelector('.tpp-more-homes')).toBeNull();
    expect(h.section.textContent).not.toContain('More homes coming');
  });
});

describe('VERIFY-MEC-010-015 trickle glide', () => {
  it('VERIFY-MEC-010-015 partial: glide, jsdom (log identity half WORK-004; Chrome in work-020-1.mjs; iPhone not-run (user, play session)) — the trickle arm glides over one eventIntervalMs (2000)', () => {
    const h = hud(owing(content, 1, 900));
    h.dispatch({ type: 'debugSetFeedPresentation', mode: 'trickle' }, { type: 'debugSetEventInterval', ms: 2000 }, { type: 'debugSimulatePurchase' });
    expect([h.section.dataset.barCents, h.section.dataset.barMs]).toEqual([String(rows(h.context).at(-1)!.currentCents), '2000']);
    expect(h.q('.tpp-chunks b').style.transition).toBe('width 2000ms linear');
  });
});

describe('mec-003 §1 reveal icon stub and presentation §7.1 frozen', () => {
  it('mec-003 §1 reveal icon (WORK-023-1, retitled from the M1 stub) — visible on a rising project; a click records exactly one ui.revealPanel {open:true}, written by the reveal panel it opens', () => {
    const h = hud(owing(content, 1, 1260));
    expect(h.q('.tpp-reveal-link').hidden).toBe(false);
    click(h.q('.tpp-reveal-link'));
    expect(linesOf(h.context, 'ui.revealPanel')).toEqual([{ type: 'ui.revealPanel', open: true }]);
    expect(h.host.querySelector<HTMLElement>('.tpp-revealPanel')!.hidden).toBe(false);
  });

  it('mec-003 §1 reveal icon — fork 1: selector verbatim, M2 play session (review M-1): at current = goal with ack 1 (debugCompleteProject) the icon stays visible', () => {
    const h = hud(owing(content, 1, 1260));
    h.dispatch({ type: 'debugCompleteProject', projectId: 'pet-house' });
    expect(h.context.store.getState().projects['pet-house']).toMatchObject({ currentCents: 1500, acknowledgedPhase: 1, complete: false });
    expect(h.q('.tpp-reveal-link').hidden).toBe(false);
  });

  it('presentation §7.1 hudStreet frozen — celebration.started adds .frozen, pointer-events none, opacity 0.6, reveal disabled; celebration.ended removes them', () => {
    const h = hud(owing(content, 1, 1260));
    h.dispatch({ type: 'acknowledgeProject', projectId: 'pet-house' });
    expect([h.section.classList.contains('frozen'), h.section.style.pointerEvents, h.section.style.opacity, h.q<HTMLButtonElement>('.tpp-reveal-link').disabled])
      .toEqual([true, 'none', '0.6', true]);
    h.dispatch(...ends);
    expect(linesOf(h.context, 'celebration.ended')).toHaveLength(1);
    expect([h.section.classList.contains('frozen'), h.section.style.pointerEvents, h.section.style.opacity, h.q<HTMLButtonElement>('.tpp-reveal-link').disabled])
      .toEqual([false, '', '', false]);
  });

  it('presentation §7.1 hudStreet frozen — a mount mid-celebration starts frozen, the replay celebration.started keeps it (idempotent), state.reset clears it', () => {
    const h = hud(milestone());
    expect(h.section.classList.contains('frozen')).toBe(true);
    h.context.store.start();
    expect(linesOf(h.context, 'celebration.started')).toMatchObject([{ replay: true }]);
    expect(h.section.classList.contains('frozen')).toBe(true);
    h.dispatch({ type: 'reset', seed: 1 });
    expect(h.section.classList.contains('frozen')).toBe(false);
  });
});

describe('VERIFY-MEC-010-012 street debug entry', () => {
  it('VERIFY-MEC-010-012 partial: street entry, jsdom (Chrome in work-020-1.mjs; iPhone not-run (user, play session)) — one tap opens (one ui.debugPanel {open:true}), the next closes (one {open:false}); the interior entry behaves the same', () => {
    const h = hud(initialState(content, 1));
    click(h.host.querySelector('.tpp-hudStreet .tpp-debug-entry'));
    expect([linesOf(h.context, 'ui.debugPanel'), h.context.debugOpen]).toEqual([[{ type: 'ui.debugPanel', open: true }], true]);
    click(h.host.querySelector('.tpp-hudStreet .tpp-debug-entry'));
    expect([linesOf(h.context, 'ui.debugPanel'), h.context.debugOpen]).toEqual([[{ type: 'ui.debugPanel', open: true }, { type: 'ui.debugPanel', open: false }], false]);
    click(h.host.querySelector('.tpp-hudInterior .tpp-debug-entry'));
    click(h.host.querySelector('.tpp-hudInterior .tpp-debug-entry'));
    expect(linesOf(h.context, 'ui.debugPanel').map(l => l.open)).toEqual([true, false, true, false]);
  });
});

describe('VERIFY-WORK-038-3-01 round-up coins and the delayed nudge (DEC-049 §1)', () => {
  it('VERIFY-WORK-038-3-01: a shown round-up launches 1 (< 50¢) or 2 coins at 150 that land at 600; the bar holds, then nudges over 300 with the glow and tick −5 st at 0.35 on landing; never a flash', async () => {
    vi.useFakeTimers();
    try {
      const h = hud(owing(content, 1, 900));
      const play = vi.spyOn(h.context.audio!, 'play');
      const seen: [number, number][] = [];
      for (let i = 0; i < 6; i++) {
        const before = h.section.dataset.barCents;
        play.mockClear();
        h.dispatch({ type: 'debugSimulatePurchase' });
        await Promise.resolve();
        const change = rows(h.context).at(-1)! as unknown as { changeCents: number; currentCents: number };
        vi.advanceTimersByTime(149);
        expect(h.host.querySelector('.tpp-roundup-coins')).toBeNull();
        vi.advanceTimersByTime(1);
        seen.push([change.changeCents, h.host.querySelectorAll('.tpp-roundup-coins .tpp-glyph').length]);
        vi.advanceTimersByTime(449);
        expect([h.section.dataset.barCents, play.mock.calls.filter(c => c[0] === 'tick')]).toEqual([before, []]);
        vi.advanceTimersByTime(1);
        expect([h.section.dataset.barCents, h.section.dataset.barMs]).toEqual([String(change.currentCents), '300']);
        expect(play.mock.calls.filter(c => c[0] === 'tick')).toEqual([['tick', { semitones: -5, volume: 0.35 }]]);
        vi.advanceTimersByTime(4000);
      }
      expect(seen.every(([cents, coins]) => coins === (cents < 50 ? 1 : 2))).toBe(true);
      expect(Number(h.q('.tpp-chunks').dataset.glows)).toBe(6);
    } finally { vi.useRealTimers(); }
  });

  it('VERIFY-WORK-038-3-01: the trickle arm shows no coin and plays no sound; the glide starts at the event', async () => {
    vi.useFakeTimers();
    try {
      const h = hud(owing(content, 1, 900));
      const play = vi.spyOn(h.context.audio!, 'play');
      h.dispatch({ type: 'debugSetFeedPresentation', mode: 'trickle' }, { type: 'debugSetEventInterval', ms: 2000 }, { type: 'debugSimulatePurchase' });
      expect(h.section.dataset.barMs).toBe('2000');
      vi.advanceTimersByTime(1000);
      expect([h.host.querySelectorAll('.tpp-roundup-coins').length, play.mock.calls.length]).toEqual([0, 0]);
    } finally { vi.useRealTimers(); }
  });
});

describe('VERIFY-WORK-038-3-01 post-run (review A1): no stale coin landing', () => {
  it('VERIFY-WORK-038-3-01 (review A1): a toast queued behind another launches no coins when it shows, so the next held round-up nudges at its event with no tick', async () => {
    vi.useFakeTimers();
    try {
      const h = hud(owing(content, 1, 900));
      const play = vi.spyOn(h.context.audio!, 'play');
      const coins: unknown[] = [];
      const onCoins = (e: Event) => coins.push((e as CustomEvent).detail);
      window.addEventListener(ROUNDUP_COINS, onCoins);
      try {
        h.dispatch({ type: 'debugSimulatePurchase' });
        await Promise.resolve();
        h.dispatch({ type: 'debugSimulatePurchase' });
        await Promise.resolve();
        expect([coins.length, h.panels.toast.queued()]).toEqual([1, 1]);
        vi.advanceTimersByTime(150 + 3000 + 200);
        expect([h.panels.toast.queued(), coins.length]).toEqual([0, 1]);
        play.mockClear();
        h.dispatch({ type: 'debugSimulatePurchase' });
        await Promise.resolve();
        const third = rows(h.context).at(-1)!;
        expect([h.panels.toast.queued(), h.section.dataset.barCents, h.section.dataset.barMs]).toEqual([1, String(third.currentCents), '300']);
        vi.advanceTimersByTime(1000);
        expect([coins.length, play.mock.calls.filter(c => c[0] === 'tick')]).toEqual([1, []]);
      } finally { window.removeEventListener(ROUNDUP_COINS, onCoins); }
    } finally { vi.useRealTimers(); }
  });
});

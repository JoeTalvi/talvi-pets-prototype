// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../src/sim/state';
import { createText } from '../../src/ui/overlay';
import realStrings from '../../src/content/strings.json';
import { designSetup, linesOf } from './designHarness';
import { destroyScene } from './sceneHarness';
import { ROUNDUP_COINS } from '../../src/ui/panels/toast';

afterEach(() => { vi.useRealTimers(); destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

type Setup = Awaited<ReturnType<typeof designSetup>>;
const toast = (s: Setup) => s.root.querySelector<HTMLElement>('.tpp-toast')!;
const fake = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
const fires = (s: Setup) => linesOf(s.context, 'roundup.fired');
/** Ticks (sim time only, no view timers) until `n` more round-ups have fired. */
const fireRoundups = (s: Setup, n: number) => {
  const target = fires(s).length + n;
  for (let i = 0; i < 400 && fires(s).length < target; i++) s.context.store.dispatch({ type: 'tick', dtMs: 50, move: { x: 0, y: 0 } });
  expect(fires(s).length).toBe(target);
};
const expected = (line: Record<string, unknown>) => `${line.merchantName} $${((line.amountCents as number) / 100).toFixed(2)} → ${line.changeCents}¢ to Fixture`;

async function setup(edit?: (s: GameState) => void): Promise<Setup> {
  const s = await designSetup({ mode: 'play', edit: st => { edit?.(st); } });
  s.context.store.dispatch({ type: 'debugSetEventInterval', ms: 250 });
  fake();
  return s;
}

describe('VERIFY-MEC-002-026 toast queue', () => {
  it('VERIFY-MEC-002-026 partial: jsdom queue — first round-up shows its text and +change badge; the second is queued and shows after 150 + 3000 + 200 ms', async () => {
    const s = await setup();
    fireRoundups(s, 1);
    const [first] = fires(s);
    expect(toast(s).hidden).toBe(false);
    expect(toast(s).querySelector('[data-string-key="tpp.toast.roundup"]')!.textContent).toBe(expected(first));
    expect(toast(s).querySelector('.tpp-toast-delta')!.textContent).toBe(`+${first.changeCents}¢`);
    fireRoundups(s, 1);
    expect(s.panels.toast.queued()).toBe(1);
    vi.advanceTimersByTime(150 + 3000 + 199);
    expect(toast(s).querySelector('[data-string-key="tpp.toast.roundup"]')!.textContent).toBe(expected(first));
    vi.advanceTimersByTime(1);
    expect([toast(s).hidden, s.panels.toast.queued()]).toEqual([false, 0]);
    expect(toast(s).querySelector('[data-string-key="tpp.toast.roundup"]')!.textContent).toBe(expected(fires(s)[1]));
    vi.advanceTimersByTime(3350);
    expect(toast(s).hidden).toBe(true);
  });

  it('presentation §8.2 toast — tpp.toast.delta "+{change}" → "+60¢" from the real strings.json (WORK-021-1 strings merge; was the fallback table)', () => {
    expect(createText(realStrings as Record<string, string>)('tpp.toast.delta', { change: '60¢' })).toBe('+60¢');
    expect(createText({})('tpp.toast.delta', { change: '60¢' })).toBe('[tpp.toast.delta]');
  });
});

describe('core §9 Q7(a)', () => {
  it('core §9 Q7(a) toast held while a dialogue is open, drained in order after the last dialogue.closed', async () => {
    const s = await setup(st => { st.session.orientationShown = false; });
    s.context.store.dispatch({ type: 'tick', dtMs: 0, move: { x: 0, y: 0 } });
    expect(s.state().dialogue.current).not.toBeNull();
    // WORK-032-1 fix 1: the feed banks nothing while a dialogue is open, so the held round-ups come from the debug purchase.
    for (let i = 0; i < 2; i++) s.context.store.dispatch({ type: 'debugSimulatePurchase' });
    expect(fires(s)).toHaveLength(2);
    expect([toast(s).hidden, s.panels.toast.queued()]).toEqual([true, 2]);
    for (let i = 0; i < 10 && s.state().dialogue.current !== null; i++) s.context.store.dispatch({ type: 'advanceDialogue' });
    expect([toast(s).hidden, s.panels.toast.queued()]).toEqual([false, 1]);
    expect(toast(s).querySelector('[data-string-key="tpp.toast.roundup"]')!.textContent).toBe(expected(fires(s)[0]));
    vi.advanceTimersByTime(3350);
    expect(toast(s).querySelector('[data-string-key="tpp.toast.roundup"]')!.textContent).toBe(expected(fires(s)[1]));
  });

  it('core §9 Q7(a) toast held while a celebration is open; state.reset clears the queue', async () => {
    const s = await setup(st => { st.celebration = { projectId: 'pet-house', fromPhase: 0, toPhase: 1, step: 'milestone', completes: false, unlockedTypeIds: [], skipTaken: false }; });
    fireRoundups(s, 1);
    expect([toast(s).hidden, s.panels.toast.queued()]).toEqual([true, 1]);
    s.context.store.dispatch({ type: 'reset' });
    expect([toast(s).hidden, s.panels.toast.queued()]).toEqual([true, 0]);
  });
});

describe('VERIFY-MEC-010-015 trickle arm', () => {
  it('VERIFY-MEC-010-015 partial: desktop toast half (jsdom) — in trickle round-ups are logged, none shown or queued; back to events → new events toast', async () => {
    const s = await setup();
    s.context.store.dispatch({ type: 'debugSetFeedPresentation', mode: 'trickle' });
    fireRoundups(s, 2);
    expect([toast(s).hidden, s.panels.toast.queued()]).toEqual([true, 0]);
    s.context.store.dispatch({ type: 'debugSetFeedPresentation', mode: 'events' });
    fireRoundups(s, 1);
    expect(toast(s).hidden).toBe(false);
    expect(toast(s).querySelector('[data-string-key="tpp.toast.roundup"]')!.textContent).toBe(expected(fires(s).at(-1)!));
  });
});

describe('presentation §8 mount order (WORK-019-3, WORK-020-1, WORK-020-3, WORK-023-1)', () => {
  it('presentation §8 mount order (WORK-019-3, WORK-020-1, WORK-020-3, WORK-015-2, WORK-023-1) — #panels: hudInterior, hudStreet, toast, wantPanel, dialogue, chooser, replaceRemove, milestonePopup, revealPopup, revealPanel, debugPanel, roomEditor; Panels.dialogue and Panels.toast defined', async () => {
    const s = await designSetup();
    expect([...s.root.querySelectorAll<HTMLElement>('[data-panel]')].map(c => c.dataset.panel))
      .toEqual(['hudInterior', 'hudStreet', 'closet', 'toast', 'wantPanel', 'dialogue', 'chooser', 'replaceRemove', 'milestonePopup', 'revealPopup', 'revealPanel', 'debugPanel', 'roomEditor']);   // WORK-037-3: closet after hudStreet
    expect([typeof s.panels.dialogue.isDeferred, typeof s.panels.toast.queued]).toEqual(['function', 'function']);
  });
});

describe('VERIFY-WORK-038-3-01 fix round 1 (review F2, A1): coins only toward a visible street bar, only for a toast shown at its event', () => {
  const coinEvents = () => { const seen: unknown[] = []; window.addEventListener(ROUNDUP_COINS, e => seen.push((e as CustomEvent).detail)); return seen; };

  it('VERIFY-WORK-038-3-01: inside a room the round-up toast shows with no coins, no ROUNDUP_COINS and no landing tick', async () => {
    const s = await setup();
    expect(s.state().scene.kind).toBe('interior');
    const seen = coinEvents();
    const play = vi.spyOn(s.context.audio!, 'play');
    fireRoundups(s, 1);
    expect(toast(s).hidden).toBe(false);
    vi.advanceTimersByTime(1000);
    expect([seen, s.root.querySelectorAll('.tpp-roundup-coins').length, play.mock.calls.filter(c => c[0] === 'tick')]).toEqual([[], 0, []]);
  });

  it('VERIFY-WORK-038-3-01: a held round-up that shows after the dialogue closes launches no coins (no stale landing)', async () => {
    const s = await setup(st => { st.session.orientationShown = false; });
    s.context.store.dispatch({ type: 'tick', dtMs: 0, move: { x: 0, y: 0 } });
    const seen = coinEvents();
    s.context.store.dispatch({ type: 'debugSimulatePurchase' });
    for (let i = 0; i < 10 && s.state().dialogue.current !== null; i++) s.context.store.dispatch({ type: 'advanceDialogue' });
    expect(toast(s).hidden).toBe(false);
    vi.advanceTimersByTime(1000);
    expect([seen, s.root.querySelectorAll('.tpp-roundup-coins').length]).toEqual([[], 0]);
  });
});

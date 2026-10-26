// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DialogueScript, GameState } from '../../src/sim/state';
import { designSetup, linesOf, pointer } from './designHarness';
import { destroyScene } from './sceneHarness';

afterEach(() => { vi.useRealTimers(); destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

type Setup = Awaited<ReturnType<typeof designSetup>>;
const box = (s: Setup) => s.root.querySelector<HTMLElement>('.tpp-dialogue')!;
const textOf = (s: Setup, sel: string) => box(s).querySelector(sel)?.textContent ?? null;
const tick = (s: Setup, ms = 100) => { s.context.store.dispatch({ type: 'tick', dtMs: ms, move: { x: 0, y: 0 } }); vi.advanceTimersByTime(ms); };
const fake = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
const introScript = (lines: string[]): DialogueScript => ({ source: 'intro', speaker: { petId: 'dog' }, lines: [...lines], index: 0 });
const play = (s: GameState) => { s.mode = 'play'; };

describe('presentation §8.2 dialogue', () => {
  it('presentation §8.2 dialogue — game narration (orientation): text-only, no portrait, speaker Talvi, line 0, Tap to continue; advance swaps, close hides', async () => {
    const s = await designSetup({ mode: 'play', edit: st => { st.session.orientationShown = false; } });
    expect(box(s).hidden).toBe(true);
    s.context.store.dispatch({ type: 'tick', dtMs: 0, move: { x: 0, y: 0 } });
    const lines = s.context.content.dialogue.orientation;
    expect(box(s).hidden).toBe(false);
    expect(box(s).classList.contains('text-only-game')).toBe(true);
    expect(box(s).querySelector('.tpp-portrait')).toBeNull();
    expect([textOf(s, '.tpp-speaker'), textOf(s, '.tpp-dialogue-line'), textOf(s, '.tpp-continue')]).toEqual(['Talvi', lines[0], 'Tap to continue']);
    s.context.store.dispatch({ type: 'advanceDialogue' });
    expect(linesOf(s.context, 'dialogue.advanced').at(-1)).toMatchObject({ index: 1 });
    expect(textOf(s, '.tpp-dialogue-line')).toBe(lines[1]);
    s.context.store.dispatch({ type: 'advanceDialogue' });
    expect(linesOf(s.context, 'dialogue.closed').at(-1)).toMatchObject({ source: 'orientation' });
    expect(box(s).hidden).toBe(true);
  });

  it('presentation §8.2 dialogue — pet speech: portrait img pets/dog-portrait, speaker Dog, no .text-only-game; mounted once; destroy() removes it', async () => {
    const s = await designSetup({ edit: st => { st.dialogue.current = introScript(['Line A.', 'Line B.']); } });
    expect(box(s).hidden).toBe(false);
    expect(box(s).querySelector('.tpp-portrait img[data-asset-id="pets/dog-portrait"]')).not.toBeNull();
    expect([textOf(s, '.tpp-speaker'), textOf(s, '.tpp-dialogue-line')]).toEqual(['Dog', 'Line A.']);
    expect(box(s).classList.contains('text-only-game')).toBe(false);
    expect(s.root.querySelectorAll('.tpp-dialogue')).toHaveLength(1);
    s.panels.dialogue.destroy();
    expect(s.root.querySelector('.tpp-dialogue')).toBeNull();
  });

  it('presentation §8.2 dialogue — portrait placeholder .tpp-asset-slot when the portrait asset is omitted', async () => {
    const s = await designSetup({ omitAssets: ['pets/dog-portrait'], edit: st => { st.dialogue.current = introScript(['Line A.']); } });
    expect(box(s).querySelector('.tpp-portrait .tpp-asset-slot[data-asset-id="pets/dog-portrait"]')).not.toBeNull();
  });

  it('presentation §8.2 dialogue — wantAnnounce after the intro closes swaps in place (close then open in one dispatch)', async () => {
    const s = await designSetup({ edit: st => { st.dialogue.current = introScript(['Only line.']); st.dialogue.queue = [{ source: 'wantAnnounce', speaker: { petId: 'dog' }, lines: ['A wish.'], index: 0 }]; } });
    s.context.store.dispatch({ type: 'advanceDialogue' });
    expect(box(s).hidden).toBe(false);
    expect(textOf(s, '.tpp-dialogue-line')).toBe('A wish.');
    expect(box(s).dataset.source).toBe('wantAnnounce');
  });
});

describe('VERIFY-MEC-008-017 tap anywhere', () => {
  it('VERIFY-MEC-008-017 partial: jsdom — each click on the backdrop or the box dispatches exactly one advanceDialogue; no ui.* record; tapPet while open is rejected dialogueOpen', async () => {
    const s = await designSetup({ edit: st => { play(st); st.dialogue.current = introScript(['One.', 'Two.', 'Three.']); } });
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    (box(s).querySelector('.tpp-dialogue-backdrop') as HTMLElement).click();
    (box(s).querySelector('.tpp-dialogue-line') as HTMLElement).click();
    expect(dispatch.mock.calls.map(c => c[0])).toEqual([{ type: 'advanceDialogue' }, { type: 'advanceDialogue' }]);
    expect(linesOf(s.context, 'dialogue.advanced').map(l => l.index)).toEqual([1, 2]);
    expect(s.context.log.lines().filter(l => l.type.startsWith('ui.'))).toEqual([]);
    dispatch.mockClear();
    pointer(s.scene, 1100, 760);
    expect(dispatch.mock.calls.filter(c => c[0].type === 'tapPet')).toEqual([]);
    s.context.store.dispatch({ type: 'tapPet', petId: 'dog' });
    expect(linesOf(s.context, 'action.rejected').at(-1)).toMatchObject({ reason: 'dialogueOpen' });
    expect(linesOf(s.context, 'pet.tapped')).toEqual([]);
  });
});

describe('VERIFY-MEC-008-015 deferral after fulfilment', () => {
  it('VERIFY-MEC-008-015 partial: jsdom timing — the vignette box stays hidden through the walk and shows fulfilmentUseHoldMs after {to:reacting, target large-1}', async () => {
    const s = await designSetup();
    fake();
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    expect(s.state().dialogue.current?.source).toBe('vignette');
    expect([box(s).hidden, s.panels.dialogue.isDeferred()]).toEqual([true, true]);
    // `t` is the fake clock at the tick's dispatch; the clock then advances 100 ms before the next read.
    let reactingAt = -1, shownAt = -1;
    for (let t = 0; t <= 8000 && shownAt < 0; t += 100) {
      tick(s);
      if (reactingAt < 0 && linesOf(s.context, 'pet.phaseChanged').some(l => l.to === 'reacting' && (l.target as { slotId?: string })?.slotId === 'large-1')) reactingAt = t;
      if (!box(s).hidden) shownAt = t + 100;
    }
    expect(reactingAt).toBeGreaterThan(0);
    expect(shownAt - reactingAt).toBe(s.context.content.tuning.fulfilmentUseHoldMs);
    expect(shownAt).toBeLessThanOrEqual(7000);
    expect([textOf(s, '.tpp-dialogue-line'), s.panels.dialogue.isDeferred()]).toEqual([s.state().dialogue.current!.lines[0], false]);
  });

  it('VERIFY-MEC-008-015 partial: jsdom timing — when {to:reacting} never arrives (no ticks) the bound shows the box 7000 ms after want.fulfilled', async () => {
    const s = await designSetup();
    fake();
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    vi.advanceTimersByTime(6999);
    expect(box(s).hidden).toBe(true);
    vi.advanceTimersByTime(1);
    expect([box(s).hidden, s.panels.dialogue.isDeferred()]).toEqual([false, false]);
  });
});

describe('core §6.4 intro deferral', () => {
  it('core §6.4 intro deferred until the greeting — first entry: box hidden while the Dog walks over, shown on {to:greeting} at index 0', async () => {
    const s = await designSetup({ edit: st => {
      play(st); st.scene = { kind: 'street' } as GameState['scene']; st.pets.dog.introduced = false;
      st.avatar = { ...st.avatar, x: 200, y: 830, facing: 'up' };
    } });
    fake();
    for (let i = 0; i < 20 && s.state().scene.kind === 'street'; i++) { s.context.store.dispatch({ type: 'tick', dtMs: 100, move: { x: 0, y: -1 } }); vi.advanceTimersByTime(100); }
    expect(s.state().dialogue.current?.source).toBe('intro');
    expect([box(s).hidden, s.panels.dialogue.isDeferred()]).toEqual([true, true]);
    let elapsed = 0;
    while (s.state().pets.dog.behaviour.phase !== 'greeting' && elapsed < 6000) { expect(box(s).hidden).toBe(true); tick(s); elapsed += 100; }
    expect(elapsed).toBeLessThanOrEqual(s.context.content.tuning.walkOverMs);
    expect(box(s).hidden).toBe(false);
    expect([textOf(s, '.tpp-speaker'), textOf(s, '.tpp-dialogue-line'), s.state().dialogue.current!.index]).toEqual(['Dog', s.state().dialogue.current!.lines[0], 0]);
    expect(s.root.querySelector<HTMLElement>('.tpp-chooser')?.hidden ?? true).toBe(true);
  });
});

describe('VERIFY-MEC-009-020 reload mid-chain', () => {
  it('VERIFY-MEC-009-020 partial: desktop "no pet sequence" (view) — a saved vignette renders at once at line 0, not deferred; the walking Dog continues from state', async () => {
    const s = await designSetup({ edit: st => {
      play(st);
      st.dialogue.current = { source: 'vignette', speaker: { petId: 'dog' }, lines: ['A new corner.', 'Two.', 'Three.'], index: 0, wantId: 'soft-nap' };
      st.pets.dog.behaviour = { phase: 'walking', x: 800, y: 700, facing: 'left', timerMs: 0, target: { slotId: 'large-1' }, verb: null, reaction: null };
    } });
    expect([box(s).hidden, s.panels.dialogue.isDeferred(), textOf(s, '.tpp-dialogue-line')]).toEqual([false, false, 'A new corner.']);
    expect(s.state().pets.dog.behaviour.phase).toBe('walking');
  });

  it('core §3 state.reset hides the box and clears a pending deferral', async () => {
    const s = await designSetup();
    fake();
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    expect(s.panels.dialogue.isDeferred()).toBe(true);
    s.context.store.dispatch({ type: 'reset' });
    expect([box(s).hidden, s.panels.dialogue.isDeferred()]).toEqual([true, false]);
  });
});

// @vitest-environment jsdom
import '../view/setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '../../src/sim/state';
import { initialState } from '../../src/sim/state';
import type { SimEvent } from '../../src/sim/events';
import { mountOverlay } from '../../src/ui/overlay';
import { CLOSET_FALLBACK_AT, closetTiles, createCloset } from '../../src/ui/panels/closet';
import { OUTFIT_TILE_PX, POPUP_FADE_MS } from '../../src/ui/panels/milestonePopup';
import { createText } from '../../src/ui/overlay';
import { CARD, SFX_VOLUMES } from '../../src/view/celebration/timings';
import type { ViewContext } from '../../src/view/context';
import { realContent } from '../sim/helpers';
import { contextFor } from '../view/sceneHarness';

afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const content = realContent();
const fresh = (edit: (s: GameState) => void = () => {}): GameState => {
  const state = structuredClone(initialState(content, 1234));
  state.dialogue.current = null; state.mode = 'play';
  edit(state);
  return state;
};
const INTRO = { source: 'intro', speaker: { petId: 'owl-mate' }, lines: ['Hello!'], index: 0 } as const satisfies GameState['dialogue']['current'];
const petHouseDone = (s: GameState) => { s.projects['pet-house'].complete = true; };
const gardenArrived = (s: GameState) => { s.spaces.garden.arrivalDone = true; };

function mount(state: GameState) {
  const context = contextFor(content, state);
  const host = document.createElement('div'); host.id = 'panels'; document.body.append(host);
  const panels = mountOverlay(host, context)!;
  const button = host.querySelector<HTMLButtonElement>('.tpp-closet-button')!;
  const picker = host.querySelector<HTMLElement>('[data-panel="closet"]')!;
  const tiles = () => [...picker.querySelectorAll<HTMLButtonElement>('.tpp-closet-tile')];
  return { context, host, panels, button, picker, tiles };
}

describe('VERIFY-WORK-037-3 Closet button (gate Q14(a))', () => {
  it('hidden while only the default is unlocked', () => {
    const { button } = mount(fresh());
    expect(button.hidden).toBe(true);
  });

  it('visible once the Pet House is complete; hidden in design mode; disabled while a dialogue freezes input', () => {
    const { button, context } = mount(fresh(petHouseDone));
    expect([button.hidden, button.disabled]).toEqual([false, false]);
    expect(button.getAttribute('aria-label')).toBe('Closet');
    expect(button.querySelector('[data-asset-id="ui/icon-closet"]')).not.toBeNull();
    void context;
    expect(mount(fresh(s => { petHouseDone(s); s.mode = 'design'; })).button.hidden).toBe(true);
    const frozen = mount(fresh(s => { petHouseDone(s); s.dialogue.current = INTRO; }));
    expect([frozen.button.hidden, frozen.button.disabled]).toEqual([false, true]);
  });
});

describe('VERIFY-WORK-037-3 Closet picker (DEC-047: three tiles)', () => {
  it('three tiles in content order; locked tile disabled with the mystery shape; worn tile selected', () => {
    const { button, picker, tiles } = mount(fresh(petHouseDone));
    expect(picker.hidden).toBe(true);
    button.click();
    expect(picker.hidden).toBe(false);
    expect(tiles().map(t => [t.dataset.outfitId, t.disabled, t.classList.contains('selected')])).toEqual([
      ['default', false, true], ['cosy', false, false], ['garden', true, false]]);
    expect(tiles()[2].querySelector('[data-asset-id="ui/mystery-shape"]')).not.toBeNull();
    expect(tiles()[1].querySelector('[data-asset-id="player/avatar-cosy-sheet"]')).not.toBeNull();
    expect(tiles()[1].getAttribute('aria-label')).toBe('Cosy set');
  });

  it('choosing an unlocked, not-worn tile dispatches chooseOutfit and closes; the worn tile and ✕ / backdrop just close', () => {
    const { button, picker, tiles, context } = mount(fresh(s => { petHouseDone(s); gardenArrived(s); }));
    const dispatch = vi.spyOn(context.store, 'dispatch');
    button.click(); tiles()[0].click();
    expect([picker.hidden, dispatch.mock.calls.length]).toEqual([true, 0]);
    button.click(); picker.querySelector<HTMLElement>('.tpp-close')!.click();
    expect(picker.hidden).toBe(true);
    button.click(); picker.querySelector<HTMLElement>('.tpp-dismiss-backdrop')!.click();
    expect(picker.hidden).toBe(true);
    button.click(); tiles()[2].click();
    expect(dispatch.mock.calls.map(c => c[0])).toEqual([{ type: 'chooseOutfit', outfitId: 'garden' }]);
    expect([picker.hidden, context.store.getState().avatar.outfitId]).toEqual([true, 'garden']);
    button.click();
    expect(tiles().map(t => t.classList.contains('selected'))).toEqual([false, false, true]);
  });

  it('closetTiles reads unlocks from the selector (derived) and the worn outfit from state', () => {
    const text = createText(content.strings);
    expect(closetTiles({ content }, text, fresh(gardenArrived)).map(t => [t.id, t.unlocked])).toEqual([['default', true], ['cosy', false], ['garden', true]]);
  });
});

describe('VERIFY-WORK-037-3 completion popup outfit tile (gate Q13(a); spec §6)', () => {
  it('the Pet House completion popup has an outfit card tile after the charm tiles, flipped in with reveal 0.7 and "New"', () => {
    vi.useFakeTimers();
    const state = fresh(s => { s.celebration = { projectId: 'pet-house', fromPhase: 5, toPhase: 6, completes: true, unlockedTypeIds: [], step: 'milestone', skipTaken: false }; });
    const context = contextFor(content, state);
    const play = vi.spyOn(context.audio!, 'play');
    const host = document.createElement('div'); document.body.append(host);
    mountOverlay(host, context);
    const tile = host.querySelector<HTMLElement>('.tpp-milestonePopup .tpp-outfit-tile')!;
    expect(tile.dataset.outfitId).toBe('cosy');
    const card = tile.querySelector<HTMLElement>('.tpp-reward-card--outfit')!;
    expect([card.style.width, card.querySelector('.tpp-reward-card-new')?.textContent]).toEqual([`${OUTFIT_TILE_PX}px`, 'New']);
    expect(card.querySelector('.tpp-reward-card-name')!.textContent).toBe('New outfit: Cosy set');
    expect(play).not.toHaveBeenCalled();
    vi.advanceTimersByTime(POPUP_FADE_MS);
    expect(play.mock.calls).toEqual([['reveal', { volume: SFX_VOLUMES.reveal }]]);
  });

  it('a progress (non-completing) popup has no outfit tile', () => {
    const state = fresh(s => { s.celebration = { projectId: 'pet-house', fromPhase: 1, toPhase: 2, completes: false, unlockedTypeIds: [], step: 'milestone', skipTaken: false }; });
    const { host } = mount(state);
    expect(host.querySelector('.tpp-outfit-tile')).toBeNull();
  });
});

/** A store double: records subscriptions so the test can emit `outfit.unlocked` / `dialogue.closed` with a chosen state after. */
function fakeStore(state: GameState) {
  const subs: [string, (e: SimEvent, after: GameState) => void][] = [];
  return {
    store: { getState: () => state, dispatch: vi.fn(), subscribe: (type: string, fn: (e: SimEvent, after: GameState) => void) => { subs.push([type, fn]); return () => {}; } },
    emit: (event: SimEvent, after: GameState) => { for (const [type, fn] of subs) if (type === event.type) fn(event, after); },
  };
}

describe('VERIFY-WORK-037-3 arrival outfit card after the intro dialogue (gate Q13(a), fork 2)', () => {
  it('waits for dialogue.closed, flips with reveal, holds CARD.holdMs, then sends to the Closet button', () => {
    vi.useFakeTimers();
    const base = contextFor(content, fresh());
    const { store, emit } = fakeStore(fresh());
    const context = { ...base, store } as unknown as ViewContext;
    const play = vi.spyOn(base.audio!, 'play');
    const root = document.createElement('div'); document.body.append(root);
    const button = document.createElement('button'); button.hidden = true; root.append(button);
    createCloset(root, context, button);
    const withDialogue = fresh(s => { s.dialogue.current = INTRO; });
    emit({ type: 'outfit.unlocked', outfitId: 'garden', source: 'arrival', siteId: 'garden' }, withDialogue);
    expect(root.querySelector('.tpp-outfit-card')).toBeNull();
    emit({ type: 'dialogue.closed' } as SimEvent, withDialogue);   // a follow-up dialogue is still open
    expect(root.querySelector('.tpp-outfit-card')).toBeNull();
    emit({ type: 'dialogue.closed' } as SimEvent, fresh());
    const card = root.querySelector<HTMLElement>('.tpp-outfit-card')!;
    expect(card.querySelector('.tpp-reward-card-name')!.textContent).toBe('New outfit: Garden set');
    expect([card.style.width, play.mock.calls]).toEqual([`${CARD.px}px`, [['reveal', { volume: SFX_VOLUMES.reveal }]]]);
    const animate = vi.fn(); card.animate = animate as unknown as typeof card.animate;
    vi.advanceTimersByTime(CARD.flipMs + CARD.holdMs - 1);
    expect(animate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    const to = (animate.mock.calls[0][0] as Keyframe[])[1].transform as string;
    expect(to).toContain(`translate(${CLOSET_FALLBACK_AT.x - 960}px`);
    vi.advanceTimersByTime(CARD.sendMs);
    expect(root.querySelector('.tpp-outfit-card')).toBeNull();
  });

  it('shows at once when no dialogue is open; a completion grant shows no standalone card', () => {
    const base = contextFor(content, fresh());
    const { store, emit } = fakeStore(fresh());
    const root = document.createElement('div'); document.body.append(root);
    createCloset(root, { ...base, store } as unknown as ViewContext, document.createElement('button'));
    emit({ type: 'outfit.unlocked', outfitId: 'cosy', source: 'completion', projectId: 'pet-house' }, fresh());
    expect(root.querySelector('.tpp-outfit-card')).toBeNull();
    emit({ type: 'outfit.unlocked', outfitId: 'garden', source: 'arrival', siteId: 'garden' }, fresh());
    expect(root.querySelector('.tpp-outfit-card')).not.toBeNull();
  });
});

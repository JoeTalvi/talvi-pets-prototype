// @vitest-environment jsdom
import './setup';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Content } from '../../src/content/types';
import type { GameState } from '../../src/sim/state';
import type { Action } from '../../src/sim/actions';
import { parseSaveValue } from '../../src/sim/state.schema';
import { mountOverlay } from '../../src/ui/overlay';
import { collectMs, POPUP_FADE_MS, skipLabel } from '../../src/ui/panels/milestonePopup';
import { files, manifest, patchFiles } from '../content/helpers';
import { fixtureText } from '../app/helpers';
import { owing } from '../sim/helpers';
import { contextFor } from './sceneHarness';
import { click, linesOf, REAL_STRINGS } from './designHarness';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); document.body.replaceChildren(); });

const content: Content = loadContent(manifest, patchFiles(files(), REAL_STRINGS));
const H = '(HEADLESS jsdom: hidden, dataset, classes, disabled, text, data-* ids and dispatched actions/records; no layout or Web Animations; Chrome in work-020-3.mjs) — ';

function popups(state: GameState, c: Content = content) {
  const context = contextFor(c, state);
  const host = document.createElement('div'); document.body.append(host);
  const panels = mountOverlay(host, context)!;
  const milestone = host.querySelector<HTMLElement>('.tpp-milestonePopup')!;
  const reveal = host.querySelector<HTMLElement>('.tpp-revealPopup')!;
  const dispatched: Action['type'][] = [];
  const original = context.store.dispatch.bind(context.store);
  context.store.dispatch = (action: Action) => { dispatched.push(action.type); return original(action); };
  const dispatch = (...actions: Action[]) => { for (const a of actions) original(a); };
  const tiles = () => [...milestone.querySelectorAll<HTMLElement>('.tpp-reward-tile')];
  const cards = () => [...reveal.querySelectorAll<HTMLElement>('.tpp-clue')];
  return { context, host, panels, milestone, reveal, dispatched, dispatch, tiles, cards, state: () => context.store.getState() };
}
type Popups = ReturnType<typeof popups>;
const ack = (p: Popups) => p.dispatch({ type: 'acknowledgeProject', projectId: 'pet-house' });
/** FX-CONTENT-MIN `owing(content, 1, 1260)` on the street, acknowledged; the test dispatches `cutsceneFinished` (the director's call). */
function atMilestone(ackPhase = 1, cents = 1260, c: Content = content): Popups {
  const p = popups(owing(c, ackPhase, cents), c);
  ack(p);
  expect(p.milestone.hidden).toBe(true);
  p.dispatch({ type: 'cutsceneFinished' });
  return p;
}
const fixture = (name: string) => (parseSaveValue(content, JSON.parse(fixtureText(name))) as { state: GameState }).state;
const visibleCards = (p: Popups) => p.cards().filter(c => !c.hidden).length;

describe('mec-002 §3.3 milestone popup', () => {
  const t = `mec-002 §3.3 milestone popup ${H}`;
  it(`${t}opens on celebration.stepped {milestone} with the progress strings and one tile per unlockedTypeIds id in order`, () => {
    const p = atMilestone();
    const ids = p.state().celebration!.unlockedTypeIds;
    expect(p.milestone.hidden).toBe(false);
    expect(p.milestone.dataset.state).toBe('normal');
    expect(p.milestone.querySelector('.tpp-heading')!.textContent).toBe('Coming along!');
    expect(p.milestone.querySelector('.tpp-congrats')!.textContent).toBe("Another milestone down. Here's what you've earned so far.");
    expect(p.milestone.querySelector('.tpp-rewards-heading')!.textContent).toBe('Rewards');
    expect(p.tiles().map(tile => tile.dataset.typeId)).toEqual(ids);
    expect(p.tiles().map(tile => tile.getAttribute('aria-label'))).toEqual(ids.map(id => content.charms.types.find(c => c.id === id)!.name));
    expect(p.tiles().map(tile => tile.querySelector('[data-asset-id]')!.getAttribute('data-asset-id'))).toEqual(ids.map(id => `charms/${id}`));
    expect(p.dispatched).toEqual([]);
  });

  it(`${t}a tile click opens the preview with the charm's name and description and records one ui.rewardTile {typeId}; the backdrop dismisses it`, () => {
    const p = atMilestone();
    const id = p.tiles()[1].dataset.typeId!;
    const type = content.charms.types.find(c => c.id === id)!;
    click(p.tiles()[1]);
    const preview = p.milestone.querySelector<HTMLElement>('.tpp-reward-preview.ns-modal')!;
    expect([preview.querySelector('.tpp-preview-name')!.textContent, preview.querySelector('.tpp-preview-description')!.textContent]).toEqual([type.name, type.description]);
    expect(linesOf(p.context, 'ui.rewardTile').map(l => l.typeId)).toEqual([id]);
    click(p.milestone.querySelector('.tpp-preview-backdrop'));
    expect(p.milestone.querySelector('.tpp-reward-preview, .tpp-preview-backdrop')).toBeNull();
    expect(p.dispatched).toEqual([]);
  });

  it(`${t}fork 1 Skip "Skip the wait · $2.40" over "Free in this prototype"; a roundup.fired re-prices it; debugSetCurrent to the goal hides it`, () => {
    const p = atMilestone();
    const skip = p.milestone.querySelector<HTMLElement>('.tpp-skip')!;
    expect([skip.hidden, skip.querySelector('button')!.textContent, skip.querySelector('.tpp-skip-free')!.textContent])
      .toEqual([false, 'Skip the wait · $2.40', 'Free in this prototype']);
    p.dispatch({ type: 'debugSimulatePurchase' });
    const current = p.state().projects['pet-house'].currentCents;
    expect(linesOf(p.context, 'roundup.fired')).toHaveLength(1);
    expect(current).toBeGreaterThan(1260);
    expect(skip.querySelector('button')!.textContent).toBe(`Skip the wait · $${((1500 - current) / 100).toFixed(2)}`);
    p.dispatch({ type: 'debugSetCurrent', projectId: 'pet-house', cents: 1500 });
    expect(skip.hidden).toBe(true);
    expect(skipLabel(key => (key === 'tpp.popup.skipWait' ? 'Skip the wait · {price}'.replace('{price}', '$1.00') : key), 100)).toBe('Skip the wait · $1.00');
  });

});

describe('mec-002 §3.3 milestone popup buttons', () => {
  const t = `mec-002 §3.3 milestone popup ${H}`;
  it(`${t}Skip click dispatches exactly one skipWait; Collect click exactly one collectRewards; both buttons disabled until the next state`, () => {
    const p = atMilestone();
    const skip = p.milestone.querySelector<HTMLButtonElement>('.tpp-skip button')!, collect = p.milestone.querySelector<HTMLButtonElement>('.tpp-collect')!;
    p.context.store.dispatch = (action: Action) => { p.dispatched.push(action.type); return { accepted: false } as never; };
    click(skip); click(skip); click(collect);
    expect(p.dispatched).toEqual(['skipWait']);
    expect([skip.disabled, collect.disabled]).toEqual([true, true]);
    p.dispatch({ type: 'debugSimulatePurchase' });
    expect([skip.disabled, collect.disabled]).toEqual([false, false]);
    click(collect); click(collect);
    expect(p.dispatched).toEqual(['skipWait', 'collectRewards']);
  });

  it(`${t}the completing variant owing(content, 4, 1500) shows "Project Complete!" and no .tpp-skip`, () => {
    const p = atMilestone(4, 1500);
    expect(p.milestone.querySelector('.tpp-heading')!.textContent).toBe('Project Complete!');
    expect(p.milestone.querySelector('.tpp-congrats')!.textContent).toBe("It's finished — go and have a look.");
    expect(p.milestone.querySelector('.tpp-skip')).toBeNull();
  });

  it(`${t}state.reset hides the popup and drops the reveal hand-off`, () => {
    const p = atMilestone();
    p.dispatch({ type: 'reset', seed: 7 });
    vi.advanceTimersByTime(5000);
    expect([p.milestone.hidden, p.reveal.hidden]).toEqual([true, true]);
  });
});

describe('mec-003 §3.3 reveal popup', () => {
  const t = `mec-003 §3.3 reveal popup ${H}`;
  it(`${t}Collect → collecting → hidden, and only then the reveal popup: mystery shape, title, cards Phase 2–4 entering 250 ms apart`, () => {
    const p = atMilestone();
    const n = p.tiles().length;
    click(p.milestone.querySelector('.tpp-collect'));
    expect(p.dispatched).toEqual(['collectRewards']);
    expect(p.state().celebration!.step).toBe('reveal');
    expect([p.milestone.hidden, p.milestone.dataset.state, p.reveal.hidden]).toEqual([false, 'collecting', true]);
    vi.advanceTimersByTime(collectMs(n) - 1);
    expect([p.milestone.hidden, p.reveal.hidden]).toEqual([false, true]);
    vi.advanceTimersByTime(1);
    expect([p.milestone.hidden, p.reveal.hidden]).toEqual([true, false]);
    expect(p.tiles().every(tile => tile.classList.contains('tpp-flash'))).toBe(true);
    expect(p.reveal.querySelector('.tpp-mystery-tile [data-asset-id]')!.getAttribute('data-asset-id')).toBe('ui/mystery-shape');
    expect(p.reveal.querySelector('.tpp-reveal-popup-title')!.textContent).toBe('Someone is moving in');
    expect(p.cards().map(c => c.dataset.cardIndex)).toEqual(['1', '2', '3']);
    expect(p.cards().map(c => c.querySelector('.tpp-clue-phase')!.textContent)).toEqual(['Phase 2', 'Phase 3', 'Phase 4']);
    expect(p.cards().map(c => c.querySelector('[data-asset-id]')!.getAttribute('data-asset-id'))).toEqual(Array(3).fill('clues/fixture'));
    expect(p.cards().map(c => c.querySelector('.tpp-clue-line')!.textContent)).toEqual(Array(3).fill('“A green place to rest.”'));
    expect(visibleCards(p)).toBe(1);
    vi.advanceTimersByTime(content.tuning.revealCardStaggerMs);
    expect(visibleCards(p)).toBe(2);
    vi.advanceTimersByTime(content.tuning.revealCardStaggerMs);
    expect(visibleCards(p)).toBe(3);
  });

  it(`${t}Continue dispatches exactly one closeReveal; celebration.ended hides the popup`, () => {
    const p = atMilestone();
    click(p.milestone.querySelector('.tpp-collect'));
    vi.advanceTimersByTime(collectMs(p.tiles().length));
    const proceed = p.reveal.querySelector<HTMLButtonElement>('.tpp-collect')!;
    expect(proceed.textContent).toBe('Continue');
    click(proceed); click(proceed);
    expect(p.dispatched).toEqual(['collectRewards', 'closeReveal']);
    expect(linesOf(p.context, 'celebration.ended')).toHaveLength(1);
    expect([p.milestone.hidden, p.reveal.hidden, p.state().celebration]).toEqual([true, true, null]);
  });

});

describe('presentation §8.2 reveal popup fade-out', () => {
  it(`mec-003 §3.3 reveal popup ${H}celebration.ended fades the reveal popup out over POPUP_FADE_MS before hiding it (WORK-020-3-1 A-3)`, () => {
    const cancel = vi.fn(), animate = vi.fn(() => ({ cancel }) as unknown as Animation);
    const p = atMilestone();
    click(p.milestone.querySelector('.tpp-collect'));
    vi.advanceTimersByTime(collectMs(p.tiles().length));
    p.reveal.animate = animate;
    click(p.reveal.querySelector('.tpp-collect'));
    expect(linesOf(p.context, 'celebration.ended')).toHaveLength(1);
    expect(animate).toHaveBeenCalledWith([{ opacity: 1 }, { opacity: 0 }], { duration: POPUP_FADE_MS, fill: 'forwards' });
    expect(p.reveal.hidden).toBe(false);
    vi.advanceTimersByTime(POPUP_FADE_MS);
    expect([p.reveal.hidden, cancel.mock.calls.length]).toEqual([true, 1]);
  });
});

describe('mec-003 §3.3 reveal popup on reload', () => {
  const t = `mec-003 §3.3 reveal popup ${H}`;
  it(`${t}a reload at reveal (FX-SAVE-V1-CEL-reveal) shows the popup and every card at once; store.start() keeps exactly one open popup (fork 7)`, () => {
    const p = popups(fixture('save-v1.reveal.json'));
    expect([p.milestone.hidden, p.reveal.hidden, visibleCards(p), p.cards().length]).toEqual([true, false, 3, 3]);
    p.context.store.start();
    vi.advanceTimersByTime(5000);
    expect([p.milestone.hidden, p.reveal.hidden, p.cards().length]).toEqual([true, false, 3]);
    expect(p.dispatched).toEqual([]);
  });

  it(`${t}a reload at milestone (FX-SAVE-V1-CEL-milestone) shows the milestone popup at once; store.start() keeps it single`, () => {
    const p = popups(fixture('save-v1.milestone.json'));
    expect([p.milestone.hidden, p.reveal.hidden, p.tiles().map(x => x.dataset.typeId)]).toEqual([false, true, ['lamp-planter', 'bookshelf', 'perch-branch']]);
    p.context.store.start();
    expect([p.host.querySelectorAll('.tpp-milestonePopup:not([hidden])').length, p.tiles().length]).toEqual([1, 3]);
    expect(p.dispatched).toEqual([]);
  });
});

const owl = content.pets.owl;
const leaks = (html: string) => [html.includes('clues/descriptor'), html.includes('clues/silhouette'), html.includes('pets/owl'),
  new RegExp(`\\b${owl.name}\\b`, 'i').test(html), /\bowl\b/i.test(html), /guess/i.test(html), /<input|<textarea/i.test(html)];
const none = [false, false, false, false, false, false, false];
describe('VERIFY-MEC-003-002 information hiding (view)', () => {
  const t = 'VERIFY-MEC-003-002 partial: view (jsdom; Chrome DOM in reveal-dom.json; rules half WORK-003) — ';
  it(`${t}no descriptorImage, silhouetteImage, pets/owl, Owl name or guess field in either popup through phases 1 → 4`, () => {
    const p = atMilestone();
    expect(leaks(p.milestone.outerHTML + p.reveal.outerHTML)).toEqual(none);
    click(p.milestone.querySelector('.tpp-collect'));
    vi.advanceTimersByTime(collectMs(p.tiles().length) + 1000);
    expect(p.reveal.hidden).toBe(false);
    expect(leaks(p.milestone.outerHTML + p.reveal.outerHTML)).toEqual(none);
  });
});

/** FX-CONTENT-MIN with the real content's reveal ids (`projects.json` pet-house: pets/owl-portrait, pets/owl-silhouette). */
const portrait = manifest.entries.find(e => e.id === 'pets/owl-portrait')!;
const owlManifest = { ...manifest, entries: [...manifest.entries, { ...portrait, id: 'pets/owl-silhouette', url: 'synthetic/pets/owl-silhouette.png' }] };
const owlContent: Content = loadContent(owlManifest, patchFiles(files(), [...REAL_STRINGS,
  { file: 'projects.json', path: '/projects/1/descriptorImage', value: 'pets/owl-portrait' },
  { file: 'projects.json', path: '/projects/1/silhouetteImage', value: 'pets/owl-silhouette' }]));
const { revealCardStaggerMs: stagger, revealSilhouetteHoldMs: hold, revealResolveMs: resolveMs } = owlContent.tuning;
const stage = (p: Popups) => ({
  state: p.reveal.dataset.state,
  ids: [...p.reveal.querySelectorAll<HTMLElement>('.tpp-mystery-tile [data-asset-id]')].map(e => e.dataset.assetId),
  title: p.reveal.querySelector('.tpp-reveal-popup-title')!.textContent,
});
const openReveal = (p: Popups) => {
  click(p.milestone.querySelector('.tpp-collect'));
  for (let ms = 0; ms < 10000 && p.reveal.hidden; ms++) vi.advanceTimersByTime(1);
  expect(p.reveal.hidden).toBe(false);
};
const phases = (p: Popups) => p.cards().map(c => c.querySelector('.tpp-clue-phase')!.textContent);
describe('VERIFY-MEC-003-011 completion beat (view)', () => {
  const t = 'VERIFY-MEC-003-011 partial: view (jsdom fake timers; Chrome DOM timestamps in work-023-1.mjs) — ';
  it(`${t}VERIFY-MEC-003-011 completing reveal beat (WORK-023-1, flipped from the fork-4 stub): 3 → 5 opens on the mystery shape (state mystery, no Owl); the fifth card enters after the stagger and the silhouette (pets/owl-silhouette, state silhouette) is held revealSilhouetteHoldMs, then resolves over revealResolveMs into pets/owl-portrait with "Owl has moved in!" (state complete); Continue is enabled throughout`, () => {
    const p = atMilestone(3, 1500, owlContent);
    const proceed = p.reveal.querySelector<HTMLButtonElement>('.tpp-collect')!;
    openReveal(p);
    expect([phases(p), visibleCards(p), p.reveal.dataset.completes]).toEqual([['Phase 4', 'Phase 5'], 1, 'true']);
    expect(stage(p)).toEqual({ state: 'mystery', ids: ['ui/mystery-shape'], title: 'Someone is moving in' });
    expect(leaks(p.reveal.outerHTML)).toEqual(none);
    vi.advanceTimersByTime(stagger);
    expect([visibleCards(p), proceed.disabled]).toEqual([2, false]);
    expect(stage(p)).toEqual({ state: 'silhouette', ids: ['pets/owl-silhouette'], title: 'Someone is moving in' });
    vi.advanceTimersByTime(hold - 1);
    expect([stage(p).ids, proceed.disabled]).toEqual([['pets/owl-silhouette'], false]);
    vi.advanceTimersByTime(1);
    expect(stage(p)).toEqual({ state: 'silhouette', ids: ['pets/owl-silhouette', 'pets/owl-portrait'], title: 'Someone is moving in' });
    vi.advanceTimersByTime(resolveMs);
    expect([stage(p), proceed.disabled]).toEqual([{ state: 'complete', ids: ['pets/owl-portrait'], title: 'Owl has moved in!' }, false]);
    expect(leaks(p.reveal.outerHTML).slice(2, 4)).toEqual([true, true]);
    click(proceed);
    expect(p.dispatched).toContain('closeReveal');
  });
  it(`${t}VERIFY-MEC-003-011 completing reveal 4 → 5: the "Phase 5" card alone on ui/mystery-shape at open; the beat starts with it (one card: stagger × 0)`, () => {
    const p = atMilestone(4, 1500, owlContent);
    openReveal(p);
    expect([phases(p), p.reveal.dataset.completes]).toEqual([['Phase 5'], 'true']);
    expect(stage(p)).toEqual({ state: 'mystery', ids: ['ui/mystery-shape'], title: 'Someone is moving in' });
    vi.advanceTimersByTime(1);
    expect(stage(p).state).toBe('silhouette');
    vi.advanceTimersByTime(hold + resolveMs);
    expect(stage(p)).toEqual({ state: 'complete', ids: ['pets/owl-portrait'], title: 'Owl has moved in!' });
  });
  it(`${t}mec-003 §3.3 a reload at step reveal with completes shows every card at once and plays the beat at once`, () => {
    const first = atMilestone(3, 1500, owlContent);
    openReveal(first);
    const state = first.state();
    first.panels.revealPopup.destroy();
    const p = popups(state, owlContent);
    expect([p.reveal.hidden, visibleCards(p), stage(p).state, stage(p).ids]).toEqual([false, 2, 'silhouette', ['pets/owl-silhouette']]);
    vi.advanceTimersByTime(hold + resolveMs);
    expect(stage(p)).toEqual({ state: 'complete', ids: ['pets/owl-portrait'], title: 'Owl has moved in!' });
  });
});

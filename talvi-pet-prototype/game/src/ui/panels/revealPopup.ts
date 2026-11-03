import type { GameState } from '@sim/state';
import { revealPopupView } from '@sim/select';
import type { ViewContext } from '@view/context';
import { revealPopup } from './templates/revealPopup';
import { escapeHtml, image, text as textSpan } from './templates/shared';
import type { MilestonePopup } from './milestonePopup';
import { POPUP_FADE_MS } from './milestonePopup';
import { assetsFrom, createText, type Panel, type Text } from '../overlay';
import type { Audio } from '@app/audio';
import { CARD, REVEAL } from '@view/celebration/timings';
import { glyphBurst } from '@view/celebration/glyphBurst';
import { centreIn } from '@view/celebration/starsBurst';
import { reducedMotion } from '@view/celebration/motion';
import { TILE_FLIP_FRAMES } from './milestonePopup';

/** DEC-049 spec §2/§3 beat text (order fork (d)): clue cards' `reveal` +2 st each; the silhouette wobble scale; the riser lead;
 * the name pop peak; the resolve's 24 DOM confetti glyphs from the tile. */
export const REVEAL_BEATS = { cardSemitones: 2, wobbleScale: 1.03, riserLeadMs: 450, namePopPeak: 1.2, confetti: 24, confettiSpreadPx: 140 } as const;
type PlayAudio = () => Pick<Audio, 'play'> | null;

export type RevealPopup = Panel & { isOpen(): boolean };
type RevealPopupView = NonNullable<ReturnType<typeof revealPopupView>>;

type UnlockedCard = Extract<RevealPopupView['cards'][number], { unlocked: true }>;

/** One unlocked clue row (icon tile, "Phase n", the line in quotes); shared with the reveal panel. */
export function unlockedCardHtml(card: UnlockedCard, text: Text, assets: Record<string, string>): string {
  return `<div class="tpp-clue" data-card-index="${card.index}"><div class="ns-tile">${image({ assets }, card.icon)}</div><div>`
    + `${textSpan({ text }, 'tpp.reveal.phase', 'tpp-clue-phase', { phase: card.phase })}`
    + `<span class="tpp-clue-line" data-string-key="content.clue.line">“${escapeHtml(card.line)}”</span></div></div>`;
}

/**
 * Mec-003 §3.3 cards: one per `newCardIndices` entry, in phase order. Built from the view only: the template's
 * `complete`/`silhouette` states (Owl portrait/silhouette) are never rendered here (order fork 4, DEC-033).
 */
function cardsHtml(view: RevealPopupView, text: Text, assets: Record<string, string>): string {
  return view.newCardIndices.map(index => {
    const card = view.cards[index];
    if (!card?.unlocked) throw new Error(`Reveal popup: card ${index} is not unlocked`);
    return unlockedCardHtml(card, text, assets);
  }).join('');
}

type FullView = Extract<RevealPopupView, { image: 'full' }>;

/** DEC-049 §2: a new clue card flips in (`CARD.flipMs`), its "Phase n" label shimmers (`CARD.shimmerMs`), `reveal` +2 st per card. */
function showClueCard(card: HTMLElement, i: number, audio: PlayAudio): void {
  card.hidden = false;
  card.animate?.(TILE_FLIP_FRAMES, { duration: CARD.flipMs, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' });
  card.querySelector<HTMLElement>('.tpp-clue-phase')?.animate?.([{ filter: 'brightness(1)' },
    { filter: 'brightness(1.6) drop-shadow(0 0 6px rgba(255, 220, 120, 0.9))', offset: 0.5 }, { filter: 'brightness(1)' }], { duration: CARD.shimmerMs });
  audio()?.play('reveal', { semitones: REVEAL_BEATS.cardSemitones * i });
}

/** DEC-049 §3 resolve hit: a white flash on the tile only (dropped under reduced motion), 24 confetti glyphs, `reveal` + `heart`. */
function resolveHit(section: HTMLElement, tile: HTMLElement, resolveMs: number, audio: PlayAudio, later: (fn: () => void, ms: number) => void): void {
  if (!reducedMotion()) {
    const flash = document.createElement('span');
    flash.className = 'tpp-tile-flash';
    Object.assign(flash.style, { position: 'absolute', inset: '0', background: '#fff', pointerEvents: 'none', borderRadius: 'inherit' });
    tile.append(flash);
    flash.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: REVEAL.tileFlashMs, fill: 'forwards' });
    later(() => flash.remove(), REVEAL.tileFlashMs);
  }
  const root = section.parentElement;
  if (root) glyphBurst(root, { glyph: '✦', px: 28, count: REVEAL_BEATS.confetti, from: centreIn(root, tile), spreadPx: REVEAL_BEATS.confettiSpreadPx,
    staggerMs: 0, flightMs: resolveMs * 2 });
  audio()?.play('reveal'); audio()?.play('heart');
}
type BeatTuning = { revealCardStaggerMs: number; revealSilhouetteHoldMs: number; revealResolveMs: number };
type Stage = { reset(completes: boolean): void; play(view: FullView, delayMs: number | null): void; enter(cards: HTMLElement[], full: FullView | null): void; cancel(): void };

/**
 * Mec-003 §2 "Completion popup beat" on the popup's mystery tile and title: silhouette held `revealSilhouetteHoldMs`, then the
 * descriptor image fades in over `revealResolveMs` and the title names the pet. `dataset.state` mystery → silhouette → complete.
 * Ids come from `revealView` only (DEC-033); `play(view, null)` starts at once (a reload); a live open waits `delayMs` (a timer, even at 0).
 */
function createStage(section: HTMLElement, text: Text, assets: Record<string, string>, tuning: BeatTuning, audio: PlayAudio): Stage {
  const tile = section.querySelector<HTMLElement>('.tpp-mystery-tile')!;
  const title = section.querySelector<HTMLElement>('.tpp-reveal-popup-title')!;
  let timers: ReturnType<typeof setTimeout>[] = [], resolving: Animation | null = null;
  const later = (fn: () => void, ms: number) => { timers.push(setTimeout(fn, ms)); };
  const cancel = () => { for (const t of timers) clearTimeout(t); timers = []; resolving?.cancel(); resolving = null; };
  const setTitle = (key: string, value: string) => { title.dataset.stringKey = key; title.textContent = value; };
  const complete = (view: FullView) => {
    resolving = null;
    tile.innerHTML = image({ assets }, view.descriptorImage);
    setTitle('tpp.reveal.arrived', text('tpp.reveal.arrived', { pet: view.petName }));
    section.dataset.state = 'complete';
    title.animate?.([{ transform: 'scale(0)' }, { transform: `scale(${REVEAL_BEATS.namePopPeak})`, offset: 0.6 }, { transform: 'scale(1)' }],
      { duration: REVEAL.namePopMs, easing: 'ease-out' });
  };
  const hit = () => resolveHit(section, tile, tuning.revealResolveMs, audio, later);
  const resolve = (view: FullView) => {
    hit();
    tile.insertAdjacentHTML('beforeend', image({ assets }, view.descriptorImage, 'tpp-beat-next'));
    const next = tile.lastElementChild as HTMLElement;
    if (typeof next.animate === 'function') resolving = next.animate([{ opacity: 0 }, { opacity: 1 }], { duration: tuning.revealResolveMs, fill: 'forwards' });
    later(() => complete(view), tuning.revealResolveMs);
  };
  const silhouette = (view: FullView) => {
    tile.innerHTML = image({ assets }, view.silhouetteImage);
    section.dataset.state = 'silhouette';
    // DEC-049 §3: the hold wobbles (1 ↔ 1.03, two `REVEAL.wobbleMs` cycles) and the riser plays in its last 450 ms.
    tile.animate?.([{ transform: 'scale(1)' }, { transform: `scale(${REVEAL_BEATS.wobbleScale})` }, { transform: 'scale(1)' }],
      { duration: REVEAL.wobbleMs, iterations: 2, easing: 'ease-in-out' });
    later(() => audio()?.play('riser'), Math.max(0, tuning.revealSilhouetteHoldMs - REVEAL_BEATS.riserLeadMs));
    later(() => resolve(view), tuning.revealSilhouetteHoldMs);
  };
  return {
    cancel,
    reset(completes) {
      cancel();
      tile.innerHTML = image({ assets }, 'ui/mystery-shape');
      setTitle('tpp.reveal.popupTitle', text('tpp.reveal.popupTitle'));
      section.dataset.state = completes ? 'mystery' : 'normal';
    },
    play(view, delayMs) { if (delayMs === null) silhouette(view); else later(() => silhouette(view), delayMs); },
    /** Live open: cards enter `revealCardStaggerMs` apart; the beat starts once the last new card has entered (order fork 3). */
    enter(cards, full) {
      cards.forEach((card, i) => {
        const show = () => showClueCard(card, i, audio);
        if (i === 0) show(); else { card.hidden = true; later(show, i * tuning.revealCardStaggerMs); }
      });
      if (full) this.play(full, (cards.length - 1) * tuning.revealCardStaggerMs);
    },
  };
}

/** Presentation §8.2 `revealPopup`: opens after the milestone popup hides (fork 3) or at once from state; Continue → `closeReveal`. */
export function createRevealPopup(root: HTMLElement, context: ViewContext, milestone: Pick<MilestonePopup, 'afterHidden'>): RevealPopup {
  const { content, store } = context;
  const text = createText(content.strings);
  const assets = assetsFrom(context.manifest);
  root.insertAdjacentHTML('beforeend', revealPopup({ text, assets, idPrefix: 'reveal-popup', state: 'hidden' }));
  const section = root.lastElementChild as HTMLElement;
  section.dataset.state = 'normal';
  const clues = section.querySelector<HTMLElement>('.tpp-popup-clues')!;
  const proceed = section.querySelector<HTMLButtonElement>('.tpp-collect')!;
  const stage = createStage(section, text, assets, content.tuning, () => context.audio);
  let timers: ReturnType<typeof setTimeout>[] = [], generation = 0, fading: Animation | null = null;
  const hide = () => { generation++; for (const t of timers) clearTimeout(t); timers = []; fading?.cancel(); fading = null; stage.cancel(); section.hidden = true; delete section.dataset.completes; };
  /** Presentation §8.2 fade-out on `celebration.ended`; state.reset and destroy still hide at once. */
  const fadeOut = () => {
    if (section.hidden || typeof section.animate !== 'function') { hide(); return; }
    proceed.disabled = true; fading = section.animate([{ opacity: 1 }, { opacity: 0 }], { duration: POPUP_FADE_MS, fill: 'forwards' });
    timers.push(setTimeout(hide, POPUP_FADE_MS));
  };
  /** `live`: cards enter `revealCardStaggerMs` apart; a reload shows everything at once (mec-003 §3.3). */
  const open = (state: GameState, live: boolean) => {
    const view = revealPopupView(content, state);
    if (!view || !section.hidden) return;
    clues.innerHTML = cardsHtml(view, text, assets);
    stage.reset(view.completes);
    if (view.completes) section.dataset.completes = 'true';
    proceed.disabled = false; section.hidden = false;
    const full = view.completes && view.image === 'full' ? view : null;
    if (!live) { if (full) stage.play(full, null); return; }
    if (typeof section.animate === 'function') section.animate([{ opacity: 0 }, { opacity: 1 }], POPUP_FADE_MS);
    stage.enter([...clues.querySelectorAll<HTMLElement>('.tpp-clue')], full);
  };
  const onContinue = () => { if (proceed.disabled || section.hidden) return; proceed.disabled = true; store.dispatch({ type: 'closeReveal' }); };
  proceed.addEventListener('click', onContinue);
  const offs = [
    store.subscribe('celebration.stepped', event => {
      if (event.step !== 'reveal') return;
      const at = generation;
      milestone.afterHidden(() => { if (at === generation) open(store.getState(), true); });
    }),
    store.subscribe('celebration.started', (event, after) => { if (event.replay) open(after, false); }),
    store.subscribe('celebration.ended', fadeOut),
    store.subscribe('state.reset', hide),
  ];
  open(store.getState(), false);
  return {
    isOpen: () => !section.hidden,
    close: hide,
    destroy() { hide(); for (const off of offs) off(); proceed.removeEventListener('click', onContinue); section.remove(); },
  };
}

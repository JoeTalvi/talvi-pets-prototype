import type { GameState } from '@sim/state';
import { revealPopupView } from '@sim/select';
import type { ViewContext } from '@view/context';
import { revealPopup } from './templates/revealPopup';
import { escapeHtml, image, text as textSpan } from './templates/shared';
import type { MilestonePopup } from './milestonePopup';
import { POPUP_FADE_MS } from './milestonePopup';
import { assetsFrom, createText, type Panel, type Text } from '../overlay';

export type RevealPopup = Panel & { isOpen(): boolean };
type RevealPopupView = NonNullable<ReturnType<typeof revealPopupView>>;

/**
 * Mec-003 §3.3 cards: one per `newCardIndices` entry, in phase order. Built from the view only: the template's
 * `complete`/`silhouette` states (Owl portrait/silhouette) are never rendered here (order fork 4, DEC-033).
 */
function cardsHtml(view: RevealPopupView, text: Text, assets: Record<string, string>): string {
  return view.newCardIndices.map(index => {
    const card = view.cards[index];
    if (!card?.unlocked) throw new Error(`Reveal popup: card ${index} is not unlocked`);
    return `<div class="tpp-clue" data-card-index="${index}"><div class="ns-tile">${image({ assets }, card.icon)}</div><div>`
      + `${textSpan({ text }, 'tpp.reveal.phase', 'tpp-clue-phase', { phase: card.phase })}`
      + `<span class="tpp-clue-line" data-string-key="content.clue.line">“${escapeHtml(card.line)}”</span></div></div>`;
  }).join('');
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
  let timers: ReturnType<typeof setTimeout>[] = [];
  let generation = 0;
  let fading: Animation | null = null;
  const hide = () => { generation++; for (const t of timers) clearTimeout(t); timers = []; fading?.cancel(); fading = null; section.hidden = true; delete section.dataset.completes; };
  /** Presentation §8.2 fade-out on `celebration.ended`; state.reset and destroy still hide at once. */
  const fadeOut = () => {
    if (section.hidden || typeof section.animate !== 'function') { hide(); return; }
    proceed.disabled = true;
    fading = section.animate([{ opacity: 1 }, { opacity: 0 }], { duration: POPUP_FADE_MS, fill: 'forwards' });
    timers.push(setTimeout(hide, POPUP_FADE_MS));
  };
  /** `live`: cards enter `revealCardStaggerMs` apart; a reload shows everything at once (mec-003 §3.3). */
  const open = (state: GameState, live: boolean) => {
    const view = revealPopupView(content, state);
    if (!view || !section.hidden) return;
    clues.innerHTML = cardsHtml(view, text, assets);
    // WORK-023 owns the completing beat (silhouette → full image + name); until then the completing popup is the normal layout.
    if (view.completes) section.dataset.completes = 'true';
    proceed.disabled = false;
    section.hidden = false;
    if (!live) return;
    if (typeof section.animate === 'function') section.animate([{ opacity: 0 }, { opacity: 1 }], POPUP_FADE_MS);
    [...clues.querySelectorAll<HTMLElement>('.tpp-clue')].forEach((card, i) => {
      if (i === 0) return;
      card.hidden = true;
      timers.push(setTimeout(() => { card.hidden = false; }, i * content.tuning.revealCardStaggerMs));
    });
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

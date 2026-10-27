import type { GameState } from '@sim/state';
import { revealProjectId, revealView } from '@sim/select';
import type { ViewContext } from '@view/context';
import { revealPanel } from './templates/revealPanel';
import { escapeHtml, image, text as textSpan } from './templates/shared';
import { unlockedCardHtml } from './revealPopup';
import { assetsFrom, createText, type Panel, type Text } from '../overlay';

export type RevealPanel = Panel & { open(): void; close(): void; isOpen(): boolean };
type RevealView = NonNullable<ReturnType<typeof revealView>>;

/** Mec-003 §2 "Reveal panel": five rows in index order; a locked row shows the "?" tile and "Arrives with phase n". */
function rowsHtml(view: RevealView, text: Text, assets: Record<string, string>): string {
  return view.cards.map(card => card.unlocked
    ? unlockedCardHtml(card, text, assets)
    : `<div class="tpp-clue locked" data-card-index="${card.index}"><div class="ns-tile"><span aria-hidden="true">?</span></div><div>`
      + `${textSpan({ text }, 'tpp.reveal.locked', 'tpp-clue-phase', { phase: card.phase })}</div></div>`).join('');
}

/** The image stage reads `revealView` only (DEC-033): the mystery shape until `image === 'full'`, then the descriptor image and the pet's name. */
function render(section: HTMLElement, view: RevealView, text: Text, assets: Record<string, string>): void {
  const full = view.image === 'full';
  section.querySelector<HTMLElement>('.tpp-reveal-image')!.innerHTML = image({ assets }, full ? view.descriptorImage : 'ui/mystery-shape');
  section.dataset.state = full ? 'arrived' : 'normal';
  section.querySelector<HTMLElement>('.tpp-reveal-info')!.innerHTML = textSpan({ text }, 'tpp.reveal.panelTitle', 'tpp-reveal-label')
    + (full ? `<span class="tpp-reveal-name" data-string-key="content.pet.name">${escapeHtml(view.petName)}</span>` : '')
    + rowsHtml(view, text, assets);
}

/** Presentation §8.2 `revealPanel` (screen 12): opened from the street HUD's reveal icon; × or the backdrop closes it. No text entry (DEC-039). */
export function createRevealPanel(root: HTMLElement, context: ViewContext): RevealPanel {
  const { content, store, log } = context;
  const text = createText(content.strings);
  const assets = assetsFrom(context.manifest);
  root.insertAdjacentHTML('beforeend', revealPanel({ text, assets, idPrefix: 'reveal-panel', state: 'hidden' }));
  const section = root.lastElementChild as HTMLElement;
  const viewOf = (state: GameState) => {
    const projectId = revealProjectId(content, state);
    return projectId === null ? null : revealView(content, state, projectId);
  };
  const hide = () => { section.hidden = true; };
  const refresh = (state: GameState) => {
    const view = viewOf(state);
    if (view) render(section, view, text, assets); else hide();
  };
  /** Mec-003 §2: openable on the street with no celebration running (order fork 5). */
  const open = () => {
    const state = store.getState();
    if (!section.hidden || state.celebration !== null || state.scene.kind !== 'street') return;
    const view = viewOf(state);
    if (!view) return;
    render(section, view, text, assets);
    section.hidden = false;
    log.record('ui.revealPanel', { open: true });
  };
  const close = () => {
    if (section.hidden) return;
    hide();
    log.record('ui.revealPanel', { open: false });
  };
  const links = [...root.querySelectorAll<HTMLButtonElement>('.tpp-reveal-link')];
  const onLink = (event: Event) => { if (!(event.currentTarget as HTMLButtonElement).disabled) open(); };
  for (const link of links) link.addEventListener('click', onLink);
  const closers = [...section.querySelectorAll<HTMLElement>('[data-action=close]')];
  for (const el of closers) el.addEventListener('click', close);
  const offs = [
    ...(['rewards.collected', 'project.completed'] as const).map(type => store.subscribe(type, (_event, after) => { if (!section.hidden) refresh(after); })),
    ...(['scene.changed', 'celebration.started', 'state.reset'] as const).map(type => store.subscribe(type, hide)),
  ];
  return {
    open, close,
    isOpen: () => !section.hidden,
    destroy() {
      hide(); for (const off of offs) off();
      for (const link of links) link.removeEventListener('click', onLink);
      for (const el of closers) el.removeEventListener('click', close);
      section.remove();
    },
  };
}

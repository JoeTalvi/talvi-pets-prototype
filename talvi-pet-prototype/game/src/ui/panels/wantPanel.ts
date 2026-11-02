import type { Content } from '@content/types';
import type { Want } from '@content/schema/pet';
import type { ConditionView } from '@sim/events';
import type { GameState, PetId } from '@sim/state';
import { activeWant, residentPet, wantConditions } from '@sim/select';
import type { ViewContext } from '@view/context';
import { wantPanel } from './templates/wantPanel';
import { escapeHtml } from './templates/shared';
import { assetsFrom, createText, type Panel, type Text } from '../overlay';

export type WantPanel = Panel & { render(): void };

const RENDER_ON = ['scene.changed', 'want.activated', 'want.progressed', 'want.hiddenRevealed', 'wants.exhausted', 'items.granted',
  'rewards.collected', 'phase.reached', 'mode.changed', 'heart.earned', 'charm.placed', 'charm.removed', 'dialogue.opened'] as const;

const span = (cls: string, key: string, value: string) => `<span class="${cls}" data-string-key="${escapeHtml(key)}">${escapeHtml(value)}</span>`;
const pill = (label: string, met: boolean, extra = '') =>
  `<span class="tpp-tag${met ? ' done' : ''}${extra}"><span aria-hidden="true">${met ? '✓' : '☐'}</span> ${escapeHtml(label)}</span>`;

/** MEC-009 "Panel states": one pill per condition in order; a hidden unrevealed tag is "?" and never names the tag (R4). */
function pillOf(content: Content, text: Text, view: ConditionView): string {
  // Fork #12 resolved 2026-10-26: the adjacency pill names its two tags, as the TOOL-003 CLI does.
  const tagName = (id: string | undefined) => content.tags.find(t => t.id === id)?.name ?? id ?? '';
  if (view.kind === 'adjacent') return pill(text('tpp.want.adjacent', { a: tagName(view.tagA), b: tagName(view.tagB) }), view.met);
  // Q8(a): the Stars floor is shown with its numbers even while the Stars bar is hidden.
  if (view.kind === 'stars') return `<span class="tpp-tag wide${view.met ? ' done' : ''}">${escapeHtml(text('tpp.want.starsFloor', { min: view.min ?? 0, current: view.current ?? 0 }))}</span>`;
  if (view.hidden || view.tag === undefined) return pill(text('tpp.want.hidden'), view.met);
  const name = content.tags.find(t => t.id === view.tag)?.name ?? view.tag;
  return pill(name, view.met, view.availability && view.availability !== 'owned' ? ' unavailable' : '');
}

/** MEC-009 R7: the note of the first non-owned visible tag in condition order (every such note when expanded). */
function notesOf(text: Text, views: readonly ConditionView[], expanded: boolean): string {
  const labels = views.filter(v => v.kind === 'tag' && !v.hidden && v.availability && v.availability !== 'owned').map(v => v.availability!);
  return (expanded ? labels : labels.slice(0, 1)).map(label => {
    const key = `tpp.want.availability.${label}`;
    return span('tpp-want-note', key, text(key));
  }).join('');
}

function wantMarkup(content: Content, text: Text, want: Want, body: { pills: string; note: string }): string {
  return span('tpp-want-title', 'tpp.want.title', text('tpp.want.title')) + `<span class="tpp-want-brief">${escapeHtml(want.brief)}</span>`
    + `<div class="tpp-tags">${body.pills}</div>${body.note}`
    + `<div class="tpp-want-reward">${escapeHtml(`${text('tpp.want.rewardPrefix')} ${want.rewardLabel}`)}</div>`;
}

/** State d: the fulfilled want with every pill ticked, the flash line and the reward repeated (R13). */
function fulfilledMarkup(content: Content, text: Text, state: GameState, petId: PetId, want: Want): string {
  const revealed = state.pets[petId]?.revealedHiddenTags[want.id] ?? [];
  const pills = want.conditions.map(c => pillOf(content, text, c.kind === 'tag'
    ? { kind: 'tag', met: true, hidden: c.hidden === true && !revealed.includes(c.tag), tag: c.tag }
    : c.kind === 'stars' ? { kind: 'stars', met: true, hidden: false, min: c.min } : { kind: 'adjacent', met: true, hidden: false })).join('');
  return wantMarkup(content, text, want, { pills, note: span('tpp-want-note', 'tpp.want.fulfilledFlash', text('tpp.want.fulfilledFlash')) });
}

function panelMarkup(content: Content, text: Text, state: GameState, petId: PetId, expanded: boolean): string {
  const active = activeWant(content, state, petId);
  if (active === null) return span('tpp-want-title', 'tpp.want.title', text('tpp.want.title')) + span('tpp-want-brief', 'tpp.wants.exhausted', text('tpp.wants.exhausted'));
  const views = wantConditions(content, state, petId);
  return wantMarkup(content, text, active.want, { pills: views.map(v => pillOf(content, text, v)).join(''), note: notesOf(text, views, expanded) });
}

/** Presentation §8.2 `wantPanel` (MEC-009 View row): states a–d and exhausted from `select.activeWant` / `select.wantConditions`. */
export function createWantPanel(root: HTMLElement, context: ViewContext): WantPanel {
  const { content, store, log } = context;
  const text = createText(content.strings);
  root.insertAdjacentHTML('beforeend', wantPanel({ text, assets: assetsFrom(context.manifest), idPrefix: 'want' }));
  const section = root.lastElementChild as HTMLElement;
  section.dataset.state = 'normal';
  let flash: Want | null = null;
  const render = () => {
    const state = store.getState();
    const petId = residentPet(content, state);
    // M2 play session: the panel stays behind the pet's introduction until the intro box closes.
    section.hidden = petId === null || state.dialogue.current?.source === 'intro';
    if (petId === null) { flash = null; return; }
    section.classList.toggle('dim', state.mode === 'design');
    section.innerHTML = flash ? fulfilledMarkup(content, text, state, petId, flash) : panelMarkup(content, text, state, petId, section.dataset.state === 'expanded');
  };
  const onClick = () => {
    const expanded = section.dataset.state !== 'expanded';
    section.dataset.state = expanded ? 'expanded' : 'normal';
    log.record('ui.wantPanel', { expanded });
    render();
  };
  section.addEventListener('click', onClick);
  const offs = [...RENDER_ON.map(type => store.subscribe(type, () => render())),
    // State d (order fork 2): the flash holds while the reward dialogue is open and gives way to the next want once it closes.
    store.subscribe('want.fulfilled', (event, after) => {
      if (event.petId !== residentPet(content, after)) return;
      flash = after.dialogue.current !== null ? content.pets[event.petId].wants.find(w => w.id === event.wantId) ?? null : null;
      render();
    }),
    store.subscribe('dialogue.closed', (_event, after) => { if (after.dialogue.current === null) flash = null; render(); }),
    store.subscribe('state.reset', () => { flash = null; render(); })];
  render();
  return {
    render,
    destroy() { for (const off of offs) off(); section.removeEventListener('click', onClick); section.remove(); },
  };
}

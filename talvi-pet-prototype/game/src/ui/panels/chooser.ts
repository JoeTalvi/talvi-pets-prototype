import type { CharmType } from '@content/schema/charms';
import { chooserTypes, slotOf } from '@sim/select';
import type { ViewContext } from '@view/context';
import { chooser } from './templates/chooser';
import { escapeHtml, image, type TemplateOptions } from './templates/shared';
import { assetsFrom, createText, type Panel, type Text } from '../overlay';

export type ChooserCloseReason = 'pick' | 'cancel' | 'modeExit' | 'dialogue';

const span = (text: Text, key: string, cls: string, params?: Record<string, string | number>) =>
  `<span class="${cls}" data-string-key="${escapeHtml(key)}">${escapeHtml(text(key, params))}</span>`;

/** One pill per tag: the tag icon at 32 px (overriding the card's 160×140 image rule) and the tag's name. */
export function tagPills(context: ViewContext, o: TemplateOptions, tagIds: readonly string[]): string {
  return tagIds.map(id => {
    const tag = context.content.tags.find(t => t.id === id);
    const icon = tag && o.assets?.[tag.icon]
      ? `<img data-asset-id="${escapeHtml(tag.icon)}" src="${escapeHtml(o.assets[tag.icon])}" alt="" style="width:32px;height:32px">`
      : `<span class="tpp-asset-slot" data-asset-id="${escapeHtml(tag?.icon ?? id)}" style="width:32px;height:32px"></span>`;
    return `<span class="tpp-tag" data-tag-id="${escapeHtml(id)}">${icon}<span>${escapeHtml(tag?.name ?? id)}</span></span>`;
  }).join('');
}

function cardsMarkup(context: ViewContext, o: TemplateOptions, types: readonly CharmType[]): string {
  return types.map(type => `<button type="button" class="tpp-charm-card" data-action="place" data-type-id="${escapeHtml(type.id)}">`
    + `${image(o, type.sprite)}<span class="tpp-charm-name">${escapeHtml(type.name)}</span>`
    + `<span class="tpp-tags">${tagPills(context, o, type.tags)}</span></button>`).join('');
}

/** MEC-004 R7/R8: title by size class, owned count, the `chooserTypes` cards in owned order, or the empty line. */
function sheetMarkup(context: ViewContext, o: TemplateOptions, slotId: string): string {
  const text = o.text as Text;
  const state = context.store.getState();
  const size = slotOf(context.content, state, slotId)?.sizeClass ?? 'small';
  const types = chooserTypes(context.content, state, slotId);
  const title = span(text, 'tpp.chooser.slot', 'tpp-chooser-title', { size: text(`tpp.chooser.size.${size}`) });
  const count = span(text, 'tpp.chooser.count', 'tpp-muted', { count: types.length });
  const body = types.length === 0 ? `<p class="tpp-empty">${span(text, 'tpp.chooser.empty', '')}</p>`
    : `<div class="tpp-chooser-cards">${cardsMarkup(context, o, types)}</div>`;
  return `<header>${title}${count}</header>${body}${span(text, 'tpp.chooser.scroll', 'tpp-scroll-hint')}`;
}

/** Presentation §8.2 `chooser` / MEC-005 R12: opens on `slot.tapped {filled:false}`; a card dispatches `placeCharm`. */
export function createChooser(root: HTMLElement, context: ViewContext): Panel {
  const { store, log, bus } = context;
  const o: TemplateOptions = { text: createText(context.content.strings), assets: assetsFrom(context.manifest), idPrefix: 'chooser', state: 'closed' };
  root.insertAdjacentHTML('beforeend', chooser(o));
  const section = root.lastElementChild as HTMLElement;
  const sheet = section.querySelector<HTMLElement>('.tpp-chooser-sheet')!;
  let slotId: string | null = null;

  const render = () => {
    if (slotId === null) return;
    sheet.innerHTML = sheetMarkup(context, o, slotId);
    const cards = sheet.querySelector<HTMLElement>('.tpp-chooser-cards');
    sheet.querySelector<HTMLElement>('.tpp-scroll-hint')!.hidden = !cards || cards.scrollWidth <= cards.clientWidth;
  };
  const open = (id: string) => { slotId = id; context.selectedSlotId = id; section.hidden = false; render(); };
  const close = (reason: ChooserCloseReason = 'cancel') => {
    if (slotId === null) return;
    const id = slotId; slotId = null; section.hidden = true;
    if (context.selectedSlotId === id) context.selectedSlotId = null;
    log.record('ui.chooserClosed', { slotId: id, reason });
  };
  const onClick = (event: Event) => {
    const el = (event.target as Element).closest<HTMLElement>('[data-action]');
    if (!el || slotId === null) return;
    if (el.dataset.action === 'close') close('cancel');
    else if (el.dataset.action === 'place' && el.dataset.typeId) {
      store.dispatch({ type: 'placeCharm', slotId, typeId: el.dataset.typeId });
      close('pick');
    }
  };
  section.addEventListener('click', onClick);
  const offs = [
    bus.on('slot.tapped', event => { if (!event.filled) open(event.slotId); }),
    store.subscribe('mode.changed', event => { if (event.mode === 'play') close('modeExit'); }),
    store.subscribe('dialogue.opened', () => close('dialogue')),
    store.subscribe('scene.changed', () => close('cancel')),
    store.subscribe('state.reset', () => close('cancel')),
    store.subscribe('types.unlocked', render),
  ];
  return {
    open, close: reason => close(reason as ChooserCloseReason | undefined),
    destroy() { for (const off of offs) off(); section.removeEventListener('click', onClick); section.remove(); },
  };
}

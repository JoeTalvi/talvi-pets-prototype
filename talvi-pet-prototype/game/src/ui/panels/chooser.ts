import type { CharmType } from '@content/schema/charms';
import { chooserTypes, slotOf } from '@sim/select';
import type { ViewContext } from '@view/context';
import { outlinePoints } from '@view/objects/SlotOutline';
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

export type Bounds = { x: number; y: number; w: number; h: number };
const CARD_PICTURE = { w: 160, h: 140 }, ALPHA_MIN = 16;

/** Q9 (play session 2026-10-26): the box around RGBA pixels with alpha > ALPHA_MIN (soft edges and stray haze excluded); null when none. */
export function opaqueBounds(data: ArrayLike<number>, w: number, h: number): Bounds | null {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (data[(y * w + x) * 4 + 3] <= ALPHA_MIN) continue;
    x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** Q9: the whole image's size and offset so `bounds` fills `box` (contain) and sits centred in it. */
export function cropBox(bounds: Bounds, natural: { w: number; h: number }, box: { w: number; h: number }) {
  const scale = Math.min(box.w / bounds.w, box.h / bounds.h);
  return { width: natural.w * scale, height: natural.h * scale,
    left: (box.w - bounds.w * scale) / 2 - bounds.x * scale, top: (box.h - bounds.h * scale) / 2 - bounds.y * scale };
}

const boundsBySrc = new Map<string, Bounds | null>();
function boundsOf(img: HTMLImageElement): Bounds | null {
  if (!boundsBySrc.has(img.src)) {
    const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
    const g = canvas.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    g.drawImage(img, 0, 0);
    boundsBySrc.set(img.src, opaqueBounds(g.getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height));
  }
  return boundsBySrc.get(img.src) ?? null;
}

/** Q9: crop each card picture to its charm (the class canvas is padded, so small charms read tiny); whole canvas until the image loads. */
function cropCardPictures(sheet: HTMLElement): void {
  for (const img of sheet.querySelectorAll<HTMLImageElement>('.tpp-charm-card > img')) {
    const crop = () => {
      const bounds = img.naturalWidth > 0 ? boundsOf(img) : null;
      if (!bounds) return;
      const { width, height, left, top } = cropBox(bounds, { w: img.naturalWidth, h: img.naturalHeight }, CARD_PICTURE);
      const frame = document.createElement('span'); frame.className = 'tpp-charm-crop';
      img.replaceWith(frame); frame.append(img);
      Object.assign(img.style, { width: `${width}px`, height: `${height}px`, left: `${left}px`, top: `${top}px` });
    };
    if (img.complete) crop(); else img.addEventListener('load', crop, { once: true });
  }
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

/** UI-CN05 (ux-correction v2 §"Selected-location locator"): UI geometry of the panel; the miniature is a 920×360 room window at 0.4. */
export const LOCATOR = { left: 1400, width: 480, height: 220, bottom: 484, scale: 0.4, windowW: 920, windowH: 360, roomW: 1920, roomH: 1080 } as const;
const TERRACOTTA = '#b5523f';
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const fixed = (v: number) => String(Number(v.toFixed(2)));

type Shape = Parameters<typeof outlinePoints>[0];
/** World polygon → miniature points through the same transform as the background offset. */
function polygonPoints(slot: Shape, ox: number, oy: number): string {
  return outlinePoints(slot).map(p => `${fixed((p.x - ox) * LOCATOR.scale)},${fixed((p.y - oy) * LOCATOR.scale)}`).join(' ');
}

/** The miniature: room art from the manifest (paper only when absent, order fork 6) and the slot polygons from room content (DEC-038). */
function miniatureOf(context: ViewContext, o: TemplateOptions, slot: Shape & { id: string }, roomId: string): HTMLElement {
  const room = context.content.rooms[roomId];
  const ox = clamp(slot.x - LOCATOR.windowW / 2, 0, LOCATOR.roomW - LOCATOR.windowW), oy = clamp(slot.y - LOCATOR.windowH / 2, 0, LOCATOR.roomH - LOCATOR.windowH);
  const w = LOCATOR.windowW * LOCATOR.scale, h = LOCATOR.windowH * LOCATOR.scale;
  const mini = document.createElement('div'); mini.className = 'tpp-locator-miniature';
  const url = room && o.assets?.[room.background];
  Object.assign(mini.style, { position: 'relative', width: `${w}px`, height: `${h}px`, margin: '8px auto 0', borderRadius: '12px', overflow: 'hidden',
    backgroundColor: 'var(--paper2)', backgroundSize: `${LOCATOR.roomW * LOCATOR.scale}px ${LOCATOR.roomH * LOCATOR.scale}px`,
    backgroundPosition: `${-ox * LOCATOR.scale}px ${-oy * LOCATOR.scale}px` });
  if (url) mini.style.backgroundImage = `url("${url}")`;
  const others = (room?.slots ?? []).filter(s => s.id !== slot.id)
    .map(s => `<polygon points="${polygonPoints(s, ox, oy)}" fill="none" stroke="${TERRACOTTA}" stroke-width="2" opacity="0.25"/>`).join('');
  mini.innerHTML = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" style="position:absolute;inset:0">`
    + `<polygon points="${polygonPoints(slot, ox, oy)}" fill="rgba(181,82,63,.22)" stroke="${TERRACOTTA}" stroke-width="3"/>${others}</svg>`;
  return mini;
}

/** Non-interactive locator 24 px above the 460 px sheet, joined to it by a vertical terracotta link. */
function locatorOf(context: ViewContext, o: TemplateOptions, slotId: string): HTMLElement | null {
  const state = context.store.getState();
  const slot = slotOf(context.content, state, slotId);
  if (!slot || state.scene.kind !== 'interior') return null;
  const text = o.text as Text;
  const aside = document.createElement('aside'); aside.className = 'tpp-chooser-locator'; aside.setAttribute('aria-hidden', 'true');
  Object.assign(aside.style, { position: 'absolute', left: `${LOCATOR.left}px`, width: `${LOCATOR.width}px`, height: `${LOCATOR.height}px`,
    bottom: `${LOCATOR.bottom}px`, pointerEvents: 'none', boxSizing: 'border-box', background: 'var(--paper)', border: '2.5px solid var(--ink)',
    borderRadius: '24px', padding: '16px 20px' });
  const heading = document.createElement('div'); heading.className = 'tpp-locator-heading'; heading.dataset.stringKey = 'tpp.chooser.selected';
  Object.assign(heading.style, { font: '800 22px var(--font-body)', color: 'var(--muted)', textAlign: 'center' });
  heading.textContent = `${text('tpp.chooser.selected')} · ${text(`tpp.chooser.size.${slot.sizeClass}`)}`;
  const link = document.createElement('i'); link.className = 'tpp-locator-link';
  Object.assign(link.style, { position: 'absolute', left: '50%', top: '100%', width: '3px', height: '24px', marginLeft: '-1.5px', marginTop: '2.5px', background: TERRACOTTA });
  aside.append(heading, miniatureOf(context, o, slot, state.scene.roomId), link);
  return aside;
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
    cropCardPictures(sheet);
    section.querySelector('.tpp-chooser-locator')?.remove();
    const locator = locatorOf(context, o, slotId);
    if (locator) section.append(locator);
    const cards = sheet.querySelector<HTMLElement>('.tpp-chooser-cards');
    sheet.querySelector<HTMLElement>('.tpp-scroll-hint')!.hidden = !cards || cards.scrollWidth <= cards.clientWidth;
  };
  const open = (id: string) => { slotId = id; context.selectedSlotId = id; section.hidden = false; render(); };
  const close = (reason: ChooserCloseReason = 'cancel') => {
    if (slotId === null) return;
    const id = slotId; slotId = null; section.hidden = true;
    section.querySelector('.tpp-chooser-locator')?.remove();
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
    store.subscribe('items.granted', render),
  ];
  return {
    open, close: reason => close(reason as ChooserCloseReason | undefined),
    destroy() { for (const off of offs) off(); section.removeEventListener('click', onClick); section.remove(); },
  };
}

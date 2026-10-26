import type { ViewContext } from '@view/context';
import { placementAt } from '@sim/select';
import { replaceRemove } from './templates/replaceRemove';
import { image, type TemplateOptions } from './templates/shared';
import { assetsFrom, createText, type Panel } from '../overlay';
import { tagPills } from './chooser';

const PANEL = { w: 620, h: 240 }, GAP = 24, INSET = 16;

/**
 * Q15 (play session 2026-10-26; was presentation §8.2 "above the slot"): beside the charm so a tall one stays visible —
 * right of it (`halfWidth` + 24 px), else left; bottom level with the slot's screen point; clamped 16 px inside the overlay.
 */
export function sheetPosition(slot: { x: number; y: number }, overlayHeight: number, halfWidth: number): { left: number; top: number } {
  const scrollY = (1080 - overlayHeight) / 2;
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const right = slot.x + halfWidth + GAP, maxLeft = 1920 - PANEL.w - INSET;
  return {
    left: clamp(right <= maxLeft ? right : slot.x - halfWidth - GAP - PANEL.w, INSET, maxLeft),
    top: clamp(slot.y - scrollY - PANEL.h, INSET, overlayHeight - PANEL.h - INSET),
  };
}

/** Presentation §8.2 `replaceRemove` / MEC-005 R12: opens on `slot.tapped {filled:true}`; Remove dispatches `removeCharm`. */
export function createReplaceRemove(root: HTMLElement, context: ViewContext): Panel {
  const { store, log, bus, content } = context;
  const o: TemplateOptions = { text: createText(content.strings), assets: assetsFrom(context.manifest), idPrefix: 'sheet' };
  const layer = document.createElement('div');
  layer.className = 'tpp-panel-layer'; layer.style.zIndex = 'var(--z-sheet)'; layer.hidden = true;
  layer.innerHTML = `<div class="tpp-dismiss-backdrop" data-action="close"></div>${replaceRemove(o)}`;
  root.append(layer);
  const section = layer.querySelector<HTMLElement>('.tpp-replaceRemove')!;
  let slotId: string | null = null;

  const fill = (id: string) => {
    const state = store.getState();
    const roomId = state.scene.kind === 'interior' ? state.scene.roomId : '';
    const type = content.charms.types.find(t => t.id === placementAt(content, state, roomId, id));
    const slot = content.rooms[roomId]?.slots.find(s => s.id === id);
    if (!type || !slot) return false;
    section.querySelector('[data-asset-id]')!.outerHTML = image(o, type.sprite);
    section.querySelector('.tpp-sheet-name')!.textContent = type.name;
    section.querySelector('.tpp-tags, .tpp-tag')!.outerHTML = `<span class="tpp-tags" style="position:absolute;left:130px;top:70px">${tagPills(context, o, type.tags)}</span>`;
    const spriteW = context.manifest.entries.find(e => e.id === type.sprite)?.px?.w ?? 160;
    const { left, top } = sheetPosition(slot, parseFloat(root.parentElement?.style.height ?? '') || 1080, spriteW / 2);
    Object.assign(section.style, { left: `${left}px`, top: `${top}px` });
    section.dataset.slotId = id;
    return true;
  };
  const open = (id: string) => { if (!fill(id)) return; slotId = id; context.selectedSlotId = id; layer.hidden = false; };
  const close = () => {
    if (slotId === null) return;
    const id = slotId; slotId = null; layer.hidden = true;
    if (context.selectedSlotId === id) context.selectedSlotId = null;
    log.record('ui.sheetClosed', { slotId: id });
  };
  const onClick = (event: Event) => {
    const action = (event.target as Element).closest<HTMLElement>('[data-action]')?.dataset.action;
    const id = slotId;
    if (id === null || !action) return;
    if (action === 'remove') { store.dispatch({ type: 'removeCharm', slotId: id }); close(); }
    else if (action === 'replace') { close(); bus.emit({ type: 'slot.tapped', slotId: id, filled: false }); }
    else if (action === 'close') close();
  };
  layer.addEventListener('click', onClick);
  const offs = [
    bus.on('slot.tapped', event => { if (event.filled) open(event.slotId); }),
    store.subscribe('mode.changed', event => { if (event.mode === 'play') close(); }),
    store.subscribe('dialogue.opened', close), store.subscribe('scene.changed', close), store.subscribe('state.reset', close),
  ];
  return { open, close, destroy() { for (const off of offs) off(); layer.removeEventListener('click', onClick); layer.remove(); } };
}

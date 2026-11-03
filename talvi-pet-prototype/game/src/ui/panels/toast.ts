import type { GameState } from '@sim/state';
import type { ViewContext } from '@view/context';
import { toast } from './templates/toast';
import { assetsFrom, createText, type Panel } from '../overlay';
import { ROUNDUP } from '@view/celebration/timings';
import { glyphBurst, type GlyphBurst } from '@view/celebration/glyphBurst';
import { centreIn } from '@view/celebration/starsBurst';

/** DEC-049 §1 (WORK-038-3): window event fired as a round-up toast shows; `detail.landMs` is when its coins reach the street bar. */
export const ROUNDUP_COINS = 'tpp:roundupCoins';
/** Spec §1 beat text (order fork (d)): the coin glyph and size. */
export const COIN = { glyph: '●', px: 30, spreadPx: 18 } as const;
/** DEC-049 §7: window event `{ siteId }` fired as the garden toast shows; the street plays its beacon (or keeps it for its next create). */
export const SPACE_TOAST_SHOWN = 'tpp:spaceToastShown';
/** Spec §7 beat text (order fork (d)): the reward-card punch on the space toast. */
export const SPACE_CARD_PUNCH = 1.06;

export type Toast = Panel & { queued(): number };

type Item = { kind: 'roundup'; merchantName: string; amountCents: number; changeCents: number; causeName: string }
  /** WORK-034-3: the `space` reward announcement (`space.unlocked`), one line through the same toast shell. */
  | { kind: 'space'; siteId: string };

/** Q14(a) (play session 2026-10-26): a dialogue or popup holds at most the latest 2 round-ups; older held ones are dropped (the project bar already counts them). */
export const IN_MS = 150;
const OUT_MS = 200, HELD_MAX = 2;

function animate(el: HTMLElement, frames: Keyframe[], duration: number): void {
  // jsdom has no Web Animations: the queue and `hidden` carry the state; the motion is the browser's.
  if (typeof el.animate === 'function') el.animate(frames, { duration, easing: 'ease-out', fill: 'forwards' });
}

/** DEC-049 §1: at `IN_MS` 1 (< 50¢) or 2 gold coins fly from the toast's delta to the street bar over `ROUNDUP.flightMs`. */
function coinLauncher(root: HTMLElement, delta: HTMLElement): { launch(changeCents: number): void; stop(): void } {
  let timer: ReturnType<typeof setTimeout> | null = null, coins: GlyphBurst | null = null;
  const stop = () => { if (timer !== null) clearTimeout(timer); timer = null; coins?.cancel(); coins = null; };
  return {
    stop,
    launch(changeCents) {
      const count = changeCents < ROUNDUP.coinsThresholdCents ? ROUNDUP.coinsUnder50 : ROUNDUP.coins;
      // Both coins launch together (spread apart), so they land at 150 + 450 = 600.
      window.dispatchEvent(new CustomEvent(ROUNDUP_COINS, { detail: { landMs: IN_MS + ROUNDUP.flightMs } }));
      stop();
      timer = setTimeout(() => {
        timer = null;
        const bar = root.querySelector<HTMLElement>('.tpp-hudStreet .tpp-chunks');
        if (!bar) return;
        coins = glyphBurst(root, { glyph: COIN.glyph, px: COIN.px, count, from: centreIn(root, delta), to: centreIn(root, bar), spreadPx: COIN.spreadPx,
          staggerMs: 0, flightMs: ROUNDUP.flightMs });
        coins.el.classList.add('tpp-roundup-coins');
      }, IN_MS);
    },
  };
}

/** DEC-049 §7: the space toast's reward-card treatment and the coupling event for the street beacon. */
function spaceCard(section: HTMLElement, context: ViewContext, siteId: string): void {
  animate(section, [{ transform: 'scale(1)' }, { transform: `scale(${SPACE_CARD_PUNCH})` }, { transform: 'scale(1)' }], IN_MS * 2);
  context.audio?.play('reveal');
  window.dispatchEvent(new CustomEvent(SPACE_TOAST_SHOWN, { detail: { siteId } }));
}

/** Writes one queued item into the toast shell (line, delta badge, kind and the §7 card class). */
function fillItem(el: { section: HTMLElement; line: HTMLElement; delta: HTMLElement }, item: Item, text: ReturnType<typeof createText>): void {
  el.section.dataset.kind = item.kind;
  el.section.classList.toggle('tpp-toast-card', item.kind === 'space');
  if (item.kind === 'space') {
    el.line.dataset.stringKey = 'tpp.toast.space'; el.line.textContent = text('tpp.toast.space');
    el.delta.hidden = true;
    return;
  }
  el.line.dataset.stringKey = 'tpp.toast.roundup';
  el.line.textContent = text('tpp.toast.roundup', { merchant: item.merchantName, amount: `$${(item.amountCents / 100).toFixed(2)}`,
    change: `${item.changeCents}¢`, cause: item.causeName });
  el.delta.hidden = false; el.delta.textContent = text('tpp.toast.delta', { change: `${item.changeCents}¢` });
}

/** Q7(a) (core §9): no toasts while a dialogue or a celebration popup is open; the queue drains after. */
const blocked = (state: GameState) => state.dialogue.current !== null || state.celebration !== null;

/** Presentation §8.2 `toast` (mec-002 §3.3): FIFO from `roundup.fired`, one visible, 150 ms in, `toastMs` hold, 200 ms fade. */
export function createToast(root: HTMLElement, context: ViewContext): Toast {
  const { content, store } = context;
  const text = createText(content.strings);
  root.insertAdjacentHTML('beforeend', toast({ text, assets: assetsFrom(context.manifest), state: 'hidden', idPrefix: 'toast' }));
  const section = root.lastElementChild as HTMLElement;
  const delta = section.querySelector<HTMLElement>('.tpp-toast-delta')!;
  const line = section.querySelector<HTMLElement>('[data-string-key="tpp.toast.roundup"]')!;
  const queue: Item[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  const { launch: launchCoins, stop: stopCoins } = coinLauncher(root, delta);
  const later = (ms: number, fn: () => void) => { timer = setTimeout(() => { timer = null; fn(); }, ms); };
  const hide = () => { section.hidden = true; section.dataset.state = 'hidden'; };
  const pump = () => {
    if (timer !== null || queue.length === 0 || blocked(store.getState())) return;
    const item = queue.shift()!;
    fillItem({ section, line, delta }, item, text);
    // DEC-049 §7: the space toast takes the reward-card styling (gold border, garden glyph via CSS) with a punch and `reveal`.
    if (item.kind === 'space') spaceCard(section, context, item.siteId); else launchCoins(item.changeCents);
    section.hidden = false; section.dataset.state = 'visible';
    animate(section, [{ opacity: 0, transform: 'translateY(-24px)' }, { opacity: 1, transform: 'translateY(0)' }], IN_MS);
    later(IN_MS + content.tuning.toastMs, () => {
      animate(section, [{ opacity: 1 }, { opacity: 0 }], OUT_MS);
      later(OUT_MS, () => { hide(); pump(); });
    });
  };
  const offs = [
    store.subscribe('roundup.fired', (event, after) => {
      // mec-010 row 10b: the trickle arm shows no toasts, so its events are dropped, never held.
      if (after.session.feedPresentation === 'trickle') return;
      const causeName = content.projects.find(p => p.id === event.projectId)?.causeName ?? '';
      queue.push({ kind: 'roundup', merchantName: event.merchantName, amountCents: event.amountCents, changeCents: event.changeCents, causeName });
      if (blocked(after)) queue.splice(0, Math.max(0, queue.length - HELD_MAX));
      pump();
    }),
    // The Owl's want story is open when the garden unlocks: the announcement waits in the queue and shows after it (Q7(a)).
    store.subscribe('space.unlocked', event => { queue.push({ kind: 'space', siteId: event.siteId }); pump(); }),
    store.subscribe('dialogue.closed', () => pump()),
    store.subscribe('celebration.ended', () => pump()),
    store.subscribe('state.reset', () => { queue.length = 0; if (timer !== null) clearTimeout(timer); timer = null; stopCoins(); hide(); }),
  ];
  return {
    queued: () => queue.length,
    destroy() { if (timer !== null) clearTimeout(timer); stopCoins(); for (const off of offs) off(); section.remove(); },
  };
}

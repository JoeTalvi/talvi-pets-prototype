import type { GameState } from '@sim/state';
import type { ViewContext } from '@view/context';
import { toast } from './templates/toast';
import { assetsFrom, createText, type Panel } from '../overlay';

export type Toast = Panel & { queued(): number };

type Item = { kind: 'roundup'; merchantName: string; amountCents: number; changeCents: number; causeName: string }
  /** WORK-034-3: the `space` reward announcement (`space.unlocked`), one line through the same toast shell. */
  | { kind: 'space' };

/** Q14(a) (play session 2026-10-26): a dialogue or popup holds at most the latest 2 round-ups; older held ones are dropped (the project bar already counts them). */
const IN_MS = 150, OUT_MS = 200, HELD_MAX = 2;

function animate(el: HTMLElement, frames: Keyframe[], duration: number): void {
  // jsdom has no Web Animations: the queue and `hidden` carry the state; the motion is the browser's.
  if (typeof el.animate === 'function') el.animate(frames, { duration, easing: 'ease-out', fill: 'forwards' });
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
  const later = (ms: number, fn: () => void) => { timer = setTimeout(() => { timer = null; fn(); }, ms); };
  const hide = () => { section.hidden = true; section.dataset.state = 'hidden'; };
  const pump = () => {
    if (timer !== null || queue.length === 0 || blocked(store.getState())) return;
    const item = queue.shift()!;
    section.dataset.kind = item.kind;
    if (item.kind === 'space') {
      line.dataset.stringKey = 'tpp.toast.space'; line.textContent = text('tpp.toast.space');
      delta.hidden = true;
    } else {
      line.dataset.stringKey = 'tpp.toast.roundup';
      line.textContent = text('tpp.toast.roundup', { merchant: item.merchantName, amount: `$${(item.amountCents / 100).toFixed(2)}`,
        change: `${item.changeCents}¢`, cause: item.causeName });
      delta.hidden = false; delta.textContent = text('tpp.toast.delta', { change: `${item.changeCents}¢` });
    }
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
    store.subscribe('space.unlocked', () => { queue.push({ kind: 'space' }); pump(); }),
    store.subscribe('dialogue.closed', () => pump()),
    store.subscribe('celebration.ended', () => pump()),
    store.subscribe('state.reset', () => { queue.length = 0; if (timer !== null) clearTimeout(timer); timer = null; hide(); }),
  ];
  return {
    queued: () => queue.length,
    destroy() { if (timer !== null) clearTimeout(timer); for (const off of offs) off(); section.remove(); },
  };
}

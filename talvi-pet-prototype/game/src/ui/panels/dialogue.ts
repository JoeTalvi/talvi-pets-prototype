import type { Content } from '@content/types';
import type { DialogueScript, GameState } from '@sim/state';
import { residentPet } from '@sim/select';
import type { ViewContext } from '@view/context';
import { dialogue } from './templates/dialogue';
import { image } from './templates/shared';
import { assetsFrom, createText, type Panel, type Text } from '../overlay';

export type Dialogue = Panel & { isDeferred(): boolean };

/** What the same dispatch emitted before `dialogue.opened` (mec-008 §2.7): the fulfilment chain or the first-entry greeting walk. */
type Arm = { kind: 'fulfil'; focusSlotId: string } | { kind: 'greeting' };

type Parts = { section: HTMLElement; box: HTMLElement; copy: HTMLElement; speaker: HTMLElement; line: HTMLElement; portrait: HTMLElement };

const SLIDE_MS = 200, SWAP_MS = 80, BOX_H = 280;

/** Q10 / mec-008 §2.1 (the pet stays visible): true when the room's pet stands (feet, world y less the camera scroll) under the bottom box. */
export function petUnderBox(content: Content, state: GameState, overlayHeight: number): boolean {
  const petId = residentPet(content, state);
  const y = petId === null ? undefined : state.pets[petId]?.behaviour.y;
  return y !== undefined && y - (1080 - overlayHeight) / 2 > overlayHeight - BOX_H;
}

function animate(el: HTMLElement, frames: Keyframe[], duration: number): void {
  // jsdom has no Web Animations: the panel's state is `hidden` + text; the motion is the browser's.
  if (typeof el.animate === 'function') el.animate(frames, { duration, easing: 'ease-out' });
}

function mount(root: HTMLElement, context: ViewContext, text: Text): Parts {
  root.insertAdjacentHTML('beforeend', dialogue({ text, assets: assetsFrom(context.manifest), state: 'closed', idPrefix: 'dialogue' }));
  const section = root.lastElementChild as HTMLElement;
  const box = section.querySelector<HTMLElement>('.tpp-dialogue-box')!;
  const portrait = box.querySelector<HTMLElement>('.tpp-portrait')!;
  return { section, box, portrait, copy: box.querySelector<HTMLElement>('.tpp-dialogue-copy')!,
    speaker: box.querySelector<HTMLElement>('.tpp-speaker')!, line: box.querySelector<HTMLElement>('.tpp-dialogue-line')! };
}

/** Presentation §8.2 `dialogue`: pet speech carries the pet's portrait and name; game narration is text-only (DEC-013 amendment, art bible v1.4). */
function fill(parts: Parts, content: Content, assets: Record<string, string>, text: Text, script: DialogueScript): void {
  const pet = 'petId' in script.speaker ? content.pets[script.speaker.petId] : undefined;
  parts.section.classList.toggle('text-only-game', !pet);
  if (pet) {
    parts.portrait.innerHTML = image({ assets }, pet.portrait);
    if (!parts.portrait.isConnected) parts.box.prepend(parts.portrait);
  } else parts.portrait.remove();
  parts.speaker.textContent = pet ? pet.name : text('tpp.dialogue.gameName');
  parts.speaker.dataset.stringKey = pet ? 'content.pet.name' : 'tpp.dialogue.gameName';
  parts.line.textContent = script.lines[script.index] ?? '';
  parts.section.dataset.source = script.source;
}

/** mec-008 §2.7 view timing: when a deferred box may show. Timers only; the sim's pet events arrive through the store. */
function createDeferral(context: ViewContext, show: () => void) {
  const { walkOverMs, fulfilmentUseHoldMs } = context.content.tuning;
  let wait: Arm | null = null;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const clear = () => { wait = null; for (const t of timers.splice(0)) clearTimeout(t); };
  const release = () => { if (wait) { clear(); show(); } };
  return {
    active: () => wait !== null,
    clear,
    start(arm: Arm) {
      clear(); wait = arm;
      // The bound: `walkOverMs + fulfilmentUseHoldMs` after `want.fulfilled` (7000 ms); `walkOverMs` for the greeting (Q-MEC007-2(a)).
      timers.push(setTimeout(release, arm.kind === 'fulfil' ? walkOverMs + fulfilmentUseHoldMs : walkOverMs));
    },
    phaseChanged(to: string, target: GameState['pets'][string]['behaviour']['target']) {
      if (!wait) return;
      if (wait.kind === 'greeting' && to === 'greeting') release();
      else if (wait.kind === 'fulfil' && to === 'reacting' && target && 'slotId' in target && target.slotId === wait.focusSlotId)
        timers.push(setTimeout(release, fulfilmentUseHoldMs));
    },
  };
}

/** Presentation §8.2 `dialogue` (mec-008 §2.4–2.7): mounted once; renders `state.dialogue.current`; one `advanceDialogue` per tap anywhere. */
export function createDialogue(root: HTMLElement, context: ViewContext): Dialogue {
  const { content, store } = context;
  const text = createText(content.strings), assets = assetsFrom(context.manifest);
  const parts = mount(root, context, text);
  parts.box.querySelector<HTMLElement>('.tpp-continue')!.textContent = text('tpp.dialogue.continue');
  const show = () => {
    const script = store.getState().dialogue.current;
    if (!script) { parts.section.hidden = true; return; }
    const wasHidden = parts.section.hidden;
    const top = petUnderBox(content, store.getState(), parseFloat(root.parentElement?.style.height ?? '') || 1080);
    fill(parts, content, assets, text, script);
    parts.section.classList.toggle('at-top', top);
    parts.section.hidden = false; parts.section.dataset.state = 'open';
    if (wasHidden) animate(parts.box, [{ transform: `translateY(${top ? -BOX_H : BOX_H}px)` }, { transform: 'translateY(0)' }], SLIDE_MS);
  };
  const hide = () => { parts.section.hidden = true; parts.section.dataset.state = 'closed'; };
  const deferral = createDeferral(context, show);
  let arm: Arm | null = null;
  const setArm = (next: Arm) => { arm = next; queueMicrotask(() => { arm = null; }); };
  // Tap anywhere: the transparent backdrop covers the canvas while open, so no tap reaches the world (mec-008 §2.6).
  const onClick = (e: MouseEvent) => {
    if (!(e.target as Element).closest('[data-action="advance"]') || store.getState().dialogue.current === null) return;
    store.dispatch({ type: 'advanceDialogue' }); // logged by `dialogue.advanced`/`closed`; no `ui.*` record
  };
  parts.section.addEventListener('click', onClick);
  const offs = subscribe(context, { show, hide, deferral, setArm, takeArm: () => { const a = arm; arm = null; return a; }, parts });
  // Reload (core §6.2): an open script renders from state at once, no deferral.
  show();
  return {
    isDeferred: () => deferral.active(),
    destroy() { deferral.clear(); for (const off of offs) off(); parts.section.removeEventListener('click', onClick); parts.section.remove(); },
  };
}

type Hooks = { show(): void; hide(): void; deferral: ReturnType<typeof createDeferral>; setArm(a: Arm): void; takeArm(): Arm | null; parts: Parts };

function subscribe(context: ViewContext, h: Hooks): (() => void)[] {
  const { store } = context;
  return [
    // The arm only matches a `dialogue.opened` published in the same synchronous dispatch (cleared on the next microtask).
    store.subscribe('want.fulfilled', event => h.setArm({ kind: 'fulfil', focusSlotId: event.focusSlotId })),
    store.subscribe('pet.reacted', event => { if (event.reaction === 'greeting' && event.walkOver) h.setArm({ kind: 'greeting' }); }),
    store.subscribe('pet.phaseChanged', event => h.deferral.phaseChanged(event.to, event.target)),
    store.subscribe('dialogue.opened', () => {
      const arm = h.takeArm();
      if (arm && h.parts.section.hidden) h.deferral.start(arm);
      else if (!h.deferral.active()) h.show();
    }),
    store.subscribe('dialogue.advanced', (_event, after) => {
      if (h.deferral.active() || !after.dialogue.current) return;
      h.parts.line.textContent = after.dialogue.current.lines[after.dialogue.current.index] ?? '';
      animate(h.parts.line, [{ opacity: 0 }, { opacity: 1 }], SWAP_MS);
    }),
    // A close followed by the next script in the same dispatch swaps in place (the `dialogue.opened` handler renders it).
    store.subscribe('dialogue.closed', (_event, after) => { if (after.dialogue.current === null) { h.deferral.clear(); h.hide(); } }),
    store.subscribe('state.reset', () => { h.deferral.clear(); h.hide(); }),
  ];
}

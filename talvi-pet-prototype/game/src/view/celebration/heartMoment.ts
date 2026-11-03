import type { Audio } from '@app/audio';
import { HEART_MOMENT } from './timings';

/** Dispatched on `window` whenever a moment ends or is cancelled; the scene half (`heartScene.ts`) removes itself on it. */
export const HEART_MOMENT_END = 'tpp:heartMomentEnd';
/**
 * DEC-049 Hearts-counter seam: dispatched on `window` when the moment's heart reaches the counter; the HUD then shows the new
 * count. WORK-038-1 interim: dispatched at the moment's finish and cancel (WORK-038-2 moves it to the fly's arrival).
 */
export const HEART_ARRIVED = 'tpp:heartArrived';

export type HeartMoment = {
  /** True from `start` until the moment ends (timeout or skip) or is cancelled. */
  active(): boolean;
  start(): void;
  /** Ends the moment without `onEnd` (state.reset, scene change, teardown). */
  cancel(): void;
};

/** The dim (with a spotlight where the scene draws the pet's big `react`: centre x, feet at `petBaseY`) and the heart pop; every pointer event goes to `onPointer`. */
function mountLayer(onPointer: (e: Event) => void): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tpp-heart-moment'; el.dataset.panel = 'heartMoment';
  const dim = `rgba(40, 28, 18, ${HEART_MOMENT.dimAlpha})`, spot = HEART_MOMENT.spotlightPx;
  // The spotlight centres on the big pet: its feet at `petBaseY`, a 256 px frame scaled by `petScale` (as a share of 1080).
  const spotY = Math.round(HEART_MOMENT.petBaseY * 100 - (128 * HEART_MOMENT.petScale) / 1080 * 100);
  Object.assign(el.style, { position: 'absolute', inset: '0', display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
    paddingTop: `${HEART_MOMENT.heartTopPct}%`, boxSizing: 'border-box', pointerEvents: 'auto', zIndex: 'var(--z-popup)',
    background: `radial-gradient(ellipse ${spot}px ${spot}px at 50% ${spotY}%, transparent 55%, ${dim} 100%)` });
  const heart = document.createElement('span');
  heart.className = 'tpp-heart-moment-heart'; heart.textContent = '♥'; heart.setAttribute('aria-hidden', 'true');
  Object.assign(heart.style, { font: `800 ${HEART_MOMENT.heartPx}px/1 var(--font-body)`, color: 'var(--red)',
    textShadow: '0 0 40px rgba(255, 214, 170, 0.85), 0 10px 0 rgba(58, 42, 31, 0.55)' });
  el.append(heart);
  for (const type of ['pointerdown', 'pointerup', 'click']) el.addEventListener(type, onPointer);
  el.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
  heart.animate?.([{ transform: 'scale(0)', offset: 0 }, { transform: 'scale(1.25)', offset: 0.6 }, { transform: 'scale(1)' }],
    { duration: HEART_MOMENT.popMs, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'both' });
  heart.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }, { transform: 'scale(1)' }],
    { duration: 700, delay: HEART_MOMENT.popMs, iterations: 2, easing: 'ease-in-out' });
  return el;
}

/**
 * WORK-032-2 fix 6b (DEC-048): the full-screen Heart moment in the HTML overlay — a dim and a big heart pop for
 * `HEART_MOMENT.totalMs`, then `onEnd` (the dialogue releases its held vignette box). Skippable by tap, click or key from
 * `skipAfterMs`; every input during the moment is consumed. View-only: no sim action, state or event. The chime is played here
 * at the start (view-timed, DEC-049); the confetti and the pet's big `react` are drawn by the scene half (`heartScene.ts`).
 */
export function createHeartMoment(root: HTMLElement, onEnd: () => void, audio: () => Pick<Audio, 'play'> | null = () => null): HeartMoment {
  let layer: HTMLElement | null = null;
  let skippable = false;
  const timers: ReturnType<typeof setTimeout>[] = [];
  const cleanup = () => {
    for (const t of timers.splice(0)) clearTimeout(t);
    window.removeEventListener('keydown', onKey, true);
    const had = layer !== null;
    layer?.remove(); layer = null; skippable = false;
    if (had) { window.dispatchEvent(new Event(HEART_ARRIVED)); window.dispatchEvent(new Event(HEART_MOMENT_END)); }
  };
  const finish = () => { if (!layer) return; cleanup(); onEnd(); };
  const onPointer = (e: Event) => {
    e.stopPropagation(); e.preventDefault();
    if (e.type === 'click' && skippable) finish();
  };
  // Capture phase on window runs before the game keyboard's listener; keyup passes so a held key is not left stuck.
  function onKey(e: KeyboardEvent): void {
    if (!layer) return;
    e.stopImmediatePropagation(); e.preventDefault();
    if (skippable) finish();
  }
  return {
    active: () => layer !== null,
    start() {
      cleanup();
      layer = mountLayer(onPointer);
      root.append(layer);
      audio()?.play('heart');   // DEC-049 view-timed; WORK-038-1 interim frame: the pop (WORK-038-2 moves it to the hit)
      window.addEventListener('keydown', onKey, true);
      timers.push(setTimeout(() => { skippable = true; }, HEART_MOMENT.skipAfterMs));
      timers.push(setTimeout(() => layer?.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: HEART_MOMENT.fadeOutMs, fill: 'forwards' }),
        HEART_MOMENT.totalMs - HEART_MOMENT.fadeOutMs));
      timers.push(setTimeout(finish, HEART_MOMENT.totalMs));
    },
    cancel: cleanup,
  };
}

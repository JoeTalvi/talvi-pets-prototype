import type { Audio } from '@app/audio';
import { glyphBurst, type GlyphBurst } from './glyphBurst';
import { createTickSeq } from './tickSeq';
import { STARS } from './timings';

export type Point = { x: number; y: number };

/** World point → `#panels` point: the overlay is 1920 wide at the canvas scale and the camera scrolls by (1080 − height) / 2. */
export function worldToOverlay(world: Point, overlayHeight: number): Point {
  return { x: world.x, y: world.y - (1080 - overlayHeight) / 2 };
}

/** The centre of `el` in `root`'s unscaled coordinates (the overlay is `transform: scale(--overlay-scale)`). */
export function centreIn(root: HTMLElement, el: HTMLElement): Point {
  const r = root.getBoundingClientRect(), b = el.getBoundingClientRect();
  const scale = Number(root.style.getPropertyValue('--overlay-scale')) || Number(root.parentElement?.style.getPropertyValue('--overlay-scale')) || 1;
  return { x: (b.left + b.width / 2 - r.left) / scale, y: (b.top + b.height / 2 - r.top) / scale };
}

/** Spec §4 beat text (not §C, order fork (d)): the first-copy sparkle ring grows 0.6 → 1.4 while fading; 8 small ★ spray (2 on a repeat). */
export const STARS_RING_SCALE = { from: 0.6, to: 1.4 } as const;
export const STARS_SMALL_COUNT = { first: 8, repeat: 2 } as const;
/** Spec §4: the track pulses 1 → 1.08 on each large ★ arrival. */
export const STARS_PULSE_SCALE = 1.08;

export type StarsBurstOptions = {
  /** Overlay point the gain starts at (the slot) and the track it flies into. */
  from: Point;
  to: Point;
  /** The ★ earned: one large ★ per ★. */
  delta: number;
  /** `delta ≥ tuning.starsFirstCopy`: the ring, 8 small ★ and the 520 ms flight; else 2 small ★ and the 420 ms flight. */
  firstCopy: boolean;
  /** Plays `tick` 0/+4/+7/+12 per arrival (one `tickSeq` per burst). */
  audio: () => Pick<Audio, 'play'> | null;
  /** Large ★ `i` landed (the owner steps the fill by 1 ★ and pulses the track). */
  onArrival?(i: number): void;
};

export type StarsBurst = { readonly el: HTMLElement; readonly totalMs: number; cancel(): void };

const live = new Set<StarsBurst>();

function ring(box: HTMLElement, at: Point): void {
  const el = document.createElement('span');
  el.className = 'tpp-stars-ring';
  Object.assign(el.style, { position: 'absolute', left: `${at.x - 40}px`, top: `${at.y - 40}px`, width: '80px', height: '80px', borderRadius: '50%',
    border: '4px solid var(--gold)', boxShadow: '0 0 12px rgba(255, 220, 120, 0.9)', pointerEvents: 'none', opacity: '0' });
  box.append(el);
  el.animate?.([{ transform: `scale(${STARS_RING_SCALE.from})`, opacity: 1 }, { transform: `scale(${STARS_RING_SCALE.to})`, opacity: 0 }],
    { duration: STARS.ringMs, easing: 'ease-out', fill: 'both' });
}

/**
 * DEC-049 spec §4 (WORK-038-3, rebuilt on `glyphBurst`): Stars sized by value. A first copy shows a sparkle ring and 8 small ★, a
 * repeat 2; one large ★ per ★ earned flies into the track `STARS.staggerMs` apart, each landing calling `onArrival(i)` and a tick of
 * the rising arpeggio. All gone by `STARS.totalMs` first / repeat (or the last landing, if later). View-only, `pointer-events: none`.
 */
export function starsBurst(root: HTMLElement, opts: StarsBurstOptions): StarsBurst {
  const box = document.createElement('div');
  box.className = 'tpp-stars-burst';
  box.dataset.kind = opts.firstCopy ? 'first' : 'repeat';
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: 'var(--z-toast)' });
  root.append(box);
  const ticks = createTickSeq(opts.audio);
  const parts: GlyphBurst[] = [];
  if (opts.firstCopy) ring(box, opts.from);
  parts.push(glyphBurst(box, { glyph: '★', px: STARS.smallPx, count: opts.firstCopy ? STARS_SMALL_COUNT.first : STARS_SMALL_COUNT.repeat,
    from: opts.from, spreadPx: STARS.spreadPx, staggerMs: 0, flightMs: STARS.ringMs * 2 }));
  const large = glyphBurst(box, { glyph: '★', px: STARS.largePx, count: Math.max(1, opts.delta), from: opts.from, to: opts.to,
    spreadPx: STARS.spreadPx, staggerMs: STARS.staggerMs, flightMs: opts.firstCopy ? STARS.flightMs : STARS.repeatFlightMs,
    onArrival: i => { ticks.tick(); opts.onArrival?.(i); } });
  large.el.classList.add('tpp-stars-large');
  parts.push(large);
  const totalMs = Math.max(opts.firstCopy ? STARS.totalMs.first : STARS.totalMs.repeat, large.totalMs);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const burst: StarsBurst = {
    el: box,
    totalMs,
    cancel() { if (timer) clearTimeout(timer); for (const part of parts.splice(0)) part.cancel(); box.remove(); live.delete(burst); },
  };
  timer = setTimeout(() => burst.cancel(), totalMs);
  live.add(burst);
  return burst;
}

/** Cancels every Stars burst under `root` (state.reset, scene change, Stars hidden); their remaining arrivals never fire. */
export function clearStarsBursts(root: HTMLElement): void {
  for (const burst of [...live]) if (root.contains(burst.el)) burst.cancel();
  for (const el of root.querySelectorAll('.tpp-stars-burst')) el.remove();
}

/** A Stars track whose fill steps by 1 ★ per large-★ arrival: the owner renders `points − pending()` and re-renders on each step. */
export type StarsFill = {
  pending(): number;
  /** Starts a gain burst into `track`; the fill holds `delta` ★ back and gives one back (with a pulse) per arrival. */
  gain(root: HTMLElement, track: HTMLElement, opts: Omit<StarsBurstOptions, 'to' | 'onArrival'>): StarsBurst;
  /** The bursts were cleared: release every held ★ at once. */
  release(): void;
};

export function createStarsFill(rerender: () => void): StarsFill {
  let pending = 0;
  return {
    pending: () => pending,
    gain(root, track, opts) {
      pending += Math.max(1, opts.delta);
      rerender();
      return starsBurst(root, { ...opts, to: centreIn(root, track), onArrival: () => {
        pending = Math.max(0, pending - 1);
        rerender();
        track.dataset.pulses = String(Number(track.dataset.pulses ?? 0) + 1);
        track.animate?.([{ transform: 'scale(1)' }, { transform: `scale(${STARS_PULSE_SCALE})` }, { transform: 'scale(1)' }], { duration: STARS.pulseMs });
      } });
    },
    release() { if (pending === 0) return; pending = 0; rerender(); },
  };
}

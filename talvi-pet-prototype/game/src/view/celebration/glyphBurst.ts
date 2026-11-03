import type { Point } from './starsBurst';

export type GlyphBurstOptions = {
  /** The text glyph each particle shows (★, ♥, ✦, a coin emoji…). */
  glyph: string;
  /** Font size in overlay px. */
  px: number;
  count: number;
  /** Overlay point the glyphs spray out of (`root`'s unscaled coordinates; see `worldToOverlay` / `centreIn`). */
  from: Point;
  /** When given, every glyph flies into `to` and `onArrival(i)` fires as glyph `i` lands; without it they spray and fade. */
  to?: Point;
  /** Radius of the spray ring around `from`. */
  spreadPx: number;
  /** Launch gap between glyph i and i + 1. */
  staggerMs: number;
  /** One glyph's flight (or spray-and-fade) time. */
  flightMs: number;
  /** CSS colour (default `var(--gold)`). */
  color?: string;
  onArrival?(i: number): void;
};

export type GlyphBurst = {
  /** The `pointer-events: none` container (class `tpp-glyph-burst`). */
  readonly el: HTMLElement;
  /** When the last glyph lands and the container is removed: `(count − 1) × staggerMs + flightMs`. */
  readonly totalMs: number;
  /** Removes the container now; no further `onArrival`. */
  cancel(): void;
};

const live = new Set<GlyphBurst>();

/**
 * DEC-049 spec §0 glyph burst (WORK-038-1, signature frozen for WORK-038-2/-3): `count` text glyphs spray out of `from` around a
 * `spreadPx` ring, launched `staggerMs` apart, each taking `flightMs` to fly into `to` (calling `onArrival(i)` on landing, in order) or,
 * without `to`, to fade out at the ring. View-only and non-blocking: the container has `pointer-events: none` and is removed at the end.
 */
export function glyphBurst(root: HTMLElement, opts: GlyphBurstOptions): GlyphBurst {
  const box = document.createElement('div');
  box.className = 'tpp-glyph-burst';
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: 'var(--z-toast)' });
  const timers: ReturnType<typeof setTimeout>[] = [];
  const half = opts.px / 2;
  const at = (p: Point, s: number) => `translate(${p.x - half}px, ${p.y - half}px) scale(${s})`;
  for (let i = 0; i < opts.count; i++) {
    const glyph = document.createElement('span');
    glyph.className = 'tpp-glyph'; glyph.textContent = opts.glyph;
    Object.assign(glyph.style, { position: 'absolute', left: '0', top: '0', fontSize: `${opts.px}px`, lineHeight: '1', color: opts.color ?? 'var(--gold)',
      textShadow: '0 0 10px rgba(255, 220, 120, 0.9), 0 2px 0 var(--ink)', opacity: '0', pointerEvents: 'none', willChange: 'transform, opacity' });
    box.append(glyph);
    const angle = (i / Math.max(1, opts.count)) * Math.PI * 2;
    const spray = { x: opts.from.x + Math.cos(angle) * opts.spreadPx, y: opts.from.y + Math.sin(angle) * opts.spreadPx };
    const frames = opts.to
      ? [{ transform: at(opts.from, 0.3), opacity: 0 }, { transform: at(spray, 1.25), opacity: 1, offset: 0.3 }, { transform: at(opts.to, 0.55), opacity: 0.9 }]
      : [{ transform: at(opts.from, 0.3), opacity: 0 }, { transform: at(spray, 1.15), opacity: 1, offset: 0.35 }, { transform: at(spray, 0.9), opacity: 0 }];
    glyph.animate?.(frames, { duration: opts.flightMs, delay: i * opts.staggerMs, easing: opts.to ? 'cubic-bezier(0.5, 0, 0.75, 0.2)' : 'ease-out', fill: 'both' });
    if (opts.to && opts.onArrival) timers.push(setTimeout(() => opts.onArrival!(i), i * opts.staggerMs + opts.flightMs));
  }
  const totalMs = Math.max(0, opts.count - 1) * opts.staggerMs + opts.flightMs;
  const burst: GlyphBurst = {
    el: box,
    totalMs,
    cancel() { for (const t of timers.splice(0)) clearTimeout(t); box.remove(); live.delete(burst); },
  };
  root.append(box);
  // Registered after the arrivals so the last glyph's `onArrival` runs before the container goes.
  timers.push(setTimeout(() => burst.cancel(), totalMs));
  live.add(burst);
  return burst;
}

/** Cancels every live glyph burst under `root` (state.reset, scene change, Stars hidden). */
export function clearGlyphBursts(root: HTMLElement): void {
  for (const burst of [...live]) if (root.contains(burst.el)) burst.cancel();
  for (const el of root.querySelectorAll('.tpp-glyph-burst')) el.remove();
}

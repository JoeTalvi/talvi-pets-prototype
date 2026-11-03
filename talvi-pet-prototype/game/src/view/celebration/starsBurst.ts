import { STARS_BURST } from './timings';

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

/**
 * WORK-032-2 fix 6a (DEC-048): `STARS_BURST.count` gold stars spray out of `from` and fly into `to`, staggered, all removed at
 * `totalMs`. View-only and non-blocking: the container has `pointer-events: none` and nothing waits on it.
 */
export function starsBurst(root: HTMLElement, from: Point, to: Point): HTMLElement {
  const box = document.createElement('div');
  box.className = 'tpp-stars-burst';
  box.setAttribute('aria-hidden', 'true');
  Object.assign(box.style, { position: 'absolute', inset: '0', pointerEvents: 'none', zIndex: 'var(--z-toast)' });
  for (let i = 0; i < STARS_BURST.count; i++) {
    const star = document.createElement('span');
    star.className = 'tpp-burst-star'; star.textContent = '★';
    Object.assign(star.style, { position: 'absolute', left: '0', top: '0', fontSize: '48px', lineHeight: '1', color: 'var(--gold)',
      textShadow: '0 0 10px rgba(255, 220, 120, 0.9), 0 2px 0 var(--ink)', opacity: '0', pointerEvents: 'none', willChange: 'transform, opacity' });
    box.append(star);
    const angle = (i / STARS_BURST.count) * Math.PI * 2;
    const spray = { x: from.x + Math.cos(angle) * STARS_BURST.spreadPx, y: from.y + Math.sin(angle) * STARS_BURST.spreadPx };
    const at = (p: Point, s: number) => `translate(${p.x - 24}px, ${p.y - 24}px) scale(${s})`;
    star.animate?.([
      { transform: at(from, 0.3), opacity: 0 },
      { transform: at(spray, 1.25), opacity: 1, offset: 0.3 },
      { transform: at(to, 0.55), opacity: 0.9 },
    ], { duration: STARS_BURST.flightMs, delay: i * STARS_BURST.staggerMs, easing: 'cubic-bezier(0.5, 0, 0.75, 0.2)', fill: 'both' });
  }
  root.append(box);
  setTimeout(() => box.remove(), STARS_BURST.totalMs);
  return box;
}

export function clearStarsBursts(root: HTMLElement): void {
  for (const el of root.querySelectorAll('.tpp-stars-burst')) el.remove();
}

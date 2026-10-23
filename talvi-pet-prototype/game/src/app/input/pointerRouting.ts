/** Keep browser gestures out of the play surface; HTML controls retain their taps. */
export function installPointerRouting(): () => void {
  const prevent = (event: Event) => event.preventDefault();
  const canvas = document.querySelector<HTMLCanvasElement>('#game canvas');
  const options = { passive: false };
  for (const name of ['contextmenu', 'gesturestart', 'gesturechange', 'wheel']) canvas?.addEventListener(name, prevent, options);
  return () => { for (const name of ['contextmenu', 'gesturestart', 'gesturechange', 'wheel']) canvas?.removeEventListener(name, prevent); };
}

export type PointerSample = { x: number; y: number; t: number };
export type PointerClass = { kind: 'tap' } | { kind: 'drag'; dx: number; dy: number; ms: number };

/** TECH-004 / presentation §3.1: a tap is a `pointerup` ≤ 300 ms after `pointerdown` with < 16 px travel. */
export function classifyPointer(down: PointerSample, up: PointerSample): PointerClass {
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  const ms = up.t - down.t;
  return ms <= 300 && Math.hypot(dx, dy) < 16 ? { kind: 'tap' } : { kind: 'drag', dx, dy, ms };
}

/** Core §3 `input.tap {x, y, target}` (at the `up` position) or `input.drag {target, dx, dy, ms}`. */
export function recordPointer(
  record: (type: 'input.tap' | 'input.drag', payload: Record<string, unknown>) => void,
  target: string, down: PointerSample, up: PointerSample,
): PointerClass {
  const result = classifyPointer(down, up);
  if (result.kind === 'tap') record('input.tap', { x: up.x, y: up.y, target });
  else record('input.drag', { target, dx: result.dx, dy: result.dy, ms: result.ms });
  return result;
}

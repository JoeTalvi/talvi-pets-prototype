export type Vector = { x: number; y: number };
export function keyboardVector(pressed: ReadonlySet<string>): Vector {
  const x = Number(pressed.has('ArrowRight') || pressed.has('KeyD')) - Number(pressed.has('ArrowLeft') || pressed.has('KeyA'));
  const y = Number(pressed.has('ArrowDown') || pressed.has('KeyS')) - Number(pressed.has('ArrowUp') || pressed.has('KeyW'));
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}
export function createKeyboard() {
  const pressed = new Set<string>();
  const keys = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
  const focused = () => document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') ?? false;
  const down = (event: KeyboardEvent) => { if (keys.has(event.code) && !focused()) { event.preventDefault(); pressed.add(event.code); } };
  const up = (event: KeyboardEvent) => { pressed.delete(event.code); };
  const clear = () => pressed.clear();
  window.addEventListener('keydown', down); window.addEventListener('keyup', up);
  window.addEventListener('blur', clear); document.addEventListener('visibilitychange', clear); document.addEventListener('focusin', clear);
  return {
    vector: () => focused() ? { x: 0, y: 0 } : keyboardVector(pressed),
    destroy() { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear); document.removeEventListener('focusin', clear); }
  };
}

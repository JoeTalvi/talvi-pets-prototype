export type Vector = { x: number; y: number };

/** TECH-017 / presentation §3.3: WASD + arrows, unit vector, normalised when both axes are non-zero. */
export function keyboardVector(pressed: ReadonlySet<string>): Vector {
  const x = Number(pressed.has('ArrowRight') || pressed.has('KeyD')) - Number(pressed.has('ArrowLeft') || pressed.has('KeyA'));
  const y = Number(pressed.has('ArrowDown') || pressed.has('KeyS')) - Number(pressed.has('ArrowUp') || pressed.has('KeyW'));
  const length = Math.hypot(x, y) || 1;
  return { x: x / length, y: y / length };
}

const MOVE_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyW', 'KeyA', 'KeyS', 'KeyD']);
const textFieldFocused = () =>
  document.activeElement?.matches('input, textarea, select, [contenteditable="true"]') ?? false;

export type Keyboard = {
  vector(): Vector;
  /** Backquote toggles the debug panel (WORK-014 owns the panel); ignored while a text field has focus. */
  onDebugToggle(fn: () => void): () => void;
  destroy(): void;
};

export function createKeyboard(): Keyboard {
  const pressed = new Set<string>();
  const toggles = new Set<() => void>();
  const down = (event: KeyboardEvent) => {
    if (textFieldFocused()) return;
    if (event.code === 'Backquote') { for (const fn of [...toggles]) fn(); return; }
    if (MOVE_KEYS.has(event.code)) { event.preventDefault(); pressed.add(event.code); }
  };
  const up = (event: KeyboardEvent) => { pressed.delete(event.code); };
  const clear = () => pressed.clear();
  window.addEventListener('keydown', down); window.addEventListener('keyup', up);
  window.addEventListener('blur', clear); document.addEventListener('visibilitychange', clear); document.addEventListener('focusin', clear);
  return {
    vector: () => (textFieldFocused() ? { x: 0, y: 0 } : keyboardVector(pressed)),
    onDebugToggle(fn) { toggles.add(fn); return () => { toggles.delete(fn); }; },
    destroy() {
      window.removeEventListener('keydown', down); window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear); document.removeEventListener('visibilitychange', clear); document.removeEventListener('focusin', clear);
      toggles.clear();
    },
  };
}

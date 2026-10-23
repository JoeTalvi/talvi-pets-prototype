import type { JoystickAdapter } from './joystick';
import type { Vector } from './keyboard';

/**
 * Presentation §3.3 arbitration for `tick.move`: an active joystick wins; otherwise `{0,0}` while the view reports
 * frozen input (`select.inputFrozen`, a fade, or a focus-owning panel); otherwise the keyboard vector.
 */
export function moveVector(input: {
  joystick: Pick<JoystickAdapter, 'active' | 'vector'>;
  keyboard: { vector(): Vector };
  frozen: boolean;
}): Vector {
  if (input.joystick.active) return input.joystick.vector;
  return input.frozen ? { x: 0, y: 0 } : input.keyboard.vector();
}

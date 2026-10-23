import type { Log } from '../log';
import type { Vector } from './keyboard';

/** TECH-009 / presentation §3.2: the joystick as numbers in, raw vector out (no Phaser pointer). */
export type JoystickOptions = {
  centre: () => Vector;
  range: number;          // content.tuning.joystick.range
  captureHalf: number;    // content.tuning.joystick.baseDiameter / 2
  record: Log['record'];
  now: () => number;
};

export type JoystickAdapter = {
  down(pointerId: number, x: number, y: number): boolean;
  move(pointerId: number, x: number, y: number): void;
  up(pointerId: number): void;
  release(): void;
  readonly vector: Vector;
  readonly active: boolean;
};

/** Offset over range, clamped to length ≤ 1 and never normalised (a small push is a slow walk). */
export function joystickVector(centre: Vector, x: number, y: number, range: number): Vector {
  const vx = (x - centre.x) / range;
  const vy = (y - centre.y) / range;
  const length = Math.hypot(vx, vy);
  return length > 1 ? { x: vx / length, y: vy / length } : { x: vx, y: vy };
}

export function createJoystickAdapter(options: JoystickOptions): JoystickAdapter {
  let captured: number | null = null;
  let startedAt = 0;
  let vector: Vector = { x: 0, y: 0 };

  const move = (pointerId: number, x: number, y: number) => {
    if (pointerId !== captured) return;
    vector = joystickVector(options.centre(), x, y, options.range);
  };
  const release = () => {
    if (captured === null) return;
    captured = null;
    vector = { x: 0, y: 0 };
    options.record('input.joystick', { phase: 'end', ms: options.now() - startedAt });
  };

  return {
    down(pointerId, x, y) {
      const centre = options.centre();
      const inside = Math.abs(x - centre.x) <= options.captureHalf && Math.abs(y - centre.y) <= options.captureHalf;
      if (captured !== null || !inside) return false;
      captured = pointerId;
      startedAt = options.now();
      options.record('input.joystick', { phase: 'start' });
      move(pointerId, x, y);
      return true;
    },
    move,
    up(pointerId) { if (pointerId === captured) release(); },
    release,
    get vector() { return vector; },
    get active() { return captured !== null; },
  };
}

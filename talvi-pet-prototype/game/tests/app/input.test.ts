import { describe, expect, it } from 'vitest';
import { keyboardVector } from '../../src/app/input/keyboard';
import { moveVector } from '../../src/app/input/move';
import { classifyPointer, recordPointer } from '../../src/app/input/pointerRouting';

describe('presentation §3.1 tap/drag classification', () => {
  it('presentation §3.1 tap is ≤ 300 ms and < 16 px; otherwise a drag with dx, dy, ms', () => {
    expect(classifyPointer({ x: 0, y: 0, t: 0 }, { x: 15, y: 0, t: 300 })).toEqual({ kind: 'tap' });
    expect(classifyPointer({ x: 0, y: 0, t: 0 }, { x: 15, y: 0, t: 301 })).toEqual({ kind: 'drag', dx: 15, dy: 0, ms: 301 });
    expect(classifyPointer({ x: 0, y: 0, t: 0 }, { x: 16, y: 0, t: 100 })).toEqual({ kind: 'drag', dx: 16, dy: 0, ms: 100 });
  });

  it('presentation §3.1 tap recordPointer writes input.tap at the up position or input.drag', () => {
    const records: { type: string; payload: Record<string, unknown> }[] = [];
    const record = (type: 'input.tap' | 'input.drag', payload: Record<string, unknown>) => records.push({ type, payload });
    recordPointer(record, 'slot:small-2', { x: 100, y: 200, t: 0 }, { x: 104, y: 203, t: 120 });
    recordPointer(record, 'world', { x: 100, y: 200, t: 0 }, { x: 140, y: 230, t: 450 });
    expect(records).toEqual([
      { type: 'input.tap', payload: { x: 104, y: 203, target: 'slot:small-2' } },
      { type: 'input.drag', payload: { target: 'world', dx: 40, dy: 30, ms: 450 } },
    ]);
  });
});

describe('presentation §3.3 arbitration', () => {
  const keyboard = { vector: () => ({ x: 1, y: 0 }) };
  const idle = { active: false, vector: { x: 0, y: 0 } };
  const pushed = { active: true, vector: { x: 0.25, y: -0.5 } };

  it('presentation §3.3 arbitration joystick wins while active, else keyboard, else zero when frozen', () => {
    expect(moveVector({ joystick: pushed, keyboard, frozen: false })).toEqual({ x: 0.25, y: -0.5 });
    expect(moveVector({ joystick: idle, keyboard, frozen: false })).toEqual({ x: 1, y: 0 });
    expect(moveVector({ joystick: idle, keyboard, frozen: true })).toEqual({ x: 0, y: 0 });
  });

  it('presentation §3.3 arbitration keyboardVector normalises a diagonal', () => {
    const v = keyboardVector(new Set(['KeyA', 'KeyS']));
    expect(v.x).toBeCloseTo(-0.7071, 4);
    expect(v.y).toBeCloseTo(0.7071, 4);
    expect(keyboardVector(new Set())).toEqual({ x: 0, y: 0 });
  });
});

import { expect, it } from 'vitest';
import type { SceneAction } from '../../src/sim/actions';
import { applySceneRules } from '../../src/sim/rules/scene';
import { deepFreeze, squareFixture, tick } from './helpers';

it('VERIFY-MEC-001-001 full speed moves 11.52 px and snaps facing, without input mutation', () => {
  const { content, state } = squareFixture();
  const result = applySceneRules(deepFreeze(content), deepFreeze(state), deepFreeze(tick(1, 0)));
  expect(result.state.avatar).toMatchObject({ x: 511.52, y: 400, facing: 'right' });
  expect(state.avatar.x).toBe(500);
  expect(result.events).toEqual([]);
});

it('VERIFY-MEC-001-002 raw half push preserves analog speed', () => {
  const { content, state } = squareFixture();
  expect(applySceneRules(content, state, tick(0.5)).state.avatar.x).toBeCloseTo(505.76, 10);
});

it('VERIFY-MEC-001-003 diagonal normalizes then slides along the wall', () => {
  const { content, state } = squareFixture();
  state.avatar.x = 895;
  const avatar = applySceneRules(content, state, tick(1, 1, 100)).state.avatar;
  expect(avatar.x).toBe(895);
  expect(avatar.y).toBeCloseTo(400 + 72 / Math.SQRT2, 10);
});

it('VERIFY-MEC-001-004 corner is stuck and does not clamp to a different point', () => {
  const { content, state } = squareFixture();
  state.avatar.x = 900; state.avatar.y = 700;
  expect(applySceneRules(content, state, tick(1, 1, 100)).state.avatar).toMatchObject({ x: 900, y: 700 });
});

it('VERIFY-MEC-001-005 idle snaps immediately, retains facing on stop, and snaps after restart', () => {
  const { content, state } = squareFixture();
  const up = applySceneRules(content, state, tick(0, -1)).state;
  expect(up.avatar.facing).toBe('up');
  const idle = applySceneRules(content, up, tick()).state;
  expect(idle.avatar.facing).toBe('up');
  expect(idle.avatar.facingCandidate).toBeNull();
  expect(applySceneRules(content, idle, tick(-1)).state.avatar.facing).toBe('left');
});

it('VERIFY-MEC-001-006 qualified: normative R2 starts candidate at 0; turns on fifth 16 ms tick', () => {
  const { content, state } = squareFixture();
  let current = applySceneRules(content, state, tick(1)).state;
  const held: number[] = [];
  for (let index = 0; index < 4; index++) {
    current = applySceneRules(content, current, tick(0, 1)).state;
    held.push(current.avatar.facingCandidate!.heldMs);
    expect(current.avatar.facing).toBe('right');
  }
  expect(held).toEqual([0, 16, 32, 48]);
  const turned = applySceneRules(content, current, tick(0, 1)).state;
  expect(turned.avatar).toMatchObject({ facing: 'down', facingCandidate: { facing: 'down', heldMs: 64 } });
  const stopped = applySceneRules(content, current, tick()).state;
  expect(stopped.avatar).toMatchObject({ facing: 'right', facingCandidate: null });
});

it('MEC-001 R2 changes pending direction, uses horizontal ties, and switches at exactly 60 ms', () => {
  const { content, state } = squareFixture();
  let current = applySceneRules(content, state, tick(1)).state;
  current = applySceneRules(content, current, tick(0, 1)).state;
  current = applySceneRules(content, current, tick(-1, -1)).state;
  expect(current.avatar.facingCandidate).toEqual({ facing: 'left', heldMs: 0 });
  current = applySceneRules(content, current, tick(-1, -1, 60)).state;
  expect(current.avatar.facing).toBe('left');
});

it('MEC-001 R3 tries x before y and accepts polygon edges including concave interiors', () => {
  const { content, state } = squareFixture();
  state.avatar.y = 695;
  expect(applySceneRules(content, state, tick(1, 1, 100)).state.avatar)
    .toMatchObject({ x: 500 + 72 / Math.SQRT2, y: 695 });
  content.rooms['dog-room'].walkArea = [
    { x: 100, y: 100 }, { x: 900, y: 100 }, { x: 900, y: 300 },
    { x: 500, y: 300 }, { x: 500, y: 700 }, { x: 100, y: 700 },
  ];
  state.avatar.x = 500; state.avatar.y = 400;
  expect(applySceneRules(content, state, tick(1, 1, 100)).state.avatar)
    .toMatchObject({ x: 500, y: 400 + 72 / Math.SQRT2 });
});

it.each([NaN, Infinity, -Infinity])('MEC-001 non-finite movement %s sanitizes the whole vector to zero', value => {
  const { content, state } = squareFixture();
  const result = applySceneRules(content, state, tick(value, 1));
  expect(result.state.avatar).toEqual(state.avatar);
  expect(result.events).toEqual([]);
});

it('MEC-001 finite oversized movement normalizes without floating-point overflow', () => {
  const { content, state } = squareFixture();
  const result = applySceneRules(content, state, tick(Number.MAX_VALUE, Number.MAX_VALUE, 100));
  expect(result.state.avatar.x).toBeCloseTo(500 + 72 / Math.SQRT2, 10);
  expect(result.state.avatar.y).toBeCloseTo(400 + 72 / Math.SQRT2, 10);
});

it.each([
  { ...tick(), dtMs: NaN }, { ...tick(), dtMs: -1 }, { ...tick(), dtMs: 101 },
  { ...tick(), move: null }, { ...tick(), move: { x: '1', y: 0 } },
])('MEC-001 malformed tick rejects atomically: %j', malformed => {
  const { content, state } = squareFixture();
  const action = malformed as unknown as SceneAction;
  const result = applySceneRules(content, deepFreeze(state), action);
  expect(result.state).toBe(state);
  expect(result.events).toEqual([{ type: 'action.rejected', action, reason: 'invalidPayload' }]);
});

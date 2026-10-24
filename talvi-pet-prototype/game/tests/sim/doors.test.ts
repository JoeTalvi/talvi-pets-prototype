import { expect, it } from 'vitest';
import { stepDoors } from '../../src/sim/rules/doors';
import { reduce } from '../../src/sim/reduce';
import { doorEnabled } from '../../src/sim/select';
import { initialState } from '../../src/sim/state';
import { deepFreeze, squareFixture, tick } from './helpers';

it('VERIFY-MEC-001-007 qualified: R3 rejects y94 overshoot; 16 ms reaches the door and swaps', () => {
  const { content, state } = squareFixture();
  state.avatar.y = 130;
  const overshoot = reduce(content, deepFreeze(state), tick(0, -1, 50));
  expect(overshoot.state.avatar.y).toBe(130);
  expect(overshoot.state.scene).toEqual(state.scene);
  expect(overshoot.events).toEqual([]);
  const crossing = reduce(content, state, tick(0, -1));
  expect(crossing.state.scene).toEqual({ kind: 'street' });
  expect(crossing.state.avatar).toEqual({ ...content.street.houses[0].door.spawn,
    immunityMs: 500, facingCandidate: null });
  expect(crossing.state.mode).toBe('play');
  expect(crossing.events).toEqual([{ type: 'scene.changed', from: state.scene,
    to: { kind: 'street' }, doorId: 'to-street' }]);
});

it('VERIFY-MEC-001-008 arrival immunity survives 400 ms in the street door, then expires', () => {
  const { content, state } = squareFixture();
  state.avatar.y = 130;
  let current = reduce(content, state, tick(0, -1)).state;
  for (let index = 0; index < 4; index++) {
    const result = reduce(content, current, tick(0, -1, 100));
    expect(result.events).toEqual([]);
    expect(result.state.scene).toEqual({ kind: 'street' });
    current = result.state;
  }
  expect(current.avatar.immunityMs).toBe(100);
  const returned = reduce(content, current, tick(0, 0, 100));
  expect(returned.state.scene).toEqual({ kind: 'interior', roomId: 'dog-room' });
  expect(returned.events.filter(event => !event.type.startsWith('pet.'))).toHaveLength(1);
  expect(returned.state.avatar.immunityMs).toBe(500);
});

it('VERIFY-MEC-001-009 gate requires both completion and arrival; target spawn belongs to destination', () => {
  const { content } = squareFixture();
  const state = initialState(content, 1), door = content.street.houses[1].door;
  state.avatar.x = door.rect.x; state.avatar.y = door.rect.y;
  expect(doorEnabled(content, state, door)).toBe(false);
  expect(stepDoors(content, state)).toEqual({ state, events: [] });
  state.projects['pet-house'].complete = true;
  state.projects['pet-house'].acknowledgedPhase = 5;
  state.projects['pet-house'].currentCents = 1500;
  expect(doorEnabled(content, state, door)).toBe(false);
  state.projects['pet-house'].arrivalDone = true;
  const result = stepDoors(content, deepFreeze(state));
  expect(doorEnabled(content, state, door)).toBe(true);
  expect(result.state.scene).toEqual({ kind: 'interior', roomId: 'owl-room' });
  expect(result.state.avatar).toEqual({ ...content.rooms['owl-room'].doors[0].spawn,
    immunityMs: 500, facingCandidate: null });
  expect(result.events).toEqual([{ type: 'scene.changed', from: state.scene,
    to: result.state.scene, doorId: door.id }]);
});

it.each([
  [480, 100, true], [519.99, 119.99, true], [520, 110, false], [500, 120, false], [479.99, 110, false],
])('MEC-001 half-open door bounds at (%s,%s) => %s', (x, y, enters) => {
  const { content, state } = squareFixture();
  state.avatar.x = x as number; state.avatar.y = y as number;
  expect(stepDoors(content, state).events.length > 0).toBe(enters);
});

it('MEC-001 street targets and projectless room targets are enabled; starter is enabled initially', () => {
  const { content, state } = squareFixture();
  expect(doorEnabled(content, state, content.rooms['dog-room'].doors[0])).toBe(true);
  expect(doorEnabled(content, state, content.street.houses[0].door)).toBe(true);
  content.projects = [];
  expect(doorEnabled(content, state, content.street.houses[1].door)).toBe(true);
});

it('MEC-001 R4 forces play and clears facing candidate on an immediate swap', () => {
  const { content, state } = squareFixture();
  state.mode = 'design'; state.avatar.x = 500; state.avatar.y = 110;
  state.avatar.facingCandidate = { facing: 'right', heldMs: 40 };
  const result = stepDoors(content, state);
  expect(result.state.mode).toBe('play');
  expect(result.state.avatar.facingCandidate).toBeNull();
  expect(result.events.map(event => event.type)).toEqual(['scene.changed']);
});

it('MEC-001 invalid content cannot silently place the avatar at an unrelated spawn', () => {
  const { content, state } = squareFixture();
  state.avatar.y = 110;
  content.rooms['dog-room'].doors[0].target.doorId = 'missing';
  expect(() => stepDoors(content, state)).toThrow('Unresolved target door missing');
});

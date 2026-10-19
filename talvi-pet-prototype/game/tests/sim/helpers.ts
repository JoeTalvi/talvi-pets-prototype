import { RoomSchema } from '../../src/content/schema/room';
import type { TickAction } from '../../src/sim/actions';
import { initialState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import square from '../fixtures/room-square.json';

export function squareFixture(seed = 1) {
  const content = validContent();
  content.rooms['dog-room'] = RoomSchema.parse(square);
  const state = initialState(content, seed);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.avatar = { x: 500, y: 400, facing: 'down', immunityMs: 0, facingCandidate: null };
  return { content, state };
}

export function tick(x = 0, y = 0, dtMs = 16): TickAction {
  return { type: 'tick', dtMs, move: { x, y } };
}

/** Test inputs may be frozen recursively to prove pure rules never mutate them. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

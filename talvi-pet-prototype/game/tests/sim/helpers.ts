import type { Content } from '../../src/content/types';
import { RoomSchema } from '../../src/content/schema/room';
import type { Action, TickAction } from '../../src/sim/actions';
import type { RuleResult, SimEvent } from '../../src/sim/events';
import { initialState, type GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import square from '../fixtures/room-square.json';

/** FX-ROOM-SQUARE; orientation and the Dog intro are marked done so MEC-001 rows are not frozen
 * by the scripts that later lanes add (convention 6). */
export function squareFixture(seed = 1) {
  const content = validContent();
  content.rooms['dog-room'] = RoomSchema.parse(square);
  const state = initialState(content, seed);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.avatar = { x: 500, y: 400, facing: 'down', immunityMs: 0, facingCandidate: null };
  state.session.orientationShown = true;
  state.pets.dog.introduced = true;
  return { content, state };
}

export function tick(x = 0, y = 0, dtMs = 16): TickAction {
  return { type: 'tick', dtMs, move: { x, y } };
}

/** Verification §5: run ticks of `step` ms (the last one shorter) and collect every event. */
export function advance(reduceFn: (content: Content, state: GameState, action: Action) => RuleResult,
  content: Content, state: GameState, ms: number, step = 100): { state: GameState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  let current = state;
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    const result = reduceFn(content, current, tick(0, 0, Math.min(step, ms - elapsed)));
    current = result.state; events.push(...result.events);
  }
  return { state: current, events };
}

/** Test inputs may be frozen recursively to prove pure rules never mutate them. */
export function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

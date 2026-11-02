import type { Point } from '../../src/content/schema/common';
import type { Content } from '../../src/content/types';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { initialState, type GameState } from '../../src/sim/state';
import { tick } from './helpers';

/** A street state ready to walk: orientation done, feed frozen (no celebration can freeze input mid-walk). */
export function streetReady(content: Content, at?: Point): GameState {
  const state = initialState(content, 1);
  state.session.orientationShown = true;
  state.session.eventIntervalMs = null;
  if (at) state.avatar = { ...state.avatar, x: at.x, y: at.y, immunityMs: 0, facingCandidate: null };
  return state;
}

/** MEC-001 DEC-012: steer in a straight line toward `target` (no pathfinding), 16 ms ticks, until within 6 px,
 * a scene change, or `maxMs`; `each` sees every post-tick state. */
export function walkTo(content: Content, state: GameState, target: Point, maxMs = 5000,
  each: (s: GameState) => void = () => {}): { state: GameState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  for (let elapsed = 0; elapsed < maxMs && state.scene.kind === 'street'; elapsed += 16) {
    const dx = target.x - state.avatar.x, dy = target.y - state.avatar.y, d = Math.hypot(dx, dy);
    if (d < 6) break;
    const result = reduce(content, state, tick(dx / d, dy / d, 16));
    state = result.state; events.push(...result.events); each(state);
  }
  return { state, events };
}

/** Hold one direction for `ms` (16 ms ticks); `each` sees every post-tick state. */
export function hold(content: Content, state: GameState, move: Point, ms: number,
  each: (s: GameState) => void = () => {}): { state: GameState; events: SimEvent[] } {
  const events: SimEvent[] = [];
  for (let elapsed = 0; elapsed < ms && state.scene.kind === 'street'; elapsed += 16) {
    const result = reduce(content, state, tick(move.x, move.y, 16));
    state = result.state; events.push(...result.events); each(state);
  }
  return { state, events };
}

import type { Content } from '@content/types';
import type { Action } from '@sim/actions';
import type { SimEvent } from '@sim/events';
import { reduce } from '@sim/reduce';
import { clueIndices } from '@sim/rules/celebration';
import type { GameState } from '@sim/state';

/** CONTRACT-EVENTS v1.4 store (foundation §4.1, §7): one `reduce` per dispatch, synchronous ordered publish. */
export type EventOf<T extends SimEvent['type']> = Extract<SimEvent, { type: T }>;
export type Store = {
  getState(): GameState;
  dispatch(action: Action): void;
  subscribe<T extends SimEvent['type']>(type: T, fn: (event: EventOf<T>, stateAfter: GameState) => void): () => void;
  subscribeAll(fn: (event: SimEvent, stateAfter: GameState) => void): () => void;
  onChange(fn: (stateAfter: GameState) => void): () => void;
  start(): void;
};
type Listener = (event: SimEvent, stateAfter: GameState) => void;

const finiteOr0 = (value: number) => (Number.isFinite(value) ? value : 0);

/** Core §2 `tick.dtMs` is 0..100 in the reducer; the controller clamps and sanitises before `reduce`. */
export function sanitiseAction(content: Content, action: Action): Action {
  if (action.type !== 'tick') return action;
  const dtMs = Math.min(content.tuning.dtClampMs, Math.max(0, finiteOr0(action.dtMs)));
  return { type: 'tick', dtMs, move: { x: finiteOr0(action.move.x), y: finiteOr0(action.move.y) } };
}

/** The replay notification a loaded mid-celebration save publishes on `start()` (TECH-007). */
export function replayEvent(state: GameState): EventOf<'celebration.started'> | null {
  const celebration = state.celebration;
  if (celebration === null) return null;
  const { projectId, fromPhase, toPhase, completes, unlockedTypeIds } = celebration;
  return { type: 'celebration.started', projectId, fromPhase, toPhase, completes,
    unlockedTypeIds: [...unlockedTypeIds], clueIndices: clueIndices(fromPhase, toPhase), replay: true };
}

function remover<T>(set: Set<T>, fn: T): () => void {
  set.add(fn);
  return () => { set.delete(fn); };
}

export function createStore(content: Content, initial: GameState): Store {
  let state = initial;
  const byType = new Map<SimEvent['type'], Set<Listener>>();
  const all = new Set<Listener>();
  const changes = new Set<(stateAfter: GameState) => void>();
  const queue: Action[] = [];
  let busy = false;

  const publish = (event: SimEvent) => {
    for (const fn of [...(byType.get(event.type) ?? [])]) fn(event, state);
    for (const fn of [...all]) fn(event, state);
  };
  const runOne = (action: Action) => {
    const before = state;
    const result = reduce(content, before, sanitiseAction(content, action));
    state = result.state;
    for (const event of result.events) publish(event);
    if (state !== before) for (const fn of [...changes]) fn(state);
  };
  // Re-entrant dispatches (from a subscriber) queue until the current publish completes (foundation §7).
  const guarded = (work: () => void) => {
    busy = true;
    try {
      work();
      for (let next = queue.shift(); next; next = queue.shift()) runOne(next);
    } finally { busy = false; queue.length = 0; }
  };
  return {
    getState: () => state,
    dispatch(action) { if (busy) queue.push(action); else guarded(() => runOne(action)); },
    subscribe(type, fn) {
      if (!byType.has(type)) byType.set(type, new Set());
      return remover(byType.get(type)!, fn as Listener);
    },
    subscribeAll: fn => remover(all, fn),
    onChange: fn => remover(changes, fn),
    start() { const event = replayEvent(state); if (event) guarded(() => publish(event)); },
  };
}

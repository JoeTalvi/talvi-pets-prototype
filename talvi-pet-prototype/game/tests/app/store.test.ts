import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/app/store';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import type { GameState } from '../../src/sim/state';
import { dogRoomDesign, squareFixture } from '../sim/helpers';

const place: Action = { type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' };

function recordAll(store: ReturnType<typeof createStore>) {
  const seen: { event: SimEvent; stateAfter: GameState }[] = [];
  store.subscribeAll((event, stateAfter) => seen.push({ event, stateAfter }));
  return seen;
}

describe('CONTRACT-EVENTS v1.4 store', () => {
  it('CONTRACT-EVENTS v1.4 store publishes reduce order to typed then all subscribers with stateAfter', () => {
    const { content, state } = dogRoomDesign();
    const store = createStore(content, state);
    const order: string[] = [];
    const typed: GameState[] = [];
    store.subscribe('charm.placed', (event, stateAfter) => { order.push(`typed:${event.type}`); typed.push(stateAfter); });
    store.subscribeAll(event => order.push(`all:${event.type}`));
    store.dispatch(place);
    expect(order.slice(0, 3)).toEqual(['typed:charm.placed', 'all:charm.placed', 'all:stars.changed']);
    expect(typed[0]).toBe(store.getState());
    expect(store.getState().rooms['dog-room'].placements['large-1']).toBe('dog-bed');
    expect(JSON.parse(JSON.stringify(store.getState()))).toEqual(store.getState());
  });

  it('CONTRACT-EVENTS v1.4 store queues a re-entrant dispatch until the outer publish completes', () => {
    const { content, state } = dogRoomDesign();
    const store = createStore(content, state);
    const seen = recordAll(store);
    const off = store.subscribe('charm.placed', () => { off(); store.dispatch({ type: 'removeCharm', slotId: 'large-1' }); });
    store.dispatch(place);
    const { state: placed, events: outer } = reduce(content, state, place);
    const inner = reduce(content, placed, { type: 'removeCharm', slotId: 'large-1' }).events;
    // Placing dog-bed fulfils soft-nap and opens its vignette, so the queued removeCharm is rejected (dialogue open).
    expect(seen.map(entry => entry.event)).toEqual([...outer, ...inner]);
    expect(inner.length).toBeGreaterThan(0);
    expect(seen.slice(0, outer.length).every(entry => entry.stateAfter.rooms['dog-room'].placements['large-1'] === 'dog-bed')).toBe(true);
  });

  it('CONTRACT-EVENTS v1.4 store unsubscribe stops delivery; a rejected action publishes but fires no onChange', () => {
    const { content, state } = dogRoomDesign();
    const store = createStore(content, state);
    const typed: SimEvent[] = [];
    const off = store.subscribe('charm.placed', event => typed.push(event));
    off();
    const changes: GameState[] = [];
    store.onChange(stateAfter => changes.push(stateAfter));
    const seen = recordAll(store);
    store.dispatch({ type: 'setDesignMode', on: true });
    expect(seen.map(entry => entry.event)).toEqual([expect.objectContaining({ type: 'action.rejected', reason: 'noChange' })]);
    expect(changes).toHaveLength(0);
    store.dispatch(place);
    expect(typed).toHaveLength(0);
    expect(changes).toEqual([store.getState()]);
  });
});

describe('verification §5 dt clamp', () => {
  it('verification §5 dt clamp: tick dtMs 500 reaches reduce as 100 (Δx 72), no rejection', () => {
    const { content, state } = squareFixture();
    const store = createStore(content, state);
    const seen = recordAll(store);
    store.dispatch({ type: 'tick', dtMs: 500, move: { x: 1, y: 0 } });
    expect(store.getState().avatar.x - state.avatar.x).toBeCloseTo(72, 6);
    expect(seen.filter(entry => entry.event.type === 'action.rejected')).toEqual([]);
  });

  it('verification §5 dt clamp: NaN dtMs → 0 and non-finite move → {0,0} before reduce (no invalidPayload)', () => {
    const { content, state } = squareFixture();
    const store = createStore(content, state);
    const seen = recordAll(store);
    store.dispatch({ type: 'tick', dtMs: NaN, move: { x: 1, y: 0 } });
    store.dispatch({ type: 'tick', dtMs: 50, move: { x: NaN, y: Infinity } });
    store.dispatch({ type: 'tick', dtMs: -20, move: { x: 1, y: 0 } });
    expect(seen).toEqual([]);
    expect(store.getState().avatar.x).toBe(state.avatar.x);
    expect(store.getState().avatar.y).toBe(state.avatar.y);
  });
});

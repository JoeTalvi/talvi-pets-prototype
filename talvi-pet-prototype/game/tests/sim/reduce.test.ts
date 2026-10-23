import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/sim/actions';
import { reduce } from '../../src/sim/reduce';
import { initialState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { deepFreeze, dogRoomDesign, tick } from './helpers';

describe('CONTRACT-ACTIONS v1.4 reduce', () => {
  it.each([
    { ...tick(), dtMs: NaN }, { ...tick(), dtMs: 101 }, { ...tick(), dtMs: -1 }, { ...tick(), move: null },
    { type: 'placeCharm', slotId: 3, typeId: 'lamp' }, { type: 'placeCharm', slotId: 'floor-1' },
    { type: 'setDesignMode', on: 'yes' }, { type: 'removeCharm' }, { type: 'tapPet', petId: 7 },
    { type: 'debugSetCurrent', projectId: 'pet-house', cents: 1.5 }, { type: 'debugSetSeed', seed: Infinity },
    { type: 'debugSetEventInterval', ms: NaN }, { type: 'debugSetFeedPresentation', mode: 'loud' },
    { type: 'reset', seed: 'x' }, { type: 'noSuchAction' },
  ])('CONTRACT-ACTIONS v1.4 reduce rejects malformed payload %j as invalidPayload, state identical', malformed => {
    const { content, state } = dogRoomDesign();
    const action = malformed as unknown as Action;
    const result = reduce(deepFreeze(content), deepFreeze(state), action);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([{ type: 'action.rejected', action, reason: 'invalidPayload' }]);
  });

  it('CONTRACT-ACTIONS v1.4 reduce checks the payload before preconditions: a valid placeCharm in play mode is notDesignMode', () => {
    const content = validContent(), state = deepFreeze(initialState(content, 1));
    const action: Action = { type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' };
    const result = reduce(content, state, action);
    expect(result.state).toBe(state);
    expect(result.events).toEqual([{ type: 'action.rejected', action, reason: 'notDesignMode' }]);
  });

  it('CONTRACT-ACTIONS v1.4 reduce routes tick, setDesignMode, placeCharm and removeCharm', () => {
    const { content, state } = dogRoomDesign();
    expect(state.mode).toBe('design');
    const placed = reduce(content, state, { type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(placed.events[0].type).toBe('charm.placed');
    const removed = reduce(content, placed.state, { type: 'removeCharm', slotId: 'floor-1' });
    expect(removed.events[0].type).toBe('charm.removed');
    expect(reduce(content, removed.state, tick(0, 0, 100)).state.feed.sinceLastEventMs).toBe(100);
    expect(reduce(content, removed.state, { type: 'setDesignMode', on: false }).events)
      .toEqual([{ type: 'mode.changed', mode: 'play' }]);
  });

  it('CONTRACT-ACTIONS v1.4 reduce rejections leave the state identical by reference', () => {
    const { content, state } = dogRoomDesign();
    for (const action of [
      { type: 'removeCharm', slotId: 'floor-1' }, { type: 'placeCharm', slotId: 'nope', typeId: 'lamp' },
      { type: 'setDesignMode', on: true },
    ] as Action[]) expect(reduce(content, deepFreeze(state), action).state).toBe(state);
  });

  it.each([
    [{ type: 'advanceDialogue' }, 2], [{ type: 'tapPet', petId: 'dog' }, 3],
    [{ type: 'acknowledgeProject', projectId: 'pet-house' }, 4], [{ type: 'reset' }, 4],
    [{ type: 'debugSimulatePurchase' }, 4], [{ type: 'collectRewards' }, 4],
  ] as [Action, number][])('CONTRACT-ACTIONS v1.4 reduce throws for an unlanded action %j', (action, lane) => {
    const { content, state } = dogRoomDesign();
    expect(() => reduce(content, state, action)).toThrow(`WORK-003-${lane} lands ${action.type}`);
    expect(() => reduce(content, state, action)).toThrow(/WORK-003-[234] lands/);
  });
});

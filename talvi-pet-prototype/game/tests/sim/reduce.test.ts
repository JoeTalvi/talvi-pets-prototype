import { describe, expect, it } from 'vitest';
import type { Action } from '../../src/sim/actions';
import { reduce } from '../../src/sim/reduce';
import { initialState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { actionNames } from '../fixtures/core-contract';
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
});

it('CONTRACT-ACTIONS v1.5 reduce handles all 25 actions: a minimal dispatch of each returns a RuleResult, none throws', () => {
  const { content, state } = dogRoomDesign();
  const minimal: Record<Action['type'], Action> = {
    tick: tick(), setDesignMode: { type: 'setDesignMode', on: false },
    placeCharm: { type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' }, removeCharm: { type: 'removeCharm', slotId: 'floor-1' },
    acknowledgeProject: { type: 'acknowledgeProject', projectId: 'pet-house' }, cutsceneFinished: { type: 'cutsceneFinished' },
    collectRewards: { type: 'collectRewards' }, skipWait: { type: 'skipWait' }, closeReveal: { type: 'closeReveal' },
    arrivalFinished: { type: 'arrivalFinished' }, advanceDialogue: { type: 'advanceDialogue' },
    tapPet: { type: 'tapPet', petId: 'dog' }, debugSimulatePurchase: { type: 'debugSimulatePurchase' },
    debugSetEventInterval: { type: 'debugSetEventInterval', ms: 250 },
    debugSetFeedPresentation: { type: 'debugSetFeedPresentation', mode: 'trickle' },
    debugSetSeed: { type: 'debugSetSeed', seed: 7 }, debugSetCurrent: { type: 'debugSetCurrent', projectId: 'pet-house', cents: 10 },
    debugJumpPhase: { type: 'debugJumpPhase', projectId: 'pet-house' },
    debugCompleteProject: { type: 'debugCompleteProject', projectId: 'pet-house' },
    debugUnlockAllTypes: { type: 'debugUnlockAllTypes' }, debugGrantCopies: { type: 'debugGrantCopies', typeId: 'lamp', count: 1 },
    debugSetStarsVisible: { type: 'debugSetStarsVisible', on: false },
    debugSetMuted: { type: 'debugSetMuted', on: true }, debugSetTesterLabel: { type: 'debugSetTesterLabel', text: ' T1 ' },
    reset: { type: 'reset' },
  };
  expect(Object.keys(minimal).sort()).toEqual([...actionNames].sort());
  for (const action of Object.values(minimal)) {
    const result = reduce(deepFreeze(content), deepFreeze(state), action);
    expect(Array.isArray(result.events)).toBe(true);
    expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
    const rejection = result.events.find(event => event.type === 'action.rejected');
    if (rejection) expect(result.state).toBe(state);
  }
});

it('CONTRACT-ACTIONS v1.4 reduce rejects a tester label longer than 40 characters after trimming as invalidPayload', () => {
  const { content, state } = dogRoomDesign();
  const action: Action = { type: 'debugSetTesterLabel', text: `  ${'x'.repeat(41)}  ` };
  expect(reduce(content, state, action).events).toEqual([{ type: 'action.rejected', action, reason: 'invalidPayload' }]);
  const ok = reduce(content, state, { type: 'debugSetTesterLabel', text: `  ${'x'.repeat(40)}  ` });
  expect(ok.state.session.testerLabel).toBe('x'.repeat(40));
});

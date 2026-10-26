import { expect, it } from 'vitest';
import type { Action } from '../../src/sim/actions';
import { reduce } from '../../src/sim/reduce';
import { inputFrozen } from '../../src/sim/select';
import type { GameState } from '../../src/sim/state';
import { deepFreeze, squareFixture, tick } from './helpers';

const dialogue: GameState['dialogue']['current'] = {
  source: 'orientation', speaker: { game: true }, lines: ['Hello'], index: 0,
};
const celebration: NonNullable<GameState['celebration']> = {
  projectId: 'pet-house', fromPhase: 0, toPhase: 1, completes: false,
  unlockedTypeIds: [], step: 'cutscene', skipTaken: false,
};

it('VERIFY-MEC-001-010 mode rejects street, dialogue, and duplicate entry atomically', () => {
  const { content, state } = squareFixture();
  const action: Action = { type: 'setDesignMode', on: true };
  const street: GameState = { ...state, scene: { kind: 'street' } };
  const open: GameState = { ...state, dialogue: { current: dialogue, queue: [] } };
  for (const [candidate, reason] of [[street, 'notInterior'], [open, 'dialogueOpen']] as const) {
    const result = reduce(content, deepFreeze(candidate), action);
    expect(result.state).toBe(candidate);
    expect(result.events).toEqual([{ type: 'action.rejected', action, reason }]);
  }
  const entered = reduce(content, state, action);
  expect(entered.events).toEqual([{ type: 'mode.changed', mode: 'design' }]);
  expect(reduce(content, entered.state, action).events)
    .toEqual([{ type: 'action.rejected', action, reason: 'noChange' }]);
});

it('VERIFY-MEC-001-011 design freezes movement, the feed accrues in design mode, and play returns via mode.changed', () => {
  const { content, state } = squareFixture();
  const entered = reduce(content, state, { type: 'setDesignMode', on: true }).state;
  let advanced = entered;
  const fired: number[] = [];
  for (let index = 1; index <= 200; index++) {
    const result = reduce(content, deepFreeze(advanced), tick(1, 0, 100));
    if (result.events.some(event => event.type === 'roundup.fired')) fired.push(index);
    advanced = result.state;
  }
  expect(advanced.avatar).toEqual(entered.avatar);
  expect(fired).toEqual([200]);
  expect(inputFrozen(content, advanced)).toBe(true);
  const left = reduce(content, advanced, { type: 'setDesignMode', on: false });
  expect(left.events).toEqual([{ type: 'mode.changed', mode: 'play' }]);
  expect(inputFrozen(content, left.state)).toBe(false);
});

it.each(['dialogue', 'celebration', 'arrival', 'design'] as const)(
  'MEC-001 input frozen by %s still decrements immunity and clears pending facing', blocker => {
    const { content, state } = squareFixture();
    if (blocker === 'dialogue') state.dialogue.current = dialogue;
    if (blocker === 'celebration') state.celebration = celebration;
    if (blocker === 'arrival') state.arrival = { projectId: 'pet-house', petId: 'owl' };
    if (blocker === 'design') state.mode = 'design';
    state.avatar.immunityMs = 10;
    state.avatar.facingCandidate = { facing: 'left', heldMs: 30 };
    const result = reduce(content, state, tick(1));
    expect(inputFrozen(content, state)).toBe(true);
    expect(result.state.avatar).toEqual({ ...state.avatar, immunityMs: 0, facingCandidate: null });
  },
);

it('MEC-001 ordered mode preconditions include invalid payload first; leaving is allowed during a pending dialogue (play-session Q17)', () => {
  const { content, state } = squareFixture();
  state.mode = 'design'; state.dialogue.current = dialogue; state.celebration = celebration;
  const invalid = { type: 'setDesignMode', on: 'true' } as unknown as Action;
  expect(reduce(content, state, invalid).events)
    .toEqual([{ type: 'action.rejected', action: invalid, reason: 'invalidPayload' }]);
  const same = { type: 'setDesignMode', on: true } as const;
  expect(reduce(content, state, same).events)
    .toEqual([{ type: 'action.rejected', action: same, reason: 'noChange' }]);
  const leave = { type: 'setDesignMode', on: false } as const;
  // Play-session Q17 (2026-10-26): leaving Decorate stays allowed while a dialogue is pending; entering it is not.
  expect(reduce(content, state, leave).events).toEqual([{ type: 'mode.changed', mode: 'play' }]);
});

it('MEC-001 synthetic overlapping locks preserve celebration-before-arrival order and allow exit', () => {
  const { content, state } = squareFixture();
  const action = { type: 'setDesignMode', on: true } as const;
  state.celebration = celebration; state.arrival = { projectId: 'pet-house', petId: 'owl' };
  expect(reduce(content, state, action).events)
    .toEqual([{ type: 'action.rejected', action, reason: 'celebrationActive' }]);
  state.celebration = null;
  expect(reduce(content, state, action).events)
    .toEqual([{ type: 'action.rejected', action, reason: 'arrivalActive' }]);
  state.mode = 'design';
  expect(reduce(content, state, { type: 'setDesignMode', on: false }).state.mode).toBe('play');
});

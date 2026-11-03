import { expect, it } from 'vitest';
import type { Action } from '../../src/sim/actions';
import { reduce } from '../../src/sim/reduce';
import { buildScript, enqueueScript } from '../../src/sim/rules/dialogue';
import type { GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { advance, deepFreeze, designIn, eventsOf, giveCopies } from './helpers';

const content = validContent();
const tap = (petId: string): Action => ({ type: 'tapPet', petId });

/** Want 2 (bright-corner) active with light met; plant and the adjacency unmet. */
function brightCorner(): GameState {
  const state = designIn(content, ['soft-nap']);
  state.rooms['dog-room'].placements = { 'floor-1': 'lamp' };
  return state;
}

/** Want 3 (feels-like-home) active; `placements` decide which tags are met. */
function feelsLikeHome(placements: Record<string, string>): GameState {
  const state = designIn(content, ['soft-nap', 'bright-corner']);
  giveCopies(state, ['fern', 'ball']);
  state.rooms['dog-room'].placements = placements;
  return state;
}

it('VERIFY-MEC-008-008 want bubble: exactly one pet.wantBubble plant at 40,000 ms, the next at 80,000 ms', () => {
  let state = brightCorner();
  const times: number[] = [];
  for (let elapsed = 100; elapsed <= 80_000; elapsed += 100) {
    const result = reduce(content, state, { type: 'tick', dtMs: 100, move: { x: 0, y: 0 } });
    for (const event of eventsOf(result.events, 'pet.wantBubble')) {
      expect(event).toEqual({ type: 'pet.wantBubble', petId: 'dog', tag: 'plant' });
      times.push(elapsed);
    }
    state = result.state;
  }
  expect(times).toEqual([40_000, 80_000]);
});

it('VERIFY-MEC-008-008 the countdown holds while a dialogue is open', () => {
  const open = enqueueScript(brightCorner(), buildScript(content, 'intro', { petId: 'dog' })).state;
  const held = advance(reduce, content, deepFreeze(open), 60_000);
  expect(eventsOf(held.events, 'pet.wantBubble')).toEqual([]);
  expect(held.state.pets.dog.wantBubbleInMs).toBe(40_000);
});

it('VERIFY-MEC-008-008 the countdown resets on want.activated in a placement dispatch', () => {
  const state = designIn(content);
  state.pets.dog.wantBubbleInMs = 1_000;
  const result = reduce(content, state, { type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
  expect(eventsOf(result.events, 'want.activated')).toHaveLength(1);
  expect(result.state.pets.dog.wantBubbleInMs).toBe(40_000);
});

it('VERIFY-MEC-008-009 only the hidden tag unmet: pet.wantBubble tag null (Q12(a))', () => {
  const { events } = advance(reduce, content, feelsLikeHome({ 'floor-1': 'fern' }), 40_000);
  expect(eventsOf(events, 'pet.wantBubble')).toEqual([{ type: 'pet.wantBubble', petId: 'dog', tag: null }]);
});

it('VERIFY-MEC-008-010 (i) tapPet with an unmet tag: pet.tapped want plant, wantBubbleInMs reset, behaviour unchanged', () => {
  const state = brightCorner();
  state.pets.dog.wantBubbleInMs = 1_234;
  const result = reduce(content, deepFreeze(state), tap('dog'));
  expect(result.events).toEqual([{ type: 'pet.tapped', petId: 'dog', bubble: { kind: 'want', tag: 'plant' } }]);
  expect(result.state.pets.dog.wantBubbleInMs).toBe(40_000);
  expect(result.state.pets.dog.behaviour).toBe(state.pets.dog.behaviour);
});

it('VERIFY-MEC-008-010 (ii) tag conditions met, stars floor unmet: chatter from lines.chatter', () => {
  const state = feelsLikeHome({ 'floor-1': 'fern', 'floor-3': 'ball' });
  const result = reduce(content, deepFreeze(state), tap('dog'));
  const [tapped] = eventsOf(result.events, 'pet.tapped');
  expect(tapped.bubble.kind).toBe('chatter');
  expect(content.pets.dog.lines.chatter).toContain((tapped.bubble as { line: string }).line);
  expect(result.state.pets.dog.behaviour).toBe(state.pets.dog.behaviour);
  expect(result.state.pets.dog.rngState).not.toBe(state.pets.dog.rngState);
});

it('VERIFY-MEC-008-010 (iii)/(iv) and VERIFY-MEC-008-006 tapPet half: petNotHere, dialogueOpen, celebrationActive leave the state identical', () => {
  const state = brightCorner();
  const open = enqueueScript(state, buildScript(content, 'intro', { petId: 'dog' })).state;
  const celebrating: GameState = { ...state, celebration: { projectId: 'pet-house', fromPhase: 0, toPhase: 1, completes: false,
    unlockedTypeIds: [], step: 'cutscene', skipTaken: false } };
  for (const [input, petId, reason] of [[state, 'owl', 'petNotHere'], [open, 'dog', 'dialogueOpen'],
    [celebrating, 'dog', 'celebrationActive']] as [GameState, string, string][]) {
    const result = reduce(content, deepFreeze(input), tap(petId));
    expect(result.events).toEqual([{ type: 'action.rejected', action: tap(petId), reason }]);
    expect(result.state).toBe(input);
  }
});

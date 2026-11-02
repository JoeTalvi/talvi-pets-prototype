import { expect, it } from 'vitest';
import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { starsOf } from '../../src/sim/select';
import type { GameState } from '../../src/sim/state';
import { checkInvariants } from '../../src/sim/invariants';
import { dogRoomDesign, giveCopies } from './helpers';

const place = (slotId: string, typeId: string): Action => ({ type: 'placeCharm', slotId, typeId });
const remove = (slotId: string): Action => ({ type: 'removeCharm', slotId });

function apply(content: Content, state: GameState, action: Action): { state: GameState; events: SimEvent[] } {
  const result = reduce(content, state, action);
  expect(result.events.filter(event => event.type === 'action.rejected')).toEqual([]);
  let current = result.state;
  while (current.dialogue.current !== null) current = reduce(content, current, { type: 'advanceDialogue' }).state;
  expect(checkInvariants(content, current)).toEqual([]);
  return { state: current, events: result.events };
}

it('VERIFY-MEC-007-018 (new) strip record: Heart charm removed → charm.removed then charm.stripped, queued once; Hearts kept; re-place clears with no event', () => {
  const { content, state } = dogRoomDesign();
  const fulfilled = apply(content, state, place('large-1', 'dog-bed'));
  expect(fulfilled.events.some(event => event.type === 'want.fulfilled')).toBe(true);
  expect(fulfilled.state.pets.dog.heartCharms).toContain('dog-bed');
  const stars = starsOf(content, fulfilled.state, 'dog-room').points;
  const removed = apply(content, fulfilled.state, remove('large-1'));
  const kinds = removed.events.map(event => event.type);
  expect(kinds.indexOf('charm.stripped')).toBe(kinds.indexOf('charm.removed') + 1);
  expect(removed.events.find(event => event.type === 'charm.stripped'))
    .toEqual({ type: 'charm.stripped', roomId: 'dog-room', slotId: 'large-1', typeId: 'dog-bed', petId: 'dog' });
  expect(removed.state.pets.dog.strippedPending).toEqual(['dog-bed']);
  expect(removed.state.pets.dog.hearts).toBe(1);
  expect(removed.state.pets.dog.fulfilledWantIds).toEqual(fulfilled.state.pets.dog.fulfilledWantIds);
  expect(starsOf(content, removed.state, 'dog-room').points).toBeLessThan(stars);
  expect(removed.state.inventory.counts['dog-bed']).toBe(1);
  const back = apply(content, removed.state, place('large-1', 'dog-bed'));
  expect(back.events.some(event => event.type === 'charm.stripped')).toBe(false);
  expect(back.state.pets.dog.strippedPending).toEqual([]);
  expect(back.state.pets.dog.heartCharms).toContain('dog-bed');
});

it('MEC-007 strip record: a replace by a different type strips; a charm that earned no Heart never strips; a pending type is queued once', () => {
  const { content, state } = dogRoomDesign();
  giveCopies(state, ['dog-bed']);
  const fulfilled = apply(content, state, place('large-1', 'dog-bed')).state;
  const withLamp = apply(content, fulfilled, place('floor-1', 'lamp'));
  expect(withLamp.state.pets.dog.heartCharms).not.toContain('lamp');
  const lampOut = apply(content, withLamp.state, remove('floor-1'));
  expect(lampOut.events.some(event => event.type === 'charm.stripped')).toBe(false);
  giveCopies(lampOut.state, ['perch-branch']);
  const replaced = apply(content, lampOut.state, place('large-1', 'perch-branch'));
  const kinds = replaced.events.map(event => event.type);
  expect(kinds.indexOf('charm.stripped')).toBe(kinds.indexOf('charm.placed') + 1);
  expect(replaced.state.pets.dog.strippedPending).toEqual(['dog-bed']);
  expect(replaced.state.inventory.counts).toMatchObject({ 'dog-bed': 2, 'perch-branch': 0 });
  const again = apply(content, replaced.state, remove('large-1'));
  expect(again.state.pets.dog.strippedPending).toEqual(['dog-bed']);
});

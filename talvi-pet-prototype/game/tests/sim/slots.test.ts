import { expect, it } from 'vitest';
import type { Action } from '../../src/sim/actions';
import { reduce } from '../../src/sim/reduce';
import { placementAt, slotOf } from '../../src/sim/select';
import { deepFreeze, dogRoomDesign } from './helpers';

const place = (slotId: string, typeId: string): Action => ({ type: 'placeCharm', slotId, typeId });
const remove = (slotId: string): Action => ({ type: 'removeCharm', slotId });

function withLamp() {
  const { content, state } = dogRoomDesign();
  return { content, state: reduce(content, state, place('floor-1', 'lamp')).state };
}

function expectPure<T>(state: T, result: { state: T }) {
  expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
  expect(result.state).not.toBe(state);
}

const softNapUnmet = { type: 'want.progressed', petId: 'dog', wantId: 'soft-nap', conditions: [
  { kind: 'tag', met: false, hidden: false, tag: 'soft', availability: 'owned' },
  { kind: 'tag', met: false, hidden: false, tag: 'seat', availability: 'owned' },
] };

it('VERIFY-MEC-005-001 charm.placed, stars.changed, want.progressed', () => {
  const { content, state } = dogRoomDesign();
  const result = reduce(content, deepFreeze(state), place('floor-1', 'lamp'));
  expect(result.state.rooms['dog-room'].placements['floor-1']).toBe('lamp');
  expect(result.events).toEqual([
    { type: 'charm.placed', roomId: 'dog-room', slotId: 'floor-1', typeId: 'lamp', replacedTypeId: null },
    { type: 'stars.changed', roomId: 'dog-room', from: 0, to: 4, delta: 4, max: 48 },
    softNapUnmet,
  ]);
  expectPure(state, result);
});

it('VERIFY-MEC-005-002 notDesignMode precedes dialogueOpen and typeNotOwned', () => {
  const { content, state } = dogRoomDesign();
  const play = { ...state, mode: 'play' as const, dialogue: { current: { source: 'orientation' as const,
    speaker: { game: true as const }, lines: ['Hi'], index: 0 }, queue: [] } };
  const action = place('floor-1', 'fern');
  const result = reduce(content, deepFreeze(play), action);
  expect(result.events).toEqual([{ type: 'action.rejected', action, reason: 'notDesignMode' }]);
  expect(result.state).toBe(play);
});

it('VERIFY-MEC-005-003 sizeClassMismatch for dog-bed in floor-1', () => {
  const { content, state } = dogRoomDesign();
  const action = place('floor-1', 'dog-bed');
  const result = reduce(content, deepFreeze(state), action);
  expect(result.events).toEqual([{ type: 'action.rejected', action, reason: 'sizeClassMismatch' }]);
  expect(result.state).toBe(state);
});

it('VERIFY-MEC-005-004 unknownSlot for an owl-room-only id (in-test variant renames an owl slot; the fixture shares ids)', () => {
  const { content, state } = dogRoomDesign();
  content.rooms['owl-room'].slots[0].id = 'perch-1';
  const action = place('perch-1', 'lamp');
  expect(reduce(content, state, action).events).toEqual([{ type: 'action.rejected', action, reason: 'unknownSlot' }]);
  expect(slotOf(content, state, 'perch-1')).toBeNull();
  expect(slotOf(content, { ...state, scene: { kind: 'street' } }, 'floor-1')).toBeNull();
});

it('MEC-005 R5 order: dialogueOpen before unknownSlot, typeNotOwned before sizeClassMismatch', () => {
  const { content, state } = dogRoomDesign();
  const open = { ...state, dialogue: { current: { source: 'intro' as const, speaker: { game: true as const },
    lines: ['Hi'], index: 0 }, queue: [] } };
  expect(reduce(content, open, place('nope', 'lamp')).events[0]).toMatchObject({ reason: 'dialogueOpen' });
  expect(reduce(content, open, remove('nope')).events[0]).toMatchObject({ reason: 'dialogueOpen' });
  expect(reduce(content, state, place('large-1', 'bookshelf')).events[0]).toMatchObject({ reason: 'typeNotOwned' });
  expect(reduce(content, state, place('floor-1', 'unknown')).events[0]).toMatchObject({ reason: 'typeNotOwned' });
  expect(reduce(content, state, remove('nope')).events[0]).toMatchObject({ reason: 'unknownSlot' });
});

it('VERIFY-MEC-005-005 replace reports replacedTypeId and one net stars.changed (fern already in floor-2 so the net delta is non-zero on FX-CONTENT-MIN)', () => {
  const { content, state } = withLamp();
  state.inventory.ownedTypeIds.push('fern');
  const before = reduce(content, state, place('floor-2', 'fern')).state;
  const result = reduce(content, deepFreeze(before), place('floor-1', 'fern'));
  expect(result.state.rooms['dog-room'].placements['floor-1']).toBe('fern');
  expect(result.events).toEqual([
    { type: 'charm.placed', roomId: 'dog-room', slotId: 'floor-1', typeId: 'fern', replacedTypeId: 'lamp' },
    { type: 'stars.changed', roomId: 'dog-room', from: 8, to: 5, delta: -3, max: 48 },
    softNapUnmet,
  ]);
});

it('VERIFY-MEC-005-005 net delta: replacing a repeated copy with a new type', () => {
  const { content, state } = withLamp();
  const two = reduce(content, state, place('floor-2', 'lamp')).state;
  const result = reduce(content, two, place('floor-1', 'stool'));
  expect(result.events.filter(event => event.type === 'stars.changed'))
    .toEqual([{ type: 'stars.changed', roomId: 'dog-room', from: 5, to: 8, delta: 3, max: 48 }]);
});

it('VERIFY-MEC-005-006 same-type replace applied with no stars.changed and want.progressed present', () => {
  const { content, state } = withLamp();
  const result = reduce(content, deepFreeze(state), place('floor-1', 'lamp'));
  expect(result.events).toEqual([{ type: 'charm.placed', roomId: 'dog-room', slotId: 'floor-1',
    typeId: 'lamp', replacedTypeId: 'lamp' }, softNapUnmet]);
  expect(result.state).not.toBe(state);
});

it('VERIFY-MEC-005-007 partial: removing the used slot reports interruptedPetId dog (pet.verbEnded/pet.reacted land in WORK-003-3)', () => {
  const { content, state } = withLamp();
  state.pets.dog.behaviour = { ...state.pets.dog.behaviour, phase: 'using', target: { slotId: 'floor-1' } };
  const result = reduce(content, deepFreeze(state), remove('floor-1'));
  expect(result.events[0]).toEqual({ type: 'charm.removed', roomId: 'dog-room', slotId: 'floor-1',
    typeId: 'lamp', interruptedPetId: 'dog' });
  expect(result.events.slice(1)).toEqual([{ type: 'stars.changed', roomId: 'dog-room', from: 4, to: 0, delta: -4, max: 48 },
    softNapUnmet]);
  expect(placementAt(content, result.state, 'dog-room', 'floor-1')).toBeNull();
  expect(result.state.pets).toBe(state.pets);
});

it('VERIFY-MEC-005-008 partial: a pet walking to the slot is not interrupted (pet idle handling lands in WORK-003-3)', () => {
  const { content, state } = withLamp();
  state.pets.dog.behaviour = { ...state.pets.dog.behaviour, phase: 'walking', target: { slotId: 'floor-1' } };
  expect(reduce(content, state, remove('floor-1')).events[0]).toMatchObject({ type: 'charm.removed', interruptedPetId: null });
  state.pets.dog.behaviour = { ...state.pets.dog.behaviour, phase: 'using', target: { slotId: 'floor-2' } };
  expect(reduce(content, state, remove('floor-1')).events[0]).toMatchObject({ interruptedPetId: null });
});

it('VERIFY-MEC-005-009 slotEmpty', () => {
  const { content, state } = dogRoomDesign();
  const action = remove('floor-1');
  const result = reduce(content, deepFreeze(state), action);
  expect(result.events).toEqual([{ type: 'action.rejected', action, reason: 'slotEmpty' }]);
  expect(result.state).toBe(state);
});

it('VERIFY-MEC-004-001 copies are unlimited and removal never changes ownership', () => {
  const { content, state } = dogRoomDesign();
  const owned = [...state.inventory.ownedTypeIds];
  const first = reduce(content, state, place('floor-1', 'lamp'));
  const second = reduce(content, first.state, place('floor-2', 'lamp'));
  const removed = reduce(content, second.state, remove('floor-1'));
  for (const result of [first, second, removed])
    expect(result.events.some(event => event.type === 'action.rejected')).toBe(false);
  expect(second.state.rooms['dog-room'].placements).toEqual({ 'floor-1': 'lamp', 'floor-2': 'lamp' });
  expect(removed.state.inventory.ownedTypeIds).toEqual(owned);
});

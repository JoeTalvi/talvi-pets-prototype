import { expect, it } from 'vitest';
import type { Action } from '../../src/sim/actions';
import { reduce } from '../../src/sim/reduce';
import { placementAt, slotOf } from '../../src/sim/select';
import { deepFreeze, dogRoomDesign, eventsOf, giveCopies } from './helpers';

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
  giveCopies(state, ['fern'], 2); // DEC-043: two fern copies for two slots
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
  giveCopies(state, ['lamp']); // DEC-043: the repeat needs a second copy
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

it('VERIFY-MEC-005-007 removing the used slot reports interruptedPetId dog, then pet.verbEnded, pet.reacted {interrupted}, reacting', () => {
  const { content, state } = withLamp();
  state.pets.dog.behaviour = { ...state.pets.dog.behaviour, phase: 'using', target: { slotId: 'floor-1' }, verb: 'look-at' };
  const result = reduce(content, deepFreeze(state), remove('floor-1'));
  expect(result.events[0]).toEqual({ type: 'charm.removed', roomId: 'dog-room', slotId: 'floor-1',
    typeId: 'lamp', interruptedPetId: 'dog' });
  const reacting = { ...state.pets.dog.behaviour, phase: 'reacting', timerMs: 2000, target: { slotId: 'floor-1' },
    verb: null, reaction: 'interrupted' };
  expect(result.events.slice(1)).toEqual([{ type: 'stars.changed', roomId: 'dog-room', from: 4, to: 0, delta: -4, max: 48 },
    softNapUnmet,
    { type: 'pet.verbEnded', petId: 'dog', verb: 'look-at', slotId: 'floor-1' },
    { type: 'pet.reacted', petId: 'dog', reaction: 'interrupted', slotId: 'floor-1', typeId: 'lamp', line: null, walkOver: false },
    { type: 'pet.phaseChanged', petId: 'dog', from: 'using', to: 'reacting', target: { slotId: 'floor-1' }, verb: null, reaction: 'interrupted' }]);
  expect(placementAt(content, result.state, 'dog-room', 'floor-1')).toBeNull();
  expect(result.state.pets.dog.behaviour).toEqual(reacting);
});

it('VERIFY-MEC-005-008 a pet walking to the slot is not interrupted: interruptedPetId null, pet.phaseChanged to idle, no pet.reacted', () => {
  const { content, state } = withLamp();
  state.pets.dog.behaviour = { ...state.pets.dog.behaviour, phase: 'walking', target: { slotId: 'floor-1' } };
  const walking = reduce(content, deepFreeze(structuredClone(state)), remove('floor-1'));
  expect(walking.events[0]).toMatchObject({ type: 'charm.removed', interruptedPetId: null });
  expect(walking.events.filter(event => event.type === 'pet.reacted')).toEqual([]);
  expect(walking.events.at(-1)).toMatchObject({ type: 'pet.phaseChanged', from: 'walking', to: 'idle', target: null });
  expect(walking.state.pets.dog.behaviour.phase).toBe('idle');
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

it('VERIFY-MEC-004-001 (rewritten, DEC-043) the same type in two slots needs two copies; copies in hand + placed = granted', () => {
  const { content, state } = dogRoomDesign();
  const first = reduce(content, state, place('floor-1', 'lamp'));
  const second = reduce(content, first.state, place('floor-2', 'lamp'));
  expect(second.events).toEqual([{ type: 'action.rejected', action: place('floor-2', 'lamp'), reason: 'noCopiesLeft' }]);
  const granted = reduce(content, first.state, { type: 'debugGrantCopies', typeId: 'lamp', count: 1 });
  const both = reduce(content, granted.state, place('floor-2', 'lamp'));
  expect(both.events.some(event => event.type === 'action.rejected')).toBe(false);
  expect(both.state.rooms['dog-room'].placements).toEqual({ 'floor-1': 'lamp', 'floor-2': 'lamp' });
  expect(both.state.inventory.counts.lamp).toBe(0);
  const removed = reduce(content, both.state, remove('floor-1'));
  expect(removed.state.inventory.counts.lamp).toBe(1);
});

it('VERIFY-MEC-005-017/018 (new) place spends a copy; a zero-count place is rejected noCopiesLeft with state identical', () => {
  const { content, state } = dogRoomDesign();
  expect(state.inventory.counts.lamp).toBe(1);
  const first = reduce(content, deepFreeze(state), place('floor-1', 'lamp'));
  expect(eventsOf(first.events, 'action.rejected')).toEqual([]);
  expect(first.state.inventory.counts.lamp).toBe(0);
  const before = structuredClone(first.state);
  const second = reduce(content, deepFreeze(first.state), place('floor-2', 'lamp'));
  expect(second.events).toEqual([{ type: 'action.rejected', action: place('floor-2', 'lamp'), reason: 'noCopiesLeft' }]);
  expect(second.state).toBe(first.state);
  expect(second.state).toEqual(before);
});

it('VERIFY-MEC-005-019/020 (new) remove returns the copy; a replace swaps counts; a same-type replace at count 0 applies with no count change', () => {
  const { content, state } = dogRoomDesign();
  giveCopies(state, ['fern']);
  const placed = reduce(content, state, place('floor-1', 'lamp')).state;
  const removed = reduce(content, placed, remove('floor-1'));
  expect(removed.state.inventory.counts.lamp).toBe(1);
  const replaced = reduce(content, placed, place('floor-1', 'fern'));
  expect(eventsOf(replaced.events, 'charm.placed')).toEqual([{ type: 'charm.placed', roomId: 'dog-room', slotId: 'floor-1', typeId: 'fern', replacedTypeId: 'lamp' }]);
  expect(replaced.state.inventory.counts).toMatchObject({ fern: 0, lamp: 1 });
  expect(placed.inventory.counts.lamp).toBe(0);
  const same = reduce(content, placed, place('floor-1', 'lamp'));
  expect(eventsOf(same.events, 'action.rejected')).toEqual([]);
  expect(eventsOf(same.events, 'stars.changed')).toEqual([]);
  expect(same.state.inventory.counts).toEqual(placed.inventory.counts);
});

it('MEC-005 rejection order: typeNotOwned (no counts key) before sizeClassMismatch before noCopiesLeft', () => {
  const { content, state } = dogRoomDesign();
  expect(reduce(content, state, place('floor-1', 'fern')).events[0]).toMatchObject({ reason: 'typeNotOwned' });
  state.inventory.counts['dog-bed'] = 0;
  expect(reduce(content, state, place('floor-1', 'dog-bed')).events[0]).toMatchObject({ reason: 'sizeClassMismatch' });
  expect(reduce(content, state, place('large-1', 'dog-bed')).events[0]).toMatchObject({ reason: 'noCopiesLeft' });
});

it('VERIFY-MEC-005-010 home-only: fern in dog-room emits no want.* for the Owl', () => {
  const { content, state } = dogRoomDesign();
  giveCopies(state, ['fern']);
  state.pets.owl.introduced = true;
  const result = reduce(content, deepFreeze(state), place('floor-1', 'fern'));
  const wantEvents = result.events.filter(event => event.type.startsWith('want'));
  expect(wantEvents.length).toBeGreaterThan(0);
  expect(wantEvents.every(event => 'petId' in event && event.petId === 'dog')).toBe(true);
});

import { describe, expect, it } from 'vitest';
import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { ContentError } from '../../src/content/load';
import { afterRoomChange } from '../../src/sim/rules/stars';
import { starsOf } from '../../src/sim/select';
import { mulberry32 } from '../../src/sim/rng';
import { initialState, type GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { deepFreeze, dogRoomDesign, giveCopies, allCopies } from './helpers';

// Synthetic before/after placement snapshots: the full placement dispatch is not implemented here.
function withPlacements(state: GameState, placements: Record<string, string>): GameState {
  return { ...state, rooms: { ...state.rooms, 'dog-room': { placements } } };
}

it('VERIFY-MEC-006-001: empty room has zero points and a 48-point maximum', () => {
  const content = deepFreeze(validContent()), state = deepFreeze(initialState(content, 1));
  expect(starsOf(content, state, 'dog-room')).toEqual({ points: 0, max: 48 });
});

it('VERIFY-MEC-006-002/003/004 isolated: first copy, repeat and removal give exact net deltas', () => {
  const content = deepFreeze(validContent()), initial = deepFreeze(initialState(content, 1));
  const bed = deepFreeze(withPlacements(initial, { 'large-1': 'dog-bed' }));
  expect(afterRoomChange(content, initial, bed, 'dog-room')).toEqual([
    { type: 'stars.changed', roomId: 'dog-room', from: 0, to: 4, delta: 4, max: 48 },
  ]);
  const three = withPlacements(bed, { ...bed.rooms['dog-room'].placements, 'floor-1': 'lamp', 'wall-1': 'painting' });
  const repeated = deepFreeze(withPlacements(three, { ...three.rooms['dog-room'].placements, 'floor-2': 'lamp' }));
  expect(starsOf(content, three, 'dog-room').points).toBe(12);
  expect(afterRoomChange(content, three, repeated, 'dog-room')).toEqual([
    { type: 'stars.changed', roomId: 'dog-room', from: 12, to: 13, delta: 1, max: 48 },
  ]);
  const removed = deepFreeze(withPlacements(repeated, { 'floor-1': 'lamp', 'floor-2': 'lamp', 'wall-1': 'painting' }));
  expect(afterRoomChange(content, repeated, removed, 'dog-room')).toEqual([
    { type: 'stars.changed', roomId: 'dog-room', from: 13, to: 9, delta: -4, max: 48 },
  ]);
  expect(removed.pets).toBe(initial.pets);
});

it('VERIFY-MEC-006-005/006 isolated: replacement emits one net event, equal scores emit none', () => {
  const content = validContent(), initial = initialState(content, 1);
  const before = deepFreeze(withPlacements(initial, { 'floor-1': 'lamp', 'floor-2': 'fern' }));
  const after = deepFreeze(withPlacements(before, { 'floor-1': 'fern', 'floor-2': 'fern' }));
  expect(afterRoomChange(content, before, after, 'dog-room')).toEqual([
    { type: 'stars.changed', roomId: 'dog-room', from: 8, to: 5, delta: -3, max: 48 },
  ]);
  expect(afterRoomChange(content, before, structuredClone(before), 'dog-room')).toEqual([]);
  const differentType = withPlacements(before, { 'floor-1': 'stool', 'floor-2': 'fern' });
  expect(afterRoomChange(content, before, differentType, 'dog-room')).toEqual([]);
});

it('VERIFY-MEC-006-007: twelve compatible distinct types reach the maximum', () => {
  const content = validContent();
  const wall = content.charms.types.find(type => type.id === 'painting')!;
  content.charms.types.push({ ...wall, id: 'wall-fixture-a' }, { ...wall, id: 'wall-fixture-b' });
  const state = initialState(content, 1);
  state.inventory.counts = allCopies(content);
  const used = new Set<string>();
  for (const slot of content.rooms['dog-room'].slots) {
    const type = content.charms.types.find(type => type.sizeClass === slot.sizeClass && !used.has(type.id))!;
    used.add(type.id);
    state.rooms['dog-room'].placements[slot.id] = type.id;
  }
  expect(used.size).toBe(12);
  expect(starsOf(content, state, 'dog-room')).toEqual({ points: 48, max: 48 });
});

it('VERIFY-MEC-006-010/013: scores ignore pet tags, visibility and other rooms', () => {
  const content = validContent(), initial = initialState(content, 1);
  const state = deepFreeze(withPlacements(initial, { 'floor-1': 'tall-lamp' }));
  expect(starsOf(content, state, 'dog-room')).toEqual({ points: 4, max: 48 });
  expect(starsOf(content, state, 'owl-room')).toEqual({ points: 0, max: 48 });
  content.pets.dog.dislikes = ['light'];
  content.charms.types.find(type => type.id === 'tall-lamp')!.tags = ['toy'];
  const hidden = { ...state, session: { ...state.session, starsVisible: false } };
  expect(starsOf(content, hidden, 'dog-room')).toEqual({ points: 4, max: 48 });
  expect(afterRoomChange(content, initial, hidden, 'dog-room')).toEqual([
    { type: 'stars.changed', roomId: 'dog-room', from: 0, to: 4, delta: 4, max: 48 },
  ]);
});

it('MEC-006 selector errors identify unknown rooms and charm references', () => {
  const content = validContent(), state = initialState(content, 1);
  expect(() => starsOf(content, state, 'unknown')).toThrow(ContentError);
  expect(() => starsOf(content, state, 'unknown')).toThrow('Unknown room id "unknown"');
  state.rooms['dog-room'].placements['floor-1'] = 'unknown';
  expect(() => starsOf(content, state, 'dog-room')).toThrow('Unknown charm type id "unknown"');
});

it.each([1, 2, 3])('VERIFY-MEC-006-008 isolated property: 500 valid snapshot edits, seed %i', seed => {
  const content = validContent();
  let state = initialState(content, seed);
  state.inventory.counts = allCopies(content);
  const slots = content.rooms['dog-room'].slots;
  for (let step = 0; step < 500; step++) {
    const draw = mulberry32(seed); seed = draw.seed;
    const slot = slots[Math.floor(draw.value * slots.length)];
    const choices = content.charms.types.filter(type => type.sizeClass === slot.sizeClass);
    const choice = mulberry32(seed); seed = choice.seed;
    const placements = { ...state.rooms['dog-room'].placements };
    if (choice.value < 0.25) delete placements[slot.id];
    else placements[slot.id] = choices[Math.floor(choice.value * choices.length)].id;
    const next = deepFreeze(withPlacements(state, placements));
    const values = Object.values(placements), unique = new Set(values).size;
    for (const [first, repeat] of [[4, 1], [1, 0], [4, 4], [7, 2]]) {
      content.tuning.starsFirstCopy = first; content.tuning.starsRepeat = repeat;
      const expected = values.length * repeat + unique * (first - repeat);
      expect(starsOf(content, next, 'dog-room')).toEqual({ points: expected, max: first * slots.length });
      expect(expected).toBeGreaterThanOrEqual(0);
      expect(expected).toBeLessThanOrEqual(first * slots.length);
      const previous = Object.values(state.rooms['dog-room'].placements);
      const from = previous.length * repeat + new Set(previous).size * (first - repeat);
      expect(afterRoomChange(content, state, next, 'dog-room')).toEqual(expected === from ? [] : [
        { type: 'stars.changed', roomId: 'dog-room', from, to: expected, delta: expected - from, max: first * slots.length },
      ]);
    }
    expect(next.inventory).toBe(state.inventory);
    expect(next.pets).toBe(state.pets);
    expect(JSON.parse(JSON.stringify(next))).toEqual(next);
    state = next;
  }
});

/** The Dog stays un-introduced so MEC-009 never evaluates and its vignette cannot freeze placements. */
function scoringRoom() {
  const room = dogRoomDesign();
  room.state.pets.dog.introduced = false;
  return room;
}

describe('MEC-006 through the placeCharm/removeCharm dispatch', () => {
  const place = (slotId: string, typeId: string): Action => ({ type: 'placeCharm', slotId, typeId });
  const starsEvents = (events: SimEvent[]) => events.filter(event => event.type === 'stars.changed');
  function dispatch(content: Content, state: GameState, actions: Action[]): GameState {
    return actions.reduce((current, action) => reduce(content, current, action).state, state);
  }

  it('VERIFY-MEC-006-002 via reduce: first copy 0 → 4', () => {
    const { content, state } = scoringRoom();
    expect(starsEvents(reduce(content, deepFreeze(state), place('large-1', 'dog-bed')).events))
      .toEqual([{ type: 'stars.changed', roomId: 'dog-room', from: 0, to: 4, delta: 4, max: 48 }]);
  });

  it('VERIFY-MEC-006-003/004 via reduce: repeat 12 → 13, removal 13 → 9 leaves hearts and wants untouched', () => {
    const { content, state } = scoringRoom();
    const three = dispatch(content, state, [place('large-1', 'dog-bed'), place('floor-1', 'lamp'), place('wall-1', 'painting'),
      { type: 'debugGrantCopies', typeId: 'lamp', count: 1 }]); // DEC-043: a second Lamp comes from the TEST-002 arm
    const repeated = reduce(content, deepFreeze(three), place('floor-2', 'lamp'));
    expect(starsEvents(repeated.events)).toEqual([{ type: 'stars.changed', roomId: 'dog-room', from: 12, to: 13, delta: 1, max: 48 }]);
    const removed = reduce(content, repeated.state, { type: 'removeCharm', slotId: 'large-1' });
    expect(starsEvents(removed.events)).toEqual([{ type: 'stars.changed', roomId: 'dog-room', from: 13, to: 9, delta: -4, max: 48 }]);
    expect(Object.values(removed.state.pets).map(pet => pet.fulfilledWantIds)).toEqual(Object.values(repeated.state.pets).map(pet => pet.fulfilledWantIds));
  });

  it('VERIFY-MEC-006-005/006 via reduce: one net replacement event; an equal score emits none', () => {
    const { content, state } = scoringRoom();
    giveCopies(state, ['fern'], 2); // DEC-043: the replace places a second fern
    const before = dispatch(content, state, [place('floor-1', 'lamp'), place('floor-2', 'fern')]);
    expect(starsEvents(reduce(content, deepFreeze(before), place('floor-1', 'fern')).events))
      .toEqual([{ type: 'stars.changed', roomId: 'dog-room', from: 8, to: 5, delta: -3, max: 48 }]);
    expect(starsEvents(reduce(content, before, place('floor-1', 'stool')).events)).toEqual([]);
  });

  it('VERIFY-MEC-006-007 via reduce: twelve compatible distinct types reach 48 (two wall types added in-test)', () => {
    const { content, state } = scoringRoom();
    const wall = content.charms.types.find(type => type.id === 'painting')!;
    content.charms.types.push({ ...wall, id: 'wall-fixture-a' }, { ...wall, id: 'wall-fixture-b' });
    state.inventory.counts = allCopies(content);
    const used = new Set<string>();
    const actions = content.rooms['dog-room'].slots.map(slot => {
      const type = content.charms.types.find(type => type.sizeClass === slot.sizeClass && !used.has(type.id))!;
      used.add(type.id);
      return place(slot.id, type.id);
    });
    expect(starsOf(content, dispatch(content, state, actions), 'dog-room')).toEqual({ points: 48, max: 48 });
  });

  it('VERIFY-MEC-006-010/013 via reduce: a disliked tall charm scores like any type; owl-room unchanged', () => {
    const { content, state } = scoringRoom();
    giveCopies(state, ['tall-lamp']);
    const owlBefore = starsOf(content, state, 'owl-room');
    const result = reduce(content, state, place('floor-1', 'tall-lamp'));
    expect(starsEvents(result.events)).toEqual([{ type: 'stars.changed', roomId: 'dog-room', from: 0, to: 4, delta: 4, max: 48 }]);
    expect(starsOf(content, result.state, 'owl-room')).toEqual(owlBefore);
  });
});

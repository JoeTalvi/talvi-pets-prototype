import { expect, it } from 'vitest';
import { grantItems } from '../../src/sim/rules/inventory';
import { reduce } from '../../src/sim/reduce';
import { chooserTypes, copiesOf, ownsTag } from '../../src/sim/select';
import { initialState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { deepFreeze, dogRoomDesign, realContent } from './helpers';

const item = (typeId: string, count = 1) => ({ typeId, count });

it('VERIFY-MEC-004-012 (new) initial counts = the starter set × its counts, in starterSet order (FX-REAL)', () => {
  const content = realContent(), state = initialState(content, 1);
  expect(state.inventory.counts).toEqual(Object.fromEntries(content.charms.starterSet.map(entry => [entry.typeId, entry.count])));
  expect(Object.keys(state.inventory.counts)).toEqual(content.charms.starterSet.map(entry => entry.typeId));
  expect(Object.values(state.inventory.counts).every(count => count === 1)).toBe(true);
});

it('VERIFY-MEC-004-013 (new; rewrites 002/003) grants add copies in first-grant order, one items.granted per item', () => {
  const content = deepFreeze(validContent()), before = deepFreeze(initialState(content, 1));
  const { state, events } = grantItems(content, before, [item('lamp'), item('fern')], 'heart');
  expect(state.inventory.counts.lamp).toBe(2);
  expect(Object.keys(state.inventory.counts)).toEqual([...Object.keys(before.inventory.counts), 'fern']);
  expect(state.inventory.counts.fern).toBe(1);
  expect(events).toEqual([{ type: 'items.granted', typeId: 'lamp', count: 1, source: 'heart' },
    { type: 'items.granted', typeId: 'fern', count: 1, source: 'heart' }]);
  expect(state.rooms).toBe(before.rooms);
  expect(before.inventory.counts.lamp).toBe(1);
  const empty = grantItems(content, before, [], 'heart');
  expect(empty.state).toBe(before);
  expect(empty.events).toEqual([]);
});

it('VERIFY-MEC-004-004: chooser keeps first-grant order, exact size class and lists zero-count types', () => {
  const content = deepFreeze(validContent()), state = initialState(content, 1);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.inventory.counts = { painting: 1, fern: 1, 'dog-bed': 1, lamp: 0, 'tall-lamp': 1 };
  state.rooms['dog-room'].placements = { 'floor-1': 'lamp' };
  deepFreeze(state);
  expect(chooserTypes(content, state, 'floor-1').map(type => type.id)).toEqual(['fern', 'lamp', 'tall-lamp']);
  expect(chooserTypes(content, state, 'large-1').map(type => type.id)).toEqual(['dog-bed']);
  expect(chooserTypes(content, state, 'wall-1').map(type => type.id)).toEqual(['painting']);
  expect(copiesOf(content, state, 'lamp')).toBe(0);
  expect(copiesOf(content, state, 'fern')).toBe(1);
  expect(copiesOf(content, state, 'ball')).toBe(0);
  expect(copiesOf(content, state, 'nope')).toBe(0);
});

it('VERIFY-MEC-004-005: street, absent and other-room-only slots return an empty chooser', () => {
  const content = validContent(), state = initialState(content, 1);
  content.rooms['owl-room'].slots[0].id = 'owl-only';
  expect(chooserTypes(content, state, 'floor-1')).toEqual([]);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  expect(chooserTypes(content, state, 'unknown')).toEqual([]);
  expect(chooserTypes(content, state, 'owl-only')).toEqual([]);
});

it('MEC-004 R8/ownsTag: empty inventory, and a granted type counts whether in hand or placed', () => {
  const content = validContent(), state = initialState(content, 1);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.inventory.counts = {};
  expect(chooserTypes(content, state, 'wall-1')).toEqual([]);
  expect(ownsTag(content, state, 'soft')).toBe(false);
  const next = grantItems(content, state, [item('dog-bed')], 'phase').state;
  expect(ownsTag(content, next, 'soft')).toBe(true);
  expect(ownsTag(content, next, 'plant')).toBe(false);
  expect(ownsTag(content, next, 'unknown')).toBe(false);
  const spent = { ...next, inventory: { counts: { 'dog-bed': 0 } } };
  expect(ownsTag(content, spent, 'seat')).toBe(true);
});

it('VERIFY-MEC-004-006 isolated grant: phase source grants every listed item, owned or not', () => {
  const content = validContent(), state = initialState(content, 1);
  const result = grantItems(content, state, [item('lamp'), item('fern')], 'phase');
  expect(result.events).toEqual([
    { type: 'items.granted', typeId: 'lamp', count: 1, source: 'phase' },
    { type: 'items.granted', typeId: 'fern', count: 1, source: 'phase' },
  ]);
  expect(result.state.inventory.counts.lamp).toBe(2);
});

it('VERIFY-MEC-004-014 (new) other room sees the spend: the only fern placed in dog-room is listed at 0 for an Owl slot', () => {
  const { content, state } = dogRoomDesign();
  state.inventory.counts.fern = 1;
  const placed = reduce(content, state, { type: 'placeCharm', slotId: 'floor-1', typeId: 'fern' });
  expect(placed.events.some(event => event.type === 'action.rejected')).toBe(false);
  const inOwl = { ...placed.state, scene: { kind: 'interior' as const, roomId: 'owl-room' } };
  const ids = chooserTypes(content, inOwl, 'floor-1').map(type => type.id);
  expect(ids).toContain('fern');
  expect(ids.indexOf('fern')).toBe(Object.keys(inOwl.inventory.counts).filter(id =>
    content.charms.types.find(type => type.id === id)!.sizeClass === 'small').indexOf('fern'));
  expect(copiesOf(content, inOwl, 'fern')).toBe(0);
});

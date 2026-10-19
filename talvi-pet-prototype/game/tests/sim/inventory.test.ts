import { expect, it } from 'vitest';
import { grantTypes } from '../../src/sim/rules/inventory';
import { chooserTypes, ownsTag } from '../../src/sim/select';
import { initialState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { deepFreeze } from './helpers';

it('VERIFY-MEC-004-002: grants new types once in request order without mutating inputs', () => {
  const content = deepFreeze(validContent()), before = deepFreeze(initialState(content, 1));
  const ids = deepFreeze(['lamp', 'fern', 'ball', 'fern', 'lamp']);
  const { state, events } = grantTypes(content, before, ids, 'heart');
  expect(state.inventory.ownedTypeIds).toEqual([...before.inventory.ownedTypeIds, 'fern', 'ball']);
  expect(events).toEqual([{ type: 'types.unlocked', typeIds: ['fern', 'ball'], source: 'heart' }]);
  expect(state.rooms).toBe(before.rooms);
  expect(state.pets).toBe(before.pets);
  expect(before.inventory.ownedTypeIds).toEqual(content.charms.starterSet);
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
});

it.each([{ ids: [] }, { ids: ['lamp', 'lamp'] }])('VERIFY-MEC-004-003: grant $ids emits once with identical state', ({ ids }) => {
  const content = validContent(), before = deepFreeze(initialState(content, 1));
  const result = grantTypes(content, before, ids, 'heart');
  expect(result.state).toBe(before);
  expect(result.events).toEqual([{ type: 'types.unlocked', typeIds: [], source: 'heart' }]);
});

it('VERIFY-MEC-004-004: chooser preserves unlock order, current placement and exact size class', () => {
  const content = deepFreeze(validContent()), state = initialState(content, 1);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.inventory.ownedTypeIds = ['painting', 'fern', 'dog-bed', 'lamp', 'tall-lamp'];
  state.rooms['dog-room'].placements = { 'floor-1': 'lamp', 'floor-2': 'lamp' };
  deepFreeze(state);
  expect(chooserTypes(content, state, 'floor-1').map(type => type.id)).toEqual(['fern', 'lamp', 'tall-lamp']);
  expect(chooserTypes(content, state, 'large-1').map(type => type.id)).toEqual(['dog-bed']);
  expect(chooserTypes(content, state, 'wall-1').map(type => type.id)).toEqual(['painting']);
  expect(state.inventory.ownedTypeIds).toEqual(['painting', 'fern', 'dog-bed', 'lamp', 'tall-lamp']);
});

it('VERIFY-MEC-004-005: street, absent and other-room-only slots return an empty chooser', () => {
  const content = validContent(), state = initialState(content, 1);
  content.rooms['owl-room'].slots[0].id = 'owl-only';
  expect(chooserTypes(content, state, 'floor-1')).toEqual([]);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  expect(chooserTypes(content, state, 'unknown')).toEqual([]);
  expect(chooserTypes(content, state, 'owl-only')).toEqual([]);
});

it('MEC-004 R8/ownsTag: empty inventory and ownership without placement', () => {
  const content = validContent(), state = initialState(content, 1);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.inventory.ownedTypeIds = [];
  expect(chooserTypes(content, state, 'wall-1')).toEqual([]);
  expect(ownsTag(content, state, 'soft')).toBe(false);
  const next = grantTypes(content, state, ['dog-bed'], 'phase').state;
  expect(ownsTag(content, next, 'soft')).toBe(true);
  expect(ownsTag(content, next, 'seat')).toBe(true);
  expect(ownsTag(content, next, 'plant')).toBe(false);
  expect(ownsTag(content, next, 'unknown')).toBe(false);
  expect(next.rooms).toBe(state.rooms);
});

it('VERIFY-MEC-004-006 isolated grant: phase source preserves only newly owned ids', () => {
  const content = validContent(), state = initialState(content, 1);
  expect(grantTypes(content, state, ['lamp', 'fern'], 'phase').events).toEqual([
    { type: 'types.unlocked', typeIds: ['fern'], source: 'phase' },
  ]);
});

it('VERIFY-MEC-004-007 isolated grant: debug catalogue order, then empty repeated grant', () => {
  const content = validContent(), state = initialState(content, 1);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  const ids = content.charms.types.map(type => type.id);
  const added = ids.filter(id => !state.inventory.ownedTypeIds.includes(id));
  const first = grantTypes(content, state, ids, 'debug');
  expect(first.state.inventory.ownedTypeIds).toEqual([...content.charms.starterSet, ...added]);
  expect(first.events).toEqual([{ type: 'types.unlocked', typeIds: added, source: 'debug' }]);
  const second = grantTypes(content, first.state, ids, 'debug');
  expect(second.state).toBe(first.state);
  expect(second.events).toEqual([{ type: 'types.unlocked', typeIds: [], source: 'debug' }]);
  expect(chooserTypes(content, second.state, 'floor-1').map(type => type.id)).toEqual([
    'lamp', 'stool', 'vase', 'fern', 'ball', 'lamp-planter', 'tall-lamp', 'rug', 'cushion', 'bowl', 'toy-mouse',
  ]);
});

import { expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import { reduce } from '../../src/sim/reduce';
import type { GameState } from '../../src/sim/state';
import { files, manifest, patchFiles, validContent } from '../content/helpers';
import { deepFreeze, designIn, dogLikesLight, eventsOf } from './helpers';

const place = (slotId: string, typeId: string): Action => ({ type: 'placeCharm', slotId, typeId });

function placed(content: Content, state: GameState, slotId: string, typeId: string) {
  if (!state.inventory.ownedTypeIds.includes(typeId)) state.inventory.ownedTypeIds.push(typeId);
  const result = reduce(content, deepFreeze(state), place(slotId, typeId));
  expect(eventsOf(result.events, 'action.rejected')).toEqual([]);
  expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
  return result;
}

it('VERIFY-MEC-007-005 ladder (fork-1 variant: lamp liked): dog-bed love / lamp like / perch-branch dislike with a lines.dislike entry / fern none', () => {
  const content = dogLikesLight();
  const reacted = (slotId: string, typeId: string) =>
    eventsOf(placed(content, designIn(content, ['soft-nap']), slotId, typeId).events, 'pet.reacted');
  expect(reacted('large-1', 'dog-bed')).toEqual([{ type: 'pet.reacted', petId: 'dog', reaction: 'love', slotId: 'large-1', typeId: 'dog-bed', line: null, walkOver: true }]);
  expect(reacted('floor-1', 'lamp')).toEqual([{ type: 'pet.reacted', petId: 'dog', reaction: 'like', slotId: 'floor-1', typeId: 'lamp', line: null, walkOver: true }]);
  const [dislike] = reacted('large-1', 'perch-branch');
  expect(dislike).toMatchObject({ reaction: 'dislike', slotId: 'large-1', typeId: 'perch-branch', walkOver: false });
  expect(content.pets.dog.lines.dislike).toContain(dislike.line);
  expect(reacted('floor-1', 'fern')).toEqual([]);
});

it('VERIFY-MEC-007-005 dislike sets reacting only from idle; while walking the machine is untouched (bubble only)', () => {
  const content = validContent();
  const idle = placed(content, designIn(content, ['soft-nap']), 'large-1', 'perch-branch');
  expect(idle.state.pets.dog.behaviour).toMatchObject({ phase: 'reacting', timerMs: 2000, target: { slotId: 'large-1' }, reaction: 'dislike' });
  const walking = designIn(content, ['soft-nap']);
  walking.pets.dog.behaviour = { ...walking.pets.dog.behaviour, phase: 'walking', timerMs: 0, target: { wanderPointId: 'w1' } };
  const result = placed(content, walking, 'large-1', 'perch-branch');
  expect(result.state.pets.dog.behaviour).toEqual(walking.pets.dog.behaviour);
  expect(eventsOf(result.events, 'pet.phaseChanged')).toEqual([]);
});

/** In-test variant: rug retagged soft+tall (no fixture charm carries both). */
function priorityContent(): Content {
  const dog = validContent().pets.dog;
  return loadContent(manifest, patchFiles(files(), [
    { file: 'pets/dog.json', path: '/likes', value: [...dog.likes, { tag: 'light', weight: 1 }] },
    { file: 'charms.json', path: '/types/8/tags', value: ['soft', 'tall'] },
  ]));
}

it('VERIFY-MEC-007-006 love > dislike > like (in-test variant: rug soft+tall; tall-lamp light+tall with light liked): love then dislike', () => {
  const content = priorityContent();
  expect(content.charms.types[8]).toMatchObject({ id: 'rug', tags: ['soft', 'tall'] });
  const first = placed(content, designIn(content, ['soft-nap']), 'floor-1', 'rug');
  const second = placed(content, designIn(content, ['soft-nap']), 'floor-2', 'tall-lamp');
  expect([...eventsOf(first.events, 'pet.reacted'), ...eventsOf(second.events, 'pet.reacted')].map(event => event.reaction))
    .toEqual(['love', 'dislike']);
});

it('VERIFY-MEC-007-007 hidden-slot ❤️: want feels-like-home (hidden toy) active, ball (toy, weight 2, not top) → love, walkOver true', () => {
  const content = validContent();
  const result = placed(content, designIn(content, ['soft-nap', 'bright-corner']), 'floor-4', 'ball');
  expect(eventsOf(result.events, 'pet.reacted')).toEqual([{ type: 'pet.reacted', petId: 'dog', reaction: 'love', slotId: 'floor-4', typeId: 'ball', line: null, walkOver: true }]);
  expect(result.state.pets.dog.behaviour).toMatchObject({ phase: 'walking', target: { slotId: 'floor-4' }, verb: null, reaction: 'love' });
});

it('VERIFY-MEC-007-012 fulfilment walk: exactly one pet.reacted love at focusSlotId, after want.fulfilled and want.activated, before pet.phaseChanged walking', () => {
  const content = validContent();
  const result = placed(content, designIn(content), 'large-1', 'dog-bed');
  const kinds = result.events.map(event => event.type);
  expect(eventsOf(result.events, 'pet.reacted')).toEqual([{ type: 'pet.reacted', petId: 'dog', reaction: 'love', slotId: 'large-1', typeId: 'dog-bed', line: null, walkOver: true }]);
  expect(eventsOf(result.events, 'want.fulfilled')[0].focusSlotId).toBe('large-1');
  expect(kinds.indexOf('want.fulfilled')).toBeLessThan(kinds.indexOf('pet.reacted'));
  expect(kinds.indexOf('want.activated')).toBeLessThan(kinds.indexOf('pet.reacted'));
  expect(kinds.indexOf('pet.reacted')).toBeLessThan(kinds.indexOf('pet.phaseChanged'));
  expect(eventsOf(result.events, 'pet.phaseChanged')).toEqual([{ type: 'pet.phaseChanged', petId: 'dog', from: 'idle', to: 'walking',
    target: { slotId: 'large-1' }, verb: 'nap', reaction: 'love' }]);
});

it('VERIFY-MEC-007-008 replace under a using pet: pet.verbEnded, no 🤔, then the new charm’s rule (none → idle)', () => {
  const content = validContent();
  const state = designIn(content, ['soft-nap']);
  state.inventory.ownedTypeIds.push('fern');
  state.rooms['dog-room'].placements = { 'floor-1': 'stool' };
  state.pets.dog.behaviour = { ...state.pets.dog.behaviour, phase: 'using', x: 200, y: 480, timerMs: 7000, target: { slotId: 'floor-1' }, verb: 'sit-on' };
  const result = placed(content, state, 'floor-1', 'fern');
  expect(result.events.filter(event => event.type.startsWith('pet.')).map(event => event.type)).toEqual(['pet.verbEnded', 'pet.phaseChanged']);
  expect(result.state.pets.dog.behaviour).toMatchObject({ phase: 'idle', target: null, verb: null });
});

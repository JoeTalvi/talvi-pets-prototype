import { expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import type { RuleResult, SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { buildScript, enqueueScript } from '../../src/sim/rules/dialogue';
import { fulfil, hiddenTagOfActiveWant } from '../../src/sim/rules/wants';
import { activeWant, missingWantTags, starsOf, tagAvailability, wantConditions } from '../../src/sim/select';
import type { GameState } from '../../src/sim/state';
import { files, manifest, patchFiles } from '../content/helpers';
import { deepFreeze, dogRoomDesign } from './helpers';

const place = (slotId: string, typeId: string): Action => ({ type: 'placeCharm', slotId, typeId });
const remove = (slotId: string): Action => ({ type: 'removeCharm', slotId });
const advanceAction: Action = { type: 'advanceDialogue' };
const types = (events: SimEvent[]) => events.map(event => event.type);
const wantEvents = (events: SimEvent[]) => events.filter(event => event.type.startsWith('want'));

function step(content: Content, state: GameState, action: Action): RuleResult {
  const result = reduce(content, deepFreeze(state), action);
  expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
  return result;
}

/** Dog room in design mode with `fulfilled` wants done (hearts kept equal), extra owned types and
 * placements set directly (convention 6 permits these edits). */
function dogRoom(fulfilled: string[], owned: string[] = [], placements: Record<string, string> = {}) {
  const { content, state } = dogRoomDesign();
  state.pets.dog.fulfilledWantIds = [...fulfilled];
  state.pets.dog.hearts = fulfilled.length;
  state.inventory.ownedTypeIds.push(...owned);
  state.rooms['dog-room'].placements = { ...placements };
  return { content, state };
}

function closeAll(content: Content, state: GameState): GameState {
  let current = state;
  while (current.dialogue.current !== null) current = step(content, current, advanceAction).state;
  return current;
}

const twentyPoints = { 'large-1': 'dog-bed', 'floor-1': 'lamp', 'wall-1': 'painting', 'floor-2': 'stool', 'floor-3': 'fern' };

it('VERIFY-MEC-009-003 partial evaluation and availability labels (design §4 2:00)', () => {
  const { content, state } = dogRoom(['soft-nap']);
  const result = step(content, state, place('floor-1', 'lamp'));
  expect(wantEvents(result.events)).toEqual([{ type: 'want.progressed', petId: 'dog', wantId: 'bright-corner', conditions: [
    { kind: 'tag', met: true, hidden: false, tag: 'light', availability: 'owned' },
    { kind: 'tag', met: false, hidden: false, tag: 'plant', availability: 'nextPhase' },
    { kind: 'adjacent', met: false, hidden: false, tagA: 'light', tagB: 'plant' },
  ] }]);
  expect(types(result.events)).not.toContain('want.fulfilled');
});

function afterAdjacency() {
  const { content, state } = dogRoom(['soft-nap'], ['fern'], { 'floor-1': 'lamp' });
  return { content, result: step(content, state, place('floor-2', 'fern')) };
}

it('VERIFY-MEC-009-004 adjacency fulfils bright-corner and unlocks sit-on once', () => {
  const { result } = afterAdjacency();
  const progressed = result.events.find(event => event.type === 'want.progressed');
  expect(progressed).toMatchObject({ wantId: 'bright-corner', conditions: [{ met: true }, { met: true }, { kind: 'adjacent', met: true }] });
  expect(result.events).toContainEqual({ type: 'want.fulfilled', petId: 'dog', wantId: 'bright-corner', hearts: 2,
    reward: { kind: 'verb', verb: 'sit-on' }, focusSlotId: 'floor-2' });
  expect(result.events.filter(event => event.type === 'verb.unlocked')).toEqual([{ type: 'verb.unlocked', petId: 'dog', verb: 'sit-on' }]);
  expect(result.state.pets.dog.verbs.filter(verb => verb === 'sit-on')).toHaveLength(1);
  expect(result.state.pets.dog.hearts).toBe(2);
});

it('VERIFY-MEC-009-005 one lamp-planter in one slot meets both tags but not adjacent', () => {
  const { content, state } = dogRoom(['soft-nap'], ['lamp-planter']);
  const result = step(content, state, place('floor-1', 'lamp-planter'));
  expect(wantEvents(result.events)[0]).toMatchObject({ conditions: [{ met: true }, { met: true }, { kind: 'adjacent', met: false }] });
});

it('VERIFY-MEC-009-006 lamp and fern in non-adjacent slots leave adjacent unmet', () => {
  const { content, state } = dogRoom(['soft-nap'], ['fern'], { 'floor-1': 'lamp' });
  const result = step(content, state, place('floor-3', 'fern'));
  expect(wantEvents(result.events)[0]).toMatchObject({ conditions: [{ met: true }, { met: true }, { kind: 'adjacent', met: false }] });
  expect(types(result.events)).not.toContain('want.fulfilled');
});

it('VERIFY-MEC-009-007 Stars floor view at 24; max read from select.starsOf', () => {
  const { content, state } = dogRoom(['soft-nap', 'bright-corner'], ['fern'], twentyPoints);
  expect(starsOf(content, state, 'dog-room').points).toBe(20);
  const result = step(content, state, place('wall-2', 'picture'));
  const progressed = result.events.find(event => event.type === 'want.progressed')!;
  const view = progressed.type === 'want.progressed' ? progressed.conditions[2] : null;
  expect(view).toEqual({ kind: 'stars', min: 24, current: 24, met: true, hidden: false });
  expect(view).not.toHaveProperty('max');
  expect(starsOf(content, result.state, 'dog-room')).toEqual({ points: 24, max: 48 });
});

it('VERIFY-MEC-009-008 placing a toy reveals the hidden tag before want.progressed', () => {
  const { content, state } = dogRoom(['soft-nap', 'bright-corner'], ['ball']);
  const result = step(content, state, place('floor-3', 'ball'));
  expect(wantEvents(result.events)[0]).toEqual({ type: 'want.hiddenRevealed', petId: 'dog', wantId: 'feels-like-home', tag: 'toy' });
  expect(wantEvents(result.events)[1]).toMatchObject({ type: 'want.progressed' });
  const progressed = wantEvents(result.events)[1];
  expect(progressed.type === 'want.progressed' && progressed.conditions[1])
    .toEqual({ kind: 'tag', met: true, hidden: false, tag: 'toy', availability: 'owned' });
  expect(result.state.pets.dog.revealedHiddenTags['feels-like-home']).toEqual(['toy']);
});

it('VERIFY-MEC-009-009 an unrevealed hidden view leaks no tag or availability', () => {
  const { content, state } = dogRoom(['soft-nap', 'bright-corner']);
  const hidden = wantConditions(content, deepFreeze(state), 'dog')[1];
  expect(hidden).toEqual({ kind: 'tag', hidden: true, met: false });
  expect(hidden).not.toHaveProperty('tag');
  expect(hidden).not.toHaveProperty('availability');
  expect(missingWantTags(content, state, 'dog')).toEqual(['plant']);
  expect(hiddenTagOfActiveWant(content, state, 'dog')).toBe('toy');
});

it('VERIFY-MEC-009-010 a toy already present is revealed at activation (Q9(a))', () => {
  const { content, state } = dogRoom(['soft-nap'], ['fern', 'ball'], { 'floor-1': 'lamp', 'floor-3': 'ball' });
  const result = step(content, state, place('floor-2', 'fern'));
  const kinds = types(result.events), at = kinds.indexOf('want.activated');
  expect(result.events[at]).toEqual({ type: 'want.activated', petId: 'dog', wantId: 'feels-like-home', index: 2 });
  expect(result.events[at + 1]).toEqual({ type: 'want.hiddenRevealed', petId: 'dog', wantId: 'feels-like-home', tag: 'toy' });
  expect(result.state.pets.dog.revealedHiddenTags).toEqual({ 'feels-like-home': ['toy'] });
});

it('VERIFY-MEC-009-011 a toy in the Owl room, or while want index 0 is active, reveals nothing', () => {
  const owlRoom = dogRoom(['soft-nap', 'bright-corner'], ['ball']);
  owlRoom.state.scene = { kind: 'interior', roomId: 'owl-room' };
  owlRoom.state.pets.owl.introduced = true;
  const inOwl = step(owlRoom.content, owlRoom.state, place('floor-1', 'ball'));
  expect(types(inOwl.events)).not.toContain('want.hiddenRevealed');
  expect(wantEvents(inOwl.events).every(event => 'petId' in event && event.petId === 'owl')).toBe(true);
  const early = dogRoom([], ['ball']);
  const atZero = step(early.content, early.state, place('floor-1', 'ball'));
  expect(types(atZero.events)).not.toContain('want.hiddenRevealed');
  expect(atZero.state.pets.dog.revealedHiddenTags).toEqual({});
});

it('VERIFY-MEC-009-012 removing every charm never takes a Heart back', () => {
  const { content, result } = afterAdjacency();
  let state = closeAll(content, result.state);
  const events: SimEvent[] = [];
  for (const slotId of Object.keys(state.rooms['dog-room'].placements)) {
    const removed = step(content, state, remove(slotId));
    events.push(...removed.events); state = removed.state;
  }
  expect(state.pets.dog.hearts).toBe(2);
  expect(state.pets.dog.fulfilledWantIds).toEqual(['soft-nap', 'bright-corner']);
  expect(wantEvents(events).map(event => event.type)).toEqual(['want.progressed', 'want.progressed']);
  expect(events.every(event => !('wantId' in event) || event.wantId === 'feels-like-home')).toBe(true);
});

it('VERIFY-MEC-009-013 partial: through fulfil directly (removeCharm is rejected dialogueOpen while a script is open), the vignette and announce are queued, not opened', () => {
  const { content, state } = dogRoom(['soft-nap'], ['fern'], { 'floor-1': 'lamp', 'floor-2': 'fern', 'floor-5': 'stool' });
  const open = enqueueScript(state, buildScript(content, 'intro', { petId: 'dog' })).state;
  expect(step(content, open, remove('floor-5')).events[0]).toMatchObject({ reason: 'dialogueOpen' });
  const result = fulfil(content, deepFreeze(open), 'dog', 'floor-1');
  expect(types(result.events)).toEqual(['want.fulfilled', 'verb.unlocked', 'heart.earned', 'want.activated']);
  expect(result.state.dialogue.current).toBe(open.dialogue.current);
  expect(result.state.dialogue.queue.map(script => [script.source, script.wantId]))
    .toEqual([['vignette', 'bright-corner'], ['wantAnnounce', 'feels-like-home']]);
});

it('VERIFY-MEC-009-014 the last want exhausts the pet; later placements emit no want.*', () => {
  const { content, state } = dogRoom(['soft-nap', 'bright-corner'], ['fern', 'ball'], twentyPoints);
  const result = step(content, state, place('floor-4', 'ball'));
  const nonPet = result.events.filter(event => !event.type.startsWith('pet.'));
  expect(types(nonPet).slice(-4)).toEqual(['want.fulfilled', 'heart.earned', 'dialogue.opened', 'wants.exhausted']);
  expect(nonPet.at(-1)).toEqual({ type: 'wants.exhausted', petId: 'dog' });
  expect(result.state.pets.dog.hearts).toBe(3);
  const later = step(content, closeAll(content, result.state), place('floor-5', 'vase'));
  expect(types(later.events).filter(type => type.startsWith('want'))).toEqual([]);
  expect(activeWant(content, later.state, 'dog')).toBeNull();
  expect(missingWantTags(content, later.state, 'dog')).toEqual([]);
  expect(wantConditions(content, later.state, 'dog')).toEqual([]);
});

/** In-test variant (patchFiles + loadContent): vase leaves the starter set so `food` is sourced nowhere;
 * ball leaves phase 1 and the Owl's want rewards toy-mouse so `toy` is sourced only by a Heart. */
function labelContent(): Content {
  return loadContent(manifest, patchFiles(files(), [
    { file: 'charms.json', path: '/starterSet', value: ['dog-bed', 'lamp', 'painting', 'stool', 'picture'] },
    { file: 'projects.json', path: '/projects/1/phaseRewards/0', value: ['fern'] },
    { file: 'pets/owl.json', path: '/wants/0/reward', value: { kind: 'types', typeIds: ['toy-mouse'] } },
  ]));
}

it('VERIFY-MEC-009-015 all five availability labels (in-test content variant); phase 1 granted turns nextPhase into owned', () => {
  const content = labelContent();
  const state = dogRoomDesign().state;
  state.inventory.ownedTypeIds = [...content.charms.starterSet];
  deepFreeze(state);
  expect(['soft', 'plant', 'tall', 'toy', 'food'].map(tag => tagAvailability(content, state, tag)))
    .toEqual(['owned', 'nextPhase', 'laterPhase', 'heart', 'never']);
  const collected = structuredClone(state) as GameState;
  collected.projects['pet-house'].acknowledgedPhase = 1;
  collected.inventory.ownedTypeIds.push('fern');
  expect(tagAvailability(content, collected, 'plant')).toBe('owned');
  expect(tagAvailability(content, collected, 'tall')).toBe('laterPhase');
});

it('VERIFY-MEC-009-016 a want satisfied at activation completes on the next removal with the fallback focusSlotId (Q6(a))', () => {
  const { content, state } = dogRoom([], ['fern'], { 'floor-1': 'lamp', 'floor-2': 'fern', 'floor-5': 'vase' });
  const first = step(content, state, place('large-1', 'dog-bed'));
  expect(first.events.filter(event => event.type === 'want.fulfilled')).toHaveLength(1);
  expect(first.events.filter(event => !event.type.startsWith('pet.')).at(-1)).toMatchObject({ type: 'want.activated', wantId: 'bright-corner' });
  expect(wantConditions(content, first.state, 'dog').every(view => view.met)).toBe(true);
  const removal = step(content, closeAll(content, first.state), remove('floor-5'));
  expect(removal.events).toContainEqual({ type: 'want.fulfilled', petId: 'dog', wantId: 'bright-corner', hearts: 2,
    reward: { kind: 'verb', verb: 'sit-on' }, focusSlotId: 'floor-1' });
  expect(removal.state.dialogue.current).toMatchObject({ source: 'vignette', wantId: 'bright-corner' });
});

it('VERIFY-MEC-009-018 partial: hearts equal fulfilledWantIds through a full Dog run (the property form is in invariants.test)', () => {
  const { content, state } = dogRoom([], ['fern', 'ball']);
  let current = state;
  for (const action of [place('large-1', 'dog-bed'), place('floor-1', 'lamp'), place('floor-2', 'fern'),
    place('wall-1', 'painting'), place('floor-3', 'stool'), place('floor-4', 'ball')]) {
    current = closeAll(content, step(content, current, action).state);
    expect(current.pets.dog.hearts).toBe(current.pets.dog.fulfilledWantIds.length);
  }
  expect(current.pets.dog.fulfilledWantIds).toEqual(content.pets.dog.wants.map(want => want.id));
});

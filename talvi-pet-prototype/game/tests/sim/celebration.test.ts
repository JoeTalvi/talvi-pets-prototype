import { expect, it } from 'vitest';
import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { completeNowOffered, doorEnabled } from '../../src/sim/select';
import type { GameState } from '../../src/sim/state';
import { loadContent } from '../../src/content/load';
import { files, manifest, patchFiles, validContent } from '../content/helpers';
import { act, ack, deepFreeze, eventsOf, owing, run, tick } from './helpers';

const types = (events: SimEvent[]) => events.map(event => event.type);
const rejection = (action: Action, reason: string) => [{ type: 'action.rejected', action, reason }];

it('VERIFY-MEC-002-009 acknowledgement preconditions: nothingOwed, notStreet, dialogueOpen, celebrationActive with state unchanged', () => {
  const content = validContent();
  const none = deepFreeze(owing(content, 0, 0));
  expect(reduce(content, none, ack)).toEqual({ state: none, events: rejection(ack, 'nothingOwed') });
  const owed = owing(content, 0, 300);
  const inside = deepFreeze({ ...owed, scene: { kind: 'interior', roomId: 'dog-room' } } as GameState);
  expect(reduce(content, inside, ack)).toEqual({ state: inside, events: rejection(ack, 'notStreet') });
  const talking = deepFreeze({ ...owed, dialogue: { current: { source: 'orientation', speaker: { game: true }, lines: ['a'], index: 0 }, queue: [] } } as GameState);
  expect(reduce(content, talking, ack)).toEqual({ state: talking, events: rejection(ack, 'dialogueOpen') });
  const celebrating = deepFreeze(reduce(content, owed, ack).state);
  expect(reduce(content, celebrating, ack)).toEqual({ state: celebrating, events: rejection(ack, 'celebrationActive') });
  const unknown: Action = { type: 'acknowledgeProject', projectId: 'nope' };
  expect(reduce(content, owed, unknown).events).toEqual(rejection(unknown, 'unknownProject'));
});

it('VERIFY-MEC-002-010 fast-forward payload 1 → 4 (fixture union is three ids: lamp-planter, bookshelf, perch-branch; spec says six), no completeNow.shown', () => {
  const content = validContent();
  const { state, results } = run(content, owing(content, 1, 1260), [ack]);
  expect(state.celebration).toEqual({ projectId: 'pet-house', fromPhase: 1, toPhase: 4, completes: false,
    unlockedTypeIds: ['lamp-planter', 'bookshelf', 'perch-branch'], step: 'cutscene', skipTaken: false });
  expect(results[0].events).toEqual([{ type: 'celebration.started', projectId: 'pet-house', fromPhase: 1, toPhase: 4,
    completes: false, unlockedTypeIds: ['lamp-planter', 'bookshelf', 'perch-branch'], clueIndices: [1, 2, 3], replay: false }]);
});

it('MEC-002 §2.4 startCelebration keeps the first occurrence of a reward repeated across phases', () => {
  const content = loadContent(manifest, patchFiles(files(), [
    { file: 'projects.json', path: '/projects/1/phaseRewards/2', value: ['lamp-planter', 'bookshelf'] }]));
  expect(run(content, owing(content, 1, 1260), [ack]).state.celebration!.unlockedTypeIds)
    .toEqual(['lamp-planter', 'bookshelf', 'perch-branch']);
});

it('VERIFY-MEC-002-011 complete-now price 240 at the milestone', () => {
  const content = validContent();
  const { state, results } = run(content, owing(content, 1, 1260), [ack, act('cutsceneFinished')]);
  expect(results[1].events).toEqual([{ type: 'celebration.stepped', step: 'milestone' },
    { type: 'completeNow.shown', projectId: 'pet-house', priceCents: 240 }]);
  expect(completeNowOffered(content, state)).toBe(true);
});

it('VERIFY-MEC-002-012 no offer when completing or nothing remains; skipWait at cutscene is wrongStep', () => {
  const content = validContent();
  const a = run(content, owing(content, 4, 1500), [ack, act('cutsceneFinished'), act('skipWait')]);
  expect(types(a.results[1].events)).toEqual(['celebration.stepped']);
  expect(a.results[2].events).toEqual(rejection(act('skipWait'), 'completing'));
  const b = run(content, owing(content, 1, 1500), [ack, act('skipWait'), act('cutsceneFinished')]);
  expect(b.state.celebration!.completes).toBe(true);
  expect(b.results[1].events).toEqual(rejection(act('skipWait'), 'wrongStep'));
  expect(types(b.results[2].events)).toEqual(['celebration.stepped']);
  expect(run(content, b.state, [act('cutsceneFinished')]).results[0].events).toEqual(rejection(act('cutsceneFinished'), 'wrongStep'));
});

it('VERIFY-MEC-002-013 collect grants then acknowledges (fixture union: three ids now owned; spec says six)', () => {
  const content = validContent();
  const { state, results } = run(content, owing(content, 1, 1260), [ack, act('cutsceneFinished'), act('collectRewards')]);
  expect(results[2].events).toEqual([
    { type: 'types.unlocked', typeIds: ['lamp-planter', 'bookshelf', 'perch-branch'], source: 'phase' },
    { type: 'rewards.collected', projectId: 'pet-house', phases: [2, 3, 4], typeIds: ['lamp-planter', 'bookshelf', 'perch-branch'] },
    { type: 'celebration.stepped', step: 'reveal' }]);
  expect(state.projects['pet-house']).toMatchObject({ acknowledgedPhase: 4, complete: false });
  expect(state.inventory.ownedTypeIds).toEqual(expect.arrayContaining(['lamp-planter', 'bookshelf', 'perch-branch']));
  expect(state.celebration!.step).toBe('reveal');
});

it('VERIFY-MEC-004-006 phase grant filters owned ids through reduce: bookshelf already owned', () => {
  const content = validContent();
  const state = owing(content, 1, 1260);
  state.inventory.ownedTypeIds.push('bookshelf');
  const { results } = run(content, state, [ack, act('cutsceneFinished'), act('collectRewards')]);
  expect(results[2].events[0]).toEqual({ type: 'types.unlocked', typeIds: ['lamp-planter', 'perch-branch'], source: 'phase' });
  expect(eventsOf(results[2].events, 'rewards.collected')[0].typeIds).toEqual(['lamp-planter', 'bookshelf', 'perch-branch']);
});

function skipChain(content: Content) {
  return run(content, owing(content, 1, 1260), [ack, act('cutsceneFinished'), act('skipWait'), act('closeReveal')]);
}

it('VERIFY-MEC-002-014 skip chain: taken, credited to the goal, collected at toPhase 4, then a 4 → 5 celebration', () => {
  const content = validContent();
  const { state, results } = skipChain(content);
  expect(types(results[2].events)).toEqual(['completeNow.taken', 'phase.reached', 'feed.stopped',
    'types.unlocked', 'rewards.collected', 'celebration.stepped']);
  expect(results[2].events[0]).toEqual({ type: 'completeNow.taken', projectId: 'pet-house', priceCents: 240 });
  expect(results[2].events[1]).toEqual({ type: 'phase.reached', projectId: 'pet-house', phase: 5, currentCents: 1500 });
  expect(results[2].state.projects['pet-house']).toMatchObject({ currentCents: 1500, acknowledgedPhase: 4, complete: false });
  expect(results[2].state.celebration!.skipTaken).toBe(true);
  expect(results[3].events).toEqual([{ type: 'celebration.ended', projectId: 'pet-house' },
    { type: 'celebration.started', projectId: 'pet-house', fromPhase: 4, toPhase: 5, completes: true,
      unlockedTypeIds: ['tall-lamp'], clueIndices: [4], replay: false }]);
  expect(state.arrival).toBeNull();
});

it('VERIFY-MEC-002-015 completion → arrival → door enabled only after arrivalFinished', () => {
  const content = validContent();
  const door = content.street.houses.find(house => house.projectId === 'pet-house')!.door;
  const chained = skipChain(content).state;
  const { state, results } = run(content, chained, [act('cutsceneFinished'), act('collectRewards'), act('closeReveal')]);
  expect(eventsOf(results[1].events, 'project.completed')).toEqual([{ type: 'project.completed', projectId: 'pet-house' }]);
  expect(results[1].state.projects['pet-house'].complete).toBe(true);
  expect(types(results[2].events).slice(0, 2)).toEqual(['celebration.ended', 'arrival.started']);
  expect(results[2].events[1]).toEqual({ type: 'arrival.started', projectId: 'pet-house', petId: 'owl', doorId: 'pet-front' });
  expect(doorEnabled(content, state, door)).toBe(false);
  const done = run(content, state, [{ type: 'advanceDialogue' }, { type: 'advanceDialogue' }, act('arrivalFinished')]);
  expect(done.results[2].events).toEqual([{ type: 'arrival.finished', petId: 'owl' }]);
  expect(done.state.projects['pet-house'].arrivalDone).toBe(true);
  expect(done.state.arrival).toBeNull();
  expect(doorEnabled(content, done.state, door)).toBe(true);
  expect(run(content, done.state, [act('arrivalFinished')]).results[0].events).toEqual(rejection(act('arrivalFinished'), 'noArrival'));
});

it('VERIFY-MEC-002-016 messages: phase 1 line then the completion message on a 0 → 5 close; the skip-chain close queues none', () => {
  const content = validContent();
  const state = owing(content, 0, 0);
  const { state: after, results } = run(content, state, [{ type: 'debugCompleteProject', projectId: 'pet-house' }, ack,
    act('cutsceneFinished'), act('collectRewards'), act('closeReveal')]);
  expect(types(results[4].events)).toEqual(['celebration.ended', 'arrival.started', 'dialogue.opened']);
  expect(after.dialogue.current).toEqual({ source: 'phaseMessage', speaker: { game: true }, lines: ['A new step.'], index: 0, projectId: 'pet-house' });
  expect(after.dialogue.queue).toEqual([{ source: 'completionMessage', speaker: { game: true }, lines: ['A new home.'], index: 0, projectId: 'pet-house' }]);
  const chained = skipChain(content);
  expect(eventsOf(chained.results[3].events, 'dialogue.opened')).toEqual([]);
  expect(chained.state.dialogue).toEqual({ current: null, queue: [] });
});

it('VERIFY-MEC-008-011 phase messages for 2 and 4 (in-test variant): only phase 4 opens; completion message opens after celebration.ended', () => {
  const content = loadContent(manifest, patchFiles(files(), [{ file: 'projects.json', path: '/projects/1/phaseMessages',
    value: [[], ['Phase two.'], [], ['Phase four.', 'Still four.'], []] }]));
  const first = run(content, owing(content, 1, 1260), [ack, act('cutsceneFinished'), act('collectRewards'), act('closeReveal')]);
  expect(eventsOf(first.results[3].events, 'dialogue.opened')).toEqual([{ type: 'dialogue.opened', script: {
    source: 'phaseMessage', speaker: { game: true }, lines: ['Phase four.', 'Still four.'], index: 0, projectId: 'pet-house' } }]);
  expect(first.state.dialogue.queue).toEqual([]);
  const second = run(content, first.state, [{ type: 'advanceDialogue' }, { type: 'advanceDialogue' },
    { type: 'debugCompleteProject', projectId: 'pet-house' }, ack, act('cutsceneFinished'), act('collectRewards'), act('closeReveal')]);
  const close = second.results[6].events;
  expect(types(close)).toEqual(['celebration.ended', 'arrival.started', 'dialogue.opened']);
  expect(eventsOf(close, 'dialogue.opened')[0].script).toMatchObject({ source: 'completionMessage', lines: ['A new home.'] });
});

it('VERIFY-MEC-002-017 arrival on the street: one tick emits scene.changed then celebration.started at step cutscene', () => {
  const content = validContent();
  const state = owing(content, 0, 700);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.pets.dog.introduced = true;
  state.avatar = { x: 500, y: 160, facing: 'up', immunityMs: 0, facingCandidate: null };
  const { state: after, results } = run(content, state, [tick(0, 0, 16)]);
  expect(types(results[0].events).slice(0, 2)).toEqual(['scene.changed', 'celebration.started']);
  expect(results[0].events[1]).toMatchObject({ type: 'celebration.started', projectId: 'pet-house', fromPhase: 0, toPhase: 2, replay: false });
  expect(after.celebration!.step).toBe('cutscene');
  expect(after.scene).toEqual({ kind: 'street' });
});

it('MEC-002 §2.4 a reload or entry onto the street with nothing owed starts nothing; view-timing actions without a celebration are noCelebration', () => {
  const content = validContent();
  const state = owing(content, 0, 0);
  for (const action of [act('cutsceneFinished'), act('collectRewards'), act('skipWait'), act('closeReveal')])
    expect(reduce(content, deepFreeze(state), action)).toEqual({ state, events: rejection(action, 'noCelebration') });
});

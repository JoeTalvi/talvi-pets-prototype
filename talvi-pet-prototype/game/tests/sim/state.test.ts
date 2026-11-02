import { expect, it } from 'vitest';
import { initialState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { deepFreeze } from './helpers';

it('CONTRACT-STATE v1.4 initial session, avatar, projects and inventory match the authored content', () => {
  const content = deepFreeze(validContent()), state = initialState(content, 1234);
  expect(state.schemaVersion).toBe(2);
  expect(state.session).toEqual({ seed: 1234, eventIntervalMs: 20000, feedPresentation: 'events',
    starsVisible: true, muted: false, testerLabel: '', orientationShown: false });
  expect(state.scene).toEqual({ kind: 'street' });
  expect(state.avatar).toEqual({ ...content.street.playerSpawn, immunityMs: 0, facingCandidate: null });
  expect(state.mode).toBe('play');
  expect(state.projects).toEqual({
    'starter-house': { currentCents: 1500, acknowledgedPhase: 5, complete: true, arrivalDone: true },
    'pet-house': { currentCents: 0, acknowledgedPhase: 0, complete: false, arrivalDone: false },
  });
  expect(state.inventory.counts).toEqual(Object.fromEntries(content.charms.starterSet.map(entry => [entry.typeId, entry.count])));
  expect(Object.values(state.pets).every(pet => pet.heartCharms.length === 0 && pet.strippedPending.length === 0)).toBe(true);
  expect(state.feed).toEqual({ rngState: 1234, sinceLastEventMs: 0, eventCount: 0 });
  expect(state.celebration).toBeNull(); expect(state.arrival).toBeNull();
  expect(state.dialogue).toEqual({ current: null, queue: [] });
});

it('CONTRACT-STATE v1.4 initial rooms and pets are independent JSON values in content order', () => {
  const content = deepFreeze(validContent()), state = initialState(content, 1);
  for (const [id, room] of Object.entries(content.rooms)) {
    expect(state.rooms[id]).toEqual({ placements: {} });
    expect(state.pets[room.residentPetId].behaviour).toEqual({
      phase: 'idle', ...room.petSpawn, timerMs: content.tuning.idleMs.min,
      target: null, verb: null, reaction: null,
    });
  }
  Object.values(content.pets).forEach((pet, index) => {
    expect(state.pets[pet.id]).toMatchObject({ hearts: 0, fulfilledWantIds: [], revealedHiddenTags: {},
      verbs: pet.verbs.filter(entry => entry.atStart).map(entry => entry.verb), introduced: false,
      rngState: (1 ^ (0x9e3779b9 * (index + 1))) >>> 0, recentTargets: [], wantBubbleInMs: 40000 });
  });
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  state.pets.dog.fulfilledWantIds.push('example');
  expect(initialState(content, 1).pets.dog.fulfilledWantIds).toEqual([]);
  expect(state.pets.owl.fulfilledWantIds).toEqual([]);
});

it('CONTRACT-STATE initial feed cursor wraps unsigned while session retains its finite seed', () => {
  const content = validContent(), state = initialState(content, -1);
  expect(state.session.seed).toBe(-1); expect(state.feed.rngState).toBe(4294967295);
  expect(() => initialState(content, NaN)).toThrow('Initial seed must be finite');
});

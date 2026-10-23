import { expect, it } from 'vitest';
import type { Content } from '../../src/content/types';
import { pointInPolygon } from '../../src/sim/geometry';
import { reduce } from '../../src/sim/reduce';
import { doorEnabled, phaseOf, starsOf } from '../../src/sim/select';
import { initialState, type GameState } from '../../src/sim/state';
import { nextAction } from './arbitrary';
import { validContent } from '../content/helpers';
import { deepFreeze, squareFixture } from './helpers';

/** VERIFY-CORE-003 (invariant 2, VERIFY-MEC-009-018) and VERIFY-CORE-010 (MEC-008 dialogue shape). */
function expectWantAndDialogueInvariants(content: Content, state: GameState): void {
  for (const [petId, pet] of Object.entries(state.pets)) {
    expect(pet.hearts).toBe(pet.fulfilledWantIds.length);
    expect(pet.fulfilledWantIds).toEqual(content.pets[petId].wants.slice(0, pet.fulfilledWantIds.length).map(want => want.id));
  }
  const { current, queue } = state.dialogue;
  if (current === null) expect(queue).toHaveLength(0);
  else expect(current.index >= 0 && current.index < current.lines.length).toBe(true);
}

/** VERIFY-CORE-011 partial (mec-007 §1 invariants) for the resident pet after every dispatch. */
function expectPetInvariants(content: Content, state: GameState): void {
  for (const pet of Object.values(state.pets)) expect(pet.recentTargets.length).toBeLessThanOrEqual(content.tuning.recentTargetsKept);
  if (state.scene.kind !== 'interior') return;
  const room = content.rooms[state.scene.roomId];
  const behaviour = state.pets[room.residentPetId].behaviour;
  expect(pointInPolygon(behaviour, room.walkArea)).toBe(true);
  if (behaviour.phase === 'walking') expect(behaviour.target).not.toBeNull();
  if (behaviour.phase !== 'using') return;
  expect(behaviour.verb).not.toBeNull();
  expect(state.rooms[room.id].placements[(behaviour.target as { slotId: string }).slotId]).toBeDefined();
}

/** VERIFY-CORE-002 / VERIFY-CORE-006 partial (invariants 1, 5, 6) = VERIFY-MEC-002-022. */
function expectProjectInvariants(content: Content, state: GameState): void {
  for (const project of content.projects) {
    const progress = state.projects[project.id];
    expect(progress.currentCents >= 0 && progress.currentCents <= project.goalCents).toBe(true);
    expect(progress.acknowledgedPhase).toBeGreaterThanOrEqual(0);
    expect(progress.acknowledgedPhase).toBeLessThanOrEqual(phaseOf(progress.currentCents, project.goalCents));
    if (progress.complete) expect(progress.acknowledgedPhase).toBe(5);
    const house = content.street.houses.find(candidate => candidate.projectId === project.id)!;
    const door = content.rooms[project.interiorRoomId].doors.find(candidate => candidate.target.scene === 'street');
    expect(doorEnabled(content, state, house.door)).toBe(progress.complete && progress.arrivalDone);
    if (door) expect(doorEnabled(content, state, door)).toBe(true);
  }
  if (state.celebration !== null) expect(state.scene.kind).toBe('street');
}

function expectInvariants(content: Content, state: GameState): void {
  expectWantAndDialogueInvariants(content, state);
  expectProjectInvariants(content, state);
  expectPetInvariants(content, state);
  if (state.mode === 'design') expect(state.scene.kind).toBe('interior');
  const polygon = state.scene.kind === 'street' ? content.street.walkArea
    : content.rooms[state.scene.roomId].walkArea;
  expect(pointInPolygon(state.avatar, polygon)).toBe(true);
  expect(state.avatar.immunityMs).toBeGreaterThanOrEqual(0);
  for (const [roomId, room] of Object.entries(state.rooms)) {
    for (const [slotId, typeId] of Object.entries(room.placements)) {
      expect(state.inventory.ownedTypeIds).toContain(typeId);
      const slot = content.rooms[roomId].slots.find(candidate => candidate.id === slotId)!;
      expect(content.charms.types.find(type => type.id === typeId)!.sizeClass).toBe(slot.sizeClass);
    }
    const values = Object.values(room.placements);
    expect(starsOf(content, state, roomId)).toEqual({ points: values.length + new Set(values).size * 3, max: 4 * 12 });
  }
}

it.each([1, 2, 3])(
  'VERIFY-MEC-001-015 / VERIFY-CORE-003,004,005,006,008,010 / VERIFY-MEC-009-018 partial: 500 valid tick/setDesignMode/placeCharm/removeCharm/advanceDialogue/tapPet/celebration/debug actions at seed %s with VERIFY-CORE-011 partial pet invariants and project invariants 1, 5, 6', seed => {
    const { content } = squareFixture(seed);
    let state = initialState(content, seed), replay = initialState(content, seed), cursor = seed;
    let sceneChanges = 0, modeChanges = 0, placements = 0, advances = 0;
    for (let index = 0; index < 500; index++) {
      const generated = nextAction(content, state, cursor); cursor = generated.seed;
      const first = reduce(content, deepFreeze(state), generated.action);
      const second = reduce(content, deepFreeze(replay), generated.action);
      expect(second).toEqual(first);
      expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state);
      expect(first.events.some(event => event.type === 'action.rejected')).toBe(false);
      expectInvariants(content, first.state);
      sceneChanges += first.events.filter(event => event.type === 'scene.changed').length;
      modeChanges += first.events.filter(event => event.type === 'mode.changed').length;
      placements += first.events.filter(event => event.type === 'charm.placed').length;
      advances += generated.action.type === 'advanceDialogue' ? 1 : 0;
      state = first.state; replay = second.state;
    }
    expect(sceneChanges).toBeGreaterThan(2);
    expect(modeChanges).toBeGreaterThan(2);
    expect(placements).toBeGreaterThan(20);
    expect(advances).toBeGreaterThan(1);
  },
);

it('VERIFY-MEC-002-022 / VERIFY-CORE-002, VERIFY-CORE-006, VERIFY-CORE-007 partial: celebration and debug actions over seeds 1..3 keep invariants 1, 5, 6 and 7; at least one celebration.started and one arrival.finished', () => {
  const content = validContent();
  let celebrations = 0, arrivals = 0;
  for (const seed of [1, 2, 3]) {
    let state = initialState(content, seed), cursor = seed;
    for (let index = 0; index < 1500; index++) {
      const generated = nextAction(content, state, cursor); cursor = generated.seed;
      const result = reduce(content, deepFreeze(state), generated.action);
      expect(result.events.filter(event => event.type === 'action.rejected')).toEqual([]);
      expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
      expectProjectInvariants(content, result.state);
      celebrations += result.events.filter(event => event.type === 'celebration.started').length;
      arrivals += result.events.filter(event => event.type === 'arrival.finished').length;
      state = result.state;
    }
  }
  expect(celebrations).toBeGreaterThan(0);
  expect(arrivals).toBeGreaterThan(0);
});

it('VERIFY-CORE-011 / VERIFY-CORE-008 / VERIFY-CORE-009 partial (pet stream): 2,000 generated actions give identical pet decisions when only feed.rngState differs', () => {
  const { content } = squareFixture(1);
  let state = initialState(content, 1), other = { ...initialState(content, 1), feed: { rngState: 99, sinceLastEventMs: 0, eventCount: 0 } };
  let cursor = 1, petEvents = 0;
  for (let index = 0; index < 2000; index++) {
    const generated = nextAction(content, state, cursor); cursor = generated.seed;
    const first = reduce(content, state, generated.action), second = reduce(content, other, generated.action);
    const pets = (events: typeof first.events) => events.filter(event => event.type.startsWith('pet.'));
    expect(pets(second.events)).toEqual(pets(first.events));
    expect(second.state.pets).toEqual(first.state.pets);
    expectPetInvariants(content, first.state);
    petEvents += pets(first.events).length;
    state = first.state; other = second.state;
  }
  expect(petEvents).toBeGreaterThan(10);
});

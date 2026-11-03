import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { checkInvariants } from '../../src/sim/invariants';
import { reduce } from '../../src/sim/reduce';
import { rollOutside, STREET_OUTSIDE_P, streetPets } from '../../src/sim/rules/streetPresence';
import type { GameState, PetId, RoomId } from '../../src/sim/state';
import { parseSaveValue, SAVE_SCHEMA_VERSION } from '../../src/sim/state.schema';
import { pointInPolygon } from '../../src/sim/geometry';

/** WORK-035-1 (DEC-045): Dog and Owl on the street — the roll, never in two places, street stepping, taps. */
const content = loadContent();
const tick = (dtMs = 100): Action => ({ type: 'tick', dtMs, move: { x: 0, y: 0 } });
const HOUSE_PETS: PetId[] = ['dog', 'owl'];

function mateArrived(): GameState {
  const loaded = parseSaveValue(content, JSON.parse(readFileSync('tests/view/capture/mate-arrived.real.json', 'utf8')));
  if (!('state' in loaded)) throw new Error(`discarded: ${loaded.discarded}`);
  return loaded.state;
}

/** The mate-arrived save with the Dog and the Owl at ≥ 1 Heart (wants are a prefix: invariant 2). */
function withHearts(state = mateArrived(), petIds: PetId[] = HOUSE_PETS): GameState {
  const pets = { ...state.pets };
  for (const petId of petIds) {
    const first = content.pets[petId].wants[0].id;
    const already = pets[petId].hearts >= 1;
    pets[petId] = { ...pets[petId], introduced: true, ...(already ? {} : { hearts: 1, fulfilledWantIds: [first] }) };
  }
  return { ...state, pets };
}

function apply(state: GameState, action: Action): { state: GameState; events: SimEvent[] } {
  const result = reduce(content, state, action);
  return { state: result.state, events: result.events };
}

/** Stand on the room's street door and step once: a real street arrival through tick step 2. */
function leaveRoom(state: GameState, roomId: RoomId): { state: GameState; events: SimEvent[] } {
  const room = content.rooms[roomId];
  const door = room.doors.find(candidate => candidate.target.scene === 'street')!;
  const resident = room.residentPetId;
  const pet = state.pets[resident];
  const [home] = room.wanderPoints;
  const inside = pet.outside ? { ...pet, outside: false, behaviour: { ...pet.behaviour, x: home.x, y: home.y, phase: 'idle' as const,
    target: null, verb: null, reaction: null } } : pet;
  const at: GameState = { ...state, scene: { kind: 'interior', roomId }, mode: 'play',
    pets: { ...state.pets, [resident]: inside },
    avatar: { ...state.avatar, x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2, immunityMs: 0 } };
  return apply(at, tick());
}

/** Stand on a house's door on the street and step once. */
function enterHouse(state: GameState, projectId: string): { state: GameState; events: SimEvent[] } {
  const house = content.street.houses.find(candidate => candidate.projectId === projectId)!;
  const { rect } = house.door;
  const at: GameState = { ...state, avatar: { ...state.avatar, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, immunityMs: 0 } };
  return apply(at, tick());
}

const outsideEvents = (events: SimEvent[]) => events.filter(event => event.type === 'pet.outside');
const outsideOf = (state: GameState) => HOUSE_PETS.map(petId => state.pets[petId].outside);
const streams = (state: GameState) => [state.feed.rngState, ...Object.values(state.pets).map(pet => pet.rngState)];

describe('VERIFY-WORK-035-1-01 the roll is pure, seeded and p ≈ 0.6', () => {
  it('same inputs, same value; p = STREET_OUTSIDE_P 0.6', () => {
    expect(STREET_OUTSIDE_P).toBe(0.6);
    for (let visit = 1; visit <= 50; visit++) expect(rollOutside(42, 'dog', visit)).toBe(rollOutside(42, 'dog', visit));
  });
  it.each([1, 42, 1234])('seed %i: the share of true over visits 1..2000 lies in [0.55, 0.65] for dog and owl', seed => {
    for (const petId of HOUSE_PETS) {
      let count = 0;
      for (let visit = 1; visit <= 2000; visit++) if (rollOutside(seed, petId, visit)) count++;
      expect(count / 2000).toBeGreaterThanOrEqual(0.55);
      expect(count / 2000).toBeLessThanOrEqual(0.65);
    }
  });
  it('a street arrival leaves every pets[*].rngState and feed.rngState byte-identical', () => {
    const before = withHearts();
    const { state, events } = leaveRoom(before, 'owl-room');
    expect(events.some(event => event.type === 'scene.changed')).toBe(true);
    expect(streams(state)).toEqual(streams(before));
  });
});

describe('VERIFY-WORK-035-1-02 eligibility; the mate always outside', () => {
  it('a pet with 0 Hearts is never outside under any mode or visit; the mate stays outside', () => {
    let state = withHearts(mateArrived(), ['owl']); // Dog 0 Hearts
    for (const mode of ['roll', 'all', 'none'] as const) {
      state = apply(state, { type: 'debugSetPetsOutside', mode }).state;
      for (let visit = 0; visit < 20; visit++) {
        state = leaveRoom(state, visit % 2 === 0 ? 'owl-room' : 'dog-room').state;
        expect(state.pets.dog.outside).toBe(false);
        expect(state.pets['owl-mate'].outside).toBe(true);
      }
    }
  });
});

describe('VERIFY-WORK-035-1-03 never in two places', () => {
  it('leaving the Dog room keeps the Dog inside that visit whatever the roll (mode roll)', () => {
    let state = withHearts();
    for (let visit = 0; visit < 30; visit++) {
      state = leaveRoom(state, 'dog-room').state;
      expect(state.pets.dog.outside).toBe(false);
      expect(state.pets.owl.outside).toBe(rollOutside(state.session.seed, 'owl', state.streetVisits));
    }
  });
  it('a pet turning outside stands idle at its house wanderPoints[0]; pet.outside only on change', () => {
    let state = withHearts();
    const pet = content.street.houses.find(house => house.projectId === 'pet-house')!;
    let seen = 0;
    for (let visit = 0; visit < 30; visit++) {
      const was = state.pets.owl.outside;
      const result = leaveRoom(state, 'dog-room');
      state = result.state;
      const flips = outsideEvents(result.events).filter(event => event.type === 'pet.outside' && event.petId === 'owl');
      expect(flips.length).toBe(was === state.pets.owl.outside ? 0 : 1);
      if (!was && state.pets.owl.outside) {
        seen++;
        expect(state.pets.owl.behaviour).toMatchObject({ phase: 'idle', x: pet.wanderPoints![0].x, y: pet.wanderPoints![0].y,
          target: null, verb: null, reaction: null });
      }
    }
    expect(seen).toBeGreaterThan(0);
  });
  it('entering its house sets outside false in the same dispatch, at the room wanderPoints[0], then the entry greeting', () => {
    const state = apply(withHearts(), { type: 'debugSetPetsOutside', mode: 'all' }).state;
    expect(outsideOf(state)).toEqual([true, true]);
    const { state: inside, events } = enterHouse(state, 'pet-house');
    expect(inside.scene).toEqual({ kind: 'interior', roomId: 'owl-room' });
    expect(inside.pets.owl.outside).toBe(false);
    expect(inside.pets.dog.outside).toBe(true);
    expect(outsideEvents(events)).toEqual([{ type: 'pet.outside', petId: 'owl', outside: false }]);
    const changed = events.findIndex(event => event.type === 'scene.changed');
    const flipped = events.findIndex(event => event.type === 'pet.outside');
    const greeting = events.findIndex(event => event.type === 'pet.phaseChanged' && event.petId === 'owl');
    expect(changed).toBeLessThan(flipped);
    expect(flipped).toBeLessThan(greeting);
    const [centre] = content.rooms['owl-room'].wanderPoints;
    expect(inside.pets.owl.behaviour).toMatchObject({ x: centre.x, y: centre.y, reaction: 'greeting' });
    expect(checkInvariants(content, inside)).toEqual([]);
  });
});

describe('VERIFY-WORK-035-1-04 streetVisits and persistence', () => {
  it('+1 per street arrival, never on load or reset', () => {
    let state = withHearts();
    const start = state.streetVisits;
    state = leaveRoom(state, 'owl-room').state;
    state = leaveRoom(state, 'dog-room').state;
    expect(state.streetVisits).toBe(start + 2);
    const save = JSON.parse(JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, savedAt: 'x', state }));
    expect((parseSaveValue(content, save) as { state: GameState }).state.streetVisits).toBe(start + 2);
    expect(apply(state, { type: 'reset' }).state.streetVisits).toBe(0);
  });
  it('a v2 save without streetVisits / petsOutside loads with 0 / roll; a Dog outside round-trips; version still 2', () => {
    const raw = JSON.parse(readFileSync('tests/view/capture/mate-arrived.real.json', 'utf8'));
    delete raw.state.streetVisits; delete raw.state.session.petsOutside;
    const loaded = parseSaveValue(content, raw) as { state: GameState };
    expect([loaded.state.streetVisits, loaded.state.session.petsOutside]).toEqual([0, 'roll']);
    const out = apply(withHearts(), { type: 'debugSetPetsOutside', mode: 'all' }).state;
    const back = parseSaveValue(content, JSON.parse(JSON.stringify({ schemaVersion: 2, savedAt: 'x', state: out })));
    expect(back).toEqual({ state: out });
    expect(SAVE_SCHEMA_VERSION).toBe(2);
  });
});

describe('VERIFY-WORK-035-1-05 street stepping among W(p)', () => {
  const W: Record<string, string[]> = { dog: ['starter-w1', 'starter-w2', 'street-meet'], owl: ['pet-w1', 'pet-w2', 'street-meet'],
    'owl-mate': ['garden-w1', 'garden-w2', 'street-meet'] };
  it('with Dog and Owl outside every street pet wanders only in W(p), never the same target twice, inside the walk area; each reaches street-meet', () => {
    let state = apply(withHearts(), { type: 'debugSetPetsOutside', mode: 'all' }).state;
    expect(streetPets(content, state).map(pet => pet.petId)).toEqual(['dog', 'owl-mate', 'owl']);
    const targets: Record<string, string[]> = { dog: [], owl: [], 'owl-mate': [] };
    for (let i = 0; i < 3000; i++) { // 5 min at 100 ms
      const result = reduce(content, state, tick());
      state = result.state;
      for (const event of result.events)
        if (event.type === 'pet.phaseChanged' && event.to === 'walking' && event.target && 'wanderPointId' in event.target)
          targets[event.petId].push(event.target.wanderPointId);
      for (const petId of Object.keys(W)) expect(pointInPolygon(state.pets[petId].behaviour, content.street.walkArea)).toBe(true);
    }
    for (const [petId, list] of Object.entries(targets)) {
      expect(list.length, petId).toBeGreaterThan(4);
      list.forEach((target, i) => { expect(W[petId]).toContain(target); if (i > 0) expect(target).not.toBe(list[i - 1]); });
      expect(list, petId).toContain('street-meet');
    }
    expect(checkInvariants(content, state)).toEqual([]);
  });
  it('an inside house pet is not stepped on the street', () => {
    const state = withHearts();
    const next = reduce(content, state, tick()).state;
    expect(next.pets.dog.behaviour).toEqual(state.pets.dog.behaviour);
  });
});

describe('VERIFY-WORK-035-1-06 tapPet on the street', () => {
  it('the Dog answers a tap when outside, petNotHere when inside; the mate unchanged', () => {
    const inside = withHearts();
    expect(reduce(content, inside, { type: 'tapPet', petId: 'dog' }).events[0]).toMatchObject({ type: 'action.rejected', reason: 'petNotHere' });
    const out = apply(inside, { type: 'debugSetPetsOutside', mode: 'all' }).state;
    expect(reduce(content, out, { type: 'tapPet', petId: 'dog' }).events[0]).toMatchObject({ type: 'pet.tapped', petId: 'dog' });
    expect(reduce(content, inside, { type: 'tapPet', petId: 'owl-mate' }).events[0]).toMatchObject({ type: 'pet.tapped', petId: 'owl-mate' });
  });
});

describe('VERIFY-WORK-035-1-07 debugSetPetsOutside (sim half)', () => {
  it('all -> every pet with ≥ 1 Heart outside at once with debug.applied; none -> all in; roll -> no change until the next arrival', () => {
    const start = withHearts();
    const all = apply(start, { type: 'debugSetPetsOutside', mode: 'all' });
    expect(all.events[0]).toMatchObject({ type: 'debug.applied' });
    expect(outsideOf(all.state)).toEqual([true, true]);
    expect(all.state.session.petsOutside).toBe('all');
    const none = apply(all.state, { type: 'debugSetPetsOutside', mode: 'none' });
    expect(outsideOf(none.state)).toEqual([false, false]);
    expect(outsideEvents(none.events)).toHaveLength(2);
    const roll = apply(all.state, { type: 'debugSetPetsOutside', mode: 'roll' });
    expect(outsideOf(roll.state)).toEqual([true, true]);
    expect(outsideEvents(roll.events)).toEqual([]);
    const next = leaveRoom(roll.state, 'dog-room').state;
    expect(next.pets.dog.outside).toBe(false);
    expect(next.pets.owl.outside).toBe(rollOutside(next.session.seed, 'owl', next.streetVisits));
  });
  it('a bad mode is rejected', () => {
    const state = withHearts();
    const result = reduce(content, state, { type: 'debugSetPetsOutside', mode: 'sometimes' } as unknown as Action);
    expect(result.state).toBe(state);
    expect(result.events[0]).toMatchObject({ type: 'action.rejected' });
  });
});

describe('VERIFY-WORK-035-1-11 invariants (fork (a))', () => {
  it('an outside Dog in street coordinates passes; an inside Dog off its room walk area fails 10; its room with it outside fails 11', () => {
    const out = apply(withHearts(), { type: 'debugSetPetsOutside', mode: 'all' }).state;
    expect(checkInvariants(content, out)).toEqual([]);
    const inside = withHearts();
    const offRoom = { ...inside, pets: { ...inside.pets, dog: { ...inside.pets.dog, behaviour: { ...inside.pets.dog.behaviour, x: 650, y: 948 } } } };
    expect(checkInvariants(content, offRoom).some(message => message.startsWith('invariant 10'))).toBe(true);
    const inRoom: GameState = { ...out, scene: { kind: 'interior', roomId: 'dog-room' } };
    expect(checkInvariants(content, inRoom).some(message => message.startsWith('invariant 11'))).toBe(true);
  });
});

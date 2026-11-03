import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { pointInPolygon } from '../../src/sim/geometry';
import { checkInvariants } from '../../src/sim/invariants';
import { reduce } from '../../src/sim/reduce';
import { presenceDraw, streetPets } from '../../src/sim/rules/streetPresence';
import { scenePet } from '../../src/sim/space';
import type { GameState, PetId, RoomId } from '../../src/sim/state';
import { initialState } from '../../src/sim/state';
import { parseSaveValue, SAVE_SCHEMA_VERSION } from '../../src/sim/state.schema';

/** 2026-11-03 indoor / outdoor presence: the timed roll (tuning.presenceRollMs / presenceOutP / presenceInP), the own-room
 * rule, the doors the pets appear at, never in two places, row 23, persistence. */
const content = loadContent();
const { presenceRollMs, presenceOutP, presenceInP } = content.tuning;
const tick = (dtMs = 100): Action => ({ type: 'tick', dtMs, move: { x: 0, y: 0 } });
const HOUSE_PETS: PetId[] = ['dog', 'owl'];
const ROOM_OF: Record<PetId, RoomId> = { dog: 'dog-room', owl: 'owl-room' };
const HOUSE_OF: Record<PetId, string> = { dog: 'starter-house', owl: 'pet-house' };

function mateArrived(): GameState {
  const loaded = parseSaveValue(content, JSON.parse(readFileSync('tests/view/capture/mate-arrived.real.json', 'utf8')));
  if (!('state' in loaded)) throw new Error(`discarded: ${loaded.discarded}`);
  return loaded.state;
}

/** The mate-arrived save on the street with the Dog and the Owl at ≥ 1 Heart (wants are a prefix: invariant 2), the roll armed. */
function withHearts(state = mateArrived(), petIds: PetId[] = HOUSE_PETS): GameState {
  const pets = { ...state.pets };
  for (const petId of petIds) {
    const first = content.pets[petId].wants[0].id;
    const already = pets[petId].hearts >= 1;
    pets[petId] = { ...pets[petId], introduced: true, ...(already ? {} : { hearts: 1, fulfilledWantIds: [first] }) };
  }
  return { ...state, pets, dialogue: { current: null, queue: [] }, presence: { rollInMs: presenceRollMs, rolls: 0 } };
}

function apply(state: GameState, action: Action): { state: GameState; events: SimEvent[] } {
  const result = reduce(content, state, action);
  return { state: result.state, events: result.events };
}

/** One forced roll: the countdown at its last millisecond, then a tick. */
function rollOnce(state: GameState): { state: GameState; events: SimEvent[] } {
  return apply({ ...state, presence: { ...state.presence, rollInMs: 1 } }, tick());
}

/** The player standing in `roomId` (play mode, nothing open), the pets as given. */
function inRoom(state: GameState, roomId: RoomId): GameState {
  const [point] = content.rooms[roomId].wanderPoints;
  return { ...state, scene: { kind: 'interior', roomId }, mode: 'play', avatar: { ...state.avatar, x: point.x, y: point.y, immunityMs: 0 } };
}

/** Stand on a house's door on the street and step once: a real entry through tick step 2. */
function enterHouse(state: GameState, projectId: string): { state: GameState; events: SimEvent[] } {
  const house = content.street.houses.find(candidate => candidate.projectId === projectId)!;
  const { rect } = house.door;
  return apply({ ...state, avatar: { ...state.avatar, x: rect.x + rect.w / 2, y: rect.y + rect.h / 2, immunityMs: 0 } }, tick());
}

/** Stand on the room's street door and step once: a real street arrival through tick step 2. */
function leaveRoom(state: GameState, roomId: RoomId): { state: GameState; events: SimEvent[] } {
  const door = content.rooms[roomId].doors.find(candidate => candidate.target.scene === 'street')!;
  const at: GameState = { ...state, scene: { kind: 'interior', roomId }, mode: 'play',
    avatar: { ...state.avatar, x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2, immunityMs: 0 } };
  return apply(at, tick());
}

const allOut = (state: GameState) => apply(state, { type: 'debugSetPetsOutside', mode: 'all' }).state;
const rollMode = (state: GameState) => apply(state, { type: 'debugSetPetsOutside', mode: 'roll' }).state;
const outsideEvents = (events: SimEvent[]) => events.filter(event => event.type === 'pet.outside');
const outsideOf = (state: GameState) => HOUSE_PETS.map(petId => state.pets[petId].outside);
const streams = (state: GameState) => [state.feed.rngState, ...Object.values(state.pets).map(pet => pet.rngState)];
const roomDoor = (roomId: RoomId) => content.rooms[roomId].doors.find(door => door.target.scene === 'street')!.spawn;
const houseDoor = (projectId: string) => content.street.houses.find(house => house.projectId === projectId)!.door.spawn;

describe('PRESENCE-01 the draw is pure, seeded, and leaves every RNG stream alone', () => {
  it('same inputs, same value in [0, 1); the shipped thresholds', () => {
    for (let roll = 1; roll <= 50; roll++) {
      const value = presenceDraw(42, 'dog', roll);
      expect(value).toBe(presenceDraw(42, 'dog', roll));
      expect(value).toBeGreaterThanOrEqual(0); expect(value).toBeLessThan(1);
    }
    expect([presenceRollMs, presenceOutP, presenceInP]).toEqual([8000, 0.35, 0.15]);
  });
  it.each([1, 42, 1234])('seed %i: the share below presenceOutP over rolls 1..2000 lies within ±0.05 of it, for dog and owl', seed => {
    for (const petId of HOUSE_PETS) {
      let count = 0;
      for (let roll = 1; roll <= 2000; roll++) if (presenceDraw(seed, petId, roll) < presenceOutP) count++;
      expect(Math.abs(count / 2000 - presenceOutP)).toBeLessThanOrEqual(0.05);
    }
  });
  it('a roll tick leaves every pets[*].rngState and feed.rngState byte-identical', () => {
    const before = { ...withHearts(), session: { ...withHearts().session, eventIntervalMs: null } };
    const { state } = rollOnce(before);
    expect(state.presence.rolls).toBe(1);
    expect(streams(state)).toEqual(streams(before));
  });
});

describe('PRESENCE-02 the countdown', () => {
  it('starts at presenceRollMs with 0 rolls, counts down per tick, re-arms at zero and counts the roll; dt 0 is a no-op', () => {
    const fresh = initialState(content, 7);
    expect(fresh.presence).toEqual({ rollInMs: presenceRollMs, rolls: 0 });
    let state = withHearts();
    state = apply(state, tick(100)).state;
    expect(state.presence).toEqual({ rollInMs: presenceRollMs - 100, rolls: 0 });
    expect(apply(state, tick(0)).state.presence).toEqual(state.presence);
    for (let elapsed = 100; elapsed < presenceRollMs; elapsed += 100) state = apply(state, tick(100)).state;
    expect(state.presence).toEqual({ rollInMs: presenceRollMs, rolls: 1 });
  });
});

describe('PRESENCE-03 inside with the player on the street: out with presenceOutP per roll', () => {
  it('each roll flips an inside pet out exactly when its draw is below presenceOutP; it appears idle at its house door', () => {
    let state = withHearts();
    let flips = 0;
    for (let i = 0; i < 60; i++) {
      const before = state;
      const result = rollOnce(state);
      state = result.state;
      for (const petId of HOUSE_PETS) {
        if (before.pets[petId].outside) continue;
        const expected = presenceDraw(state.session.seed, petId, state.presence.rolls) < presenceOutP;
        expect(state.pets[petId].outside, `${petId} roll ${state.presence.rolls}`).toBe(expected);
        if (!expected) continue;
        flips++;
        // placed idle at its house door in the flip (a same-tick greeting may already have it `meeting` there)
        const door = houseDoor(HOUSE_OF[petId]);
        expect(state.pets[petId].behaviour).toMatchObject({ x: door.x, y: door.y, target: null, verb: null });
        expect(outsideEvents(result.events)).toContainEqual({ type: 'pet.outside', petId, outside: true });
        expect(result.events.find(event => event.type === 'pet.phaseChanged' && event.petId === petId)).toMatchObject({ to: 'idle', reaction: null });
      }
      expect(checkInvariants(content, state)).toEqual([]);
      // keep both pets inside for the next iteration so every roll exercises this rule
      state = apply(state, { type: 'debugSetPetsOutside', mode: 'none' }).state;
      state = rollMode(state);
    }
    expect(flips).toBeGreaterThan(5);
  });
  it('a pet with 0 Hearts never comes out; the mate is always outside', () => {
    let state = withHearts(mateArrived(), ['owl']); // Dog 0 Hearts
    for (let i = 0; i < 40; i++) {
      state = rollOnce(state).state;
      expect(state.pets.dog.outside).toBe(false);
      expect(state.pets['owl-mate'].outside).toBe(true);
    }
  });
  it('nothing changes between rolls: a street arrival or a house entry flips no pet in that dispatch', () => {
    const out = allOut(withHearts());
    const entered = enterHouse(rollMode(out), 'pet-house');
    expect(entered.state.scene).toEqual({ kind: 'interior', roomId: 'owl-room' });
    expect(outsideEvents(entered.events)).toEqual([]);
    expect(entered.state.pets.owl.outside).toBe(true);
    const left = leaveRoom(withHearts(), 'dog-room');
    expect(left.events.some(event => event.type === 'scene.changed')).toBe(true);
    expect(outsideEvents(left.events)).toEqual([]);
    expect(outsideOf(left.state)).toEqual([false, false]);
  });
});

describe('PRESENCE-04 outside: back into its own house with presenceInP per roll, wherever the player is', () => {
  it('on the street each roll flips an outside pet in exactly when its draw is below presenceInP; it appears idle at its room\'s street door', () => {
    let state = withHearts();
    let flips = 0;
    for (let i = 0; i < 80; i++) {
      state = rollMode(allOut(state));
      const before = state;
      const result = rollOnce(state);
      state = result.state;
      for (const petId of HOUSE_PETS) {
        const expectedIn = before.pets[petId].behaviour.phase !== 'meeting' &&
          presenceDraw(state.session.seed, petId, state.presence.rolls) < presenceInP;
        expect(state.pets[petId].outside, `${petId} roll ${state.presence.rolls}`).toBe(!expectedIn);
        if (!expectedIn) continue;
        flips++;
        const door = roomDoor(ROOM_OF[petId]);
        expect(state.pets[petId].behaviour).toMatchObject({ phase: 'idle', x: door.x, y: door.y, reaction: null });
        expect(outsideEvents(result.events)).toContainEqual({ type: 'pet.outside', petId, outside: false });
      }
      expect(checkInvariants(content, state)).toEqual([]);
    }
    expect(flips).toBeGreaterThan(3);
  });
  it('with the player in another building the outside pet still rolls to go home; the inside pet of that other building stays in', () => {
    let state = inRoom(rollMode(allOut(withHearts())), 'owl-room');
    state = rollOnce(state).state; // the Owl is brought home by the own-room rule
    expect(state.pets.owl.outside).toBe(false);
    let wentIn = false;
    for (let i = 0; i < 80 && !wentIn; i++) {
      const result = rollOnce(state);
      state = result.state;
      expect(state.pets.owl.outside).toBe(false);
      const expectedIn = presenceDraw(state.session.seed, 'dog', state.presence.rolls) < presenceInP;
      expect(state.pets.dog.outside).toBe(!expectedIn);
      wentIn = expectedIn;
    }
    expect(wentIn).toBe(true);
    for (let i = 0; i < 40; i++) { // inside + player elsewhere: never out
      state = rollOnce(state).state;
      expect(outsideOf(state)).toEqual([false, false]);
    }
  });
});

describe('PRESENCE-04b the meeting guard', () => {
  it('a pet mid-meeting is not taken off the street by the roll', () => {
    const base = rollMode(allOut(withHearts()));
    const meeting = { ...base, pets: { ...base.pets, dog: { ...base.pets.dog, behaviour: { ...base.pets.dog.behaviour, phase: 'meeting' as const } } } };
    for (let i = 0; i < 40; i++) {
      const { state } = rollOnce({ ...meeting, presence: { ...meeting.presence, rolls: i } });
      expect(state.pets.dog.outside).toBe(true);
    }
  });
});

describe('PRESENCE-05 the player in the pet\'s own room: home within presenceRollMs, then it stays', () => {
  it('entering with the Dog out: no flip on entry; the next roll brings it to the room\'s street door with its greeting pending; the greeting then plays', () => {
    const out = rollMode(allOut(withHearts()));
    const entered = enterHouse(out, 'starter-house');
    expect(entered.state.pets.dog.outside).toBe(true);
    expect(scenePet(content, entered.state)).toBeNull();
    expect(checkInvariants(content, entered.state)).toEqual([]);
    // the pet is not stepped while out
    const idle = apply(entered.state, tick()).state;
    expect(idle.pets.dog.behaviour).toEqual(entered.state.pets.dog.behaviour);
    expect(idle.presence.rollInMs).toBeLessThanOrEqual(presenceRollMs);
    let state = idle;
    let elapsed = 0;
    while (state.pets.dog.outside) {
      state = apply(state, tick(100)).state; elapsed += 100;
      expect(elapsed).toBeLessThanOrEqual(presenceRollMs);
    }
    const door = roomDoor('dog-room');
    expect(state.pets.dog.behaviour).toMatchObject({ phase: 'idle', x: door.x, y: door.y, reaction: 'greeting' }); // timer: greetingDelayMs, already ticking
    expect(scenePet(content, state)?.petId).toBe('dog');
    expect(checkInvariants(content, state)).toEqual([]);
    const greeted: SimEvent[] = [];
    for (let i = 0; i < 20 && greeted.length === 0; i++) {
      const result = apply(state, tick(100));
      state = result.state;
      greeted.push(...result.events.filter(event => event.type === 'pet.reacted' && event.petId === 'dog' && event.reaction === 'greeting'));
    }
    expect(greeted).toHaveLength(1);
    expect(state.pets.dog.behaviour.phase).toBe('walking');
  });
  it('an inside pet with the player in its room never goes out, in mode roll and in mode all', () => {
    for (const mode of ['roll', 'all'] as const) {
      let state = apply(inRoom(withHearts(), 'dog-room'), { type: 'debugSetPetsOutside', mode }).state;
      for (let i = 0; i < 60; i++) {
        state = rollOnce(state).state;
        expect(state.pets.dog.outside, mode).toBe(false);
      }
    }
  });
});

describe('PRESENCE-06 never in two places', () => {
  it('an outside resident in its own room: not the scene pet, a tap is petNotHere, a placed liked charm draws no reaction', () => {
    const state = inRoom(rollMode(allOut(withHearts())), 'dog-room');
    expect(scenePet(content, state)).toBeNull();
    expect(reduce(content, state, { type: 'tapPet', petId: 'dog' }).events[0]).toMatchObject({ type: 'action.rejected', reason: 'petNotHere' });
    const design = apply(state, { type: 'setDesignMode', on: true }).state;
    const liked = content.pets.dog.likes[0].tag;
    const typeId = Object.values(content.charms.types).find(type => type.tags.includes(liked) && design.inventory.counts[type.id] > 0)!.id;
    const slot = content.rooms['dog-room'].slots.find(candidate => candidate.sizeClass === Object.values(content.charms.types).find(t => t.id === typeId)!.sizeClass)!;
    const placed = apply(design, { type: 'placeCharm', slotId: slot.id, typeId });
    expect(placed.events.some(event => event.type === 'charm.placed')).toBe(true);
    expect(placed.events.filter(event => event.type === 'pet.reacted')).toEqual([]);
    expect(placed.state.pets.dog.behaviour).toEqual(state.pets.dog.behaviour);
  });
  it('an inside house pet is not stepped on the street; an outside one answers a tap there', () => {
    const inside = withHearts();
    expect(reduce(content, inside, tick()).state.pets.dog.behaviour).toEqual(inside.pets.dog.behaviour);
    expect(reduce(content, inside, { type: 'tapPet', petId: 'dog' }).events[0]).toMatchObject({ type: 'action.rejected', reason: 'petNotHere' });
    const out = allOut(inside);
    expect(reduce(content, out, { type: 'tapPet', petId: 'dog' }).events[0]).toMatchObject({ type: 'pet.tapped', petId: 'dog' });
  });
});

describe('PRESENCE-07 street stepping among W(p) with the roll live', () => {
  const W: Record<string, string[]> = { dog: ['starter-w1', 'starter-w2', 'street-meet'], owl: ['pet-w1', 'pet-w2', 'street-meet'],
    'owl-mate': ['garden-w1', 'garden-w2', 'street-meet'] };
  it('mode all: every street pet wanders only in W(p), never the same target twice, inside the walk area; invariants hold', () => {
    let state = allOut(withHearts());
    expect(streetPets(content, state).map(pet => pet.petId)).toEqual(['dog', 'owl-mate', 'owl']);
    const targets: Record<string, string[]> = { dog: [], owl: [], 'owl-mate': [] };
    for (let i = 0; i < 3000; i++) { // 5 min at 100 ms, 37 rolls
      const result = reduce(content, state, tick());
      state = result.state;
      for (const event of result.events)
        if (event.type === 'pet.phaseChanged' && event.to === 'walking' && event.target && 'wanderPointId' in event.target)
          targets[event.petId].push(event.target.wanderPointId);
      for (const petId of Object.keys(W)) expect(pointInPolygon(state.pets[petId].behaviour, content.street.walkArea)).toBe(true);
    }
    expect(state.presence.rolls).toBe(37);
    for (const [petId, list] of Object.entries(targets)) {
      expect(list.length, petId).toBeGreaterThan(4);
      list.forEach((target, i) => { expect(W[petId]).toContain(target); if (i > 0) expect(target, `${petId} #${i}`).not.toBe(list[i - 1]); });
    }
    expect(checkInvariants(content, state)).toEqual([]);
  });
  it('mode roll on the street for 10 minutes: pets come and go, the drawn set always equals the outside set, invariants hold', () => {
    let state = withHearts();
    const flips: SimEvent[] = [];
    for (let i = 0; i < 6000; i++) {
      const result = reduce(content, state, tick());
      state = result.state;
      flips.push(...outsideEvents(result.events));
      if (i % 50 === 0) {
        expect(checkInvariants(content, state)).toEqual([]);
        const drawn = streetPets(content, state).map(pet => pet.petId);
        for (const petId of HOUSE_PETS) expect(drawn.includes(petId)).toBe(state.pets[petId].outside);
      }
    }
    expect(flips.filter(event => event.type === 'pet.outside' && event.outside).length).toBeGreaterThan(2);
    expect(flips.filter(event => event.type === 'pet.outside' && !event.outside).length).toBeGreaterThan(0);
  });
});

describe('PRESENCE-08 debugSetPetsOutside (sim half)', () => {
  it('all -> every ≥ 1 Heart pet out at once, in any scene, except the player\'s own room\'s; none -> all in; roll -> no change', () => {
    const street = withHearts();
    const all = apply(street, { type: 'debugSetPetsOutside', mode: 'all' });
    expect(all.events[0]).toMatchObject({ type: 'debug.applied' });
    expect(outsideOf(all.state)).toEqual([true, true]);
    expect(all.state.session.petsOutside).toBe('all');
    const none = apply(all.state, { type: 'debugSetPetsOutside', mode: 'none' });
    expect(outsideOf(none.state)).toEqual([false, false]);
    expect(outsideEvents(none.events)).toHaveLength(2);
    const roll = apply(all.state, { type: 'debugSetPetsOutside', mode: 'roll' });
    expect(outsideOf(roll.state)).toEqual([true, true]);
    expect(outsideEvents(roll.events)).toEqual([]);
    const indoors = apply(inRoom(withHearts(), 'dog-room'), { type: 'debugSetPetsOutside', mode: 'all' });
    expect(outsideOf(indoors.state)).toEqual([false, true]);
    expect(checkInvariants(content, indoors.state)).toEqual([]);
  });
  it('a bad mode is rejected', () => {
    const state = withHearts();
    const result = reduce(content, state, { type: 'debugSetPetsOutside', mode: 'sometimes' } as unknown as Action);
    expect(result.state).toBe(state);
    expect(result.events[0]).toMatchObject({ type: 'action.rejected' });
  });
});

describe('PRESENCE-09 persistence', () => {
  it('presence round-trips; a v2 save without it (or petsOutside) loads with { 0, 0 } / roll and rolls on its first tick; reset re-arms; version still 2', () => {
    const state = rollOnce(withHearts()).state;
    const save = JSON.parse(JSON.stringify({ schemaVersion: SAVE_SCHEMA_VERSION, savedAt: 'x', state }));
    expect(parseSaveValue(content, save)).toEqual({ state });
    const raw = JSON.parse(readFileSync('tests/view/capture/mate-arrived.real.json', 'utf8'));
    delete raw.state.presence; delete raw.state.session.petsOutside;
    const loaded = parseSaveValue(content, raw) as { state: GameState };
    expect([loaded.state.presence, loaded.state.session.petsOutside]).toEqual([{ rollInMs: 0, rolls: 0 }, 'roll']);
    expect(apply(loaded.state, tick()).state.presence).toEqual({ rollInMs: presenceRollMs, rolls: 1 });
    expect(apply(state, { type: 'reset' }).state.presence).toEqual({ rollInMs: presenceRollMs, rolls: 0 });
    expect(SAVE_SCHEMA_VERSION).toBe(2);
  });
});

describe('PRESENCE-10 invariant 10 across presence', () => {
  it('an outside Dog in street coordinates passes; an inside Dog off its room walk area fails 10; an outside Dog with the player in its room passes (11 retired)', () => {
    const out = allOut(withHearts());
    expect(checkInvariants(content, out)).toEqual([]);
    const inside = withHearts();
    const offRoom = { ...inside, pets: { ...inside.pets, dog: { ...inside.pets.dog, behaviour: { ...inside.pets.dog.behaviour, x: 650, y: 948 } } } };
    expect(checkInvariants(content, offRoom).some(message => message.startsWith('invariant 10'))).toBe(true);
    expect(checkInvariants(content, inRoom(out, 'dog-room'))).toEqual([]);
  });
});

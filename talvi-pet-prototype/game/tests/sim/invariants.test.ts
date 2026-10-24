import { describe, expect, it } from 'vitest';
import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { pointInPolygon } from '../../src/sim/geometry';
import { checkInvariants } from '../../src/sim/invariants';
import { reduce } from '../../src/sim/reduce';
import { starsOf } from '../../src/sim/select';
import { initialState, type GameState } from '../../src/sim/state';
import { nextAction } from './arbitrary';
import { validContent } from '../content/helpers';
import { deepFreeze, dogRoomDesign } from './helpers';

const SEEDS = [1, 2, 3] as const;
const STEPS = 500;
const REACHED = ['charm.placed', 'charm.removed', 'want.fulfilled', 'celebration.started', 'arrival.finished',
  'dialogue.opened', 'scene.changed', 'debug.applied'] as const;

/** Invariant 4 recomputed in the test, independently of both `starsOf` and `checkInvariants`. */
function expectStarsRecomputed(content: Content, state: GameState): void {
  for (const [roomId, room] of Object.entries(state.rooms)) {
    const values = Object.values(room.placements);
    const distinct = new Set(values).size;
    const points = distinct * content.tuning.starsFirstCopy + (values.length - distinct) * content.tuning.starsRepeat;
    expect(starsOf(content, state, roomId)).toEqual({ points, max: 4 * 12 });
  }
}

type Run = { counts: Record<string, number>; actions: Action[] };

/** FX-ARB: one seed × 500 generated actions through two reducers, every core §8 property after every step. */
function runArbitrary(content: Content, seed: number): Run {
  let state = initialState(content, seed), replay = initialState(content, seed), cursor = seed;
  const counts: Record<string, number> = Object.fromEntries(REACHED.map(type => [type, 0]));
  const actions: Action[] = [];
  for (let index = 0; index < STEPS; index++) {
    const generated = nextAction(content, state, cursor); cursor = generated.seed;
    actions.push(generated.action);
    const first = reduce(content, deepFreeze(state), generated.action);
    const second = reduce(content, deepFreeze(replay), generated.action);
    expect(second).toEqual(first);
    expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state);
    expect(first.events.filter(event => event.type === 'action.rejected')).toEqual([]);
    expect(checkInvariants(content, first.state)).toEqual([]);
    expectStarsRecomputed(content, first.state);
    if (first.state.scene.kind === 'interior') {
      const room = content.rooms[first.state.scene.roomId];
      expect(pointInPolygon(first.state.pets[room.residentPetId].behaviour, room.walkArea)).toBe(true);
    }
    for (const event of first.events) if (event.type in counts) counts[event.type]++;
    state = first.state; replay = second.state;
  }
  return { counts, actions };
}

const reached = (run: Run, type: typeof REACHED[number]) => run.counts[type] > 0;

describe('FX-ARB harness (FX-CONTENT-MIN, seeds 1..3 × 500 actions)', () => {
  const content = validContent();
  const runs = new Map(SEEDS.map(seed => [seed, runArbitrary(content, seed)]));
  const all = [...runs.values()];

  it.each(SEEDS)('VERIFY-CORE-002..011 FX-ARB seed %s: checkInvariants → [] after every step, two reducers deep-equal (states and events), JSON round trip, stars recomputed, pet inside walkArea; every family reached, reset ≤ 1 %', seed => {
    const run = runs.get(seed)!;
    const resets = run.actions.filter(action => action.type === 'reset').length;
    process.stdout.write(`FX-ARB seed ${seed}: ${JSON.stringify(run.counts)} resets ${resets}\n`);
    for (const type of REACHED) expect(run.counts[type], type).toBeGreaterThan(0);
    expect(resets).toBeLessThanOrEqual(STEPS / 100);
  });
  it('VERIFY-CORE-002 = VERIFY-MEC-002-022: invariant 1 (0 ≤ ack ≤ phaseOf ≤ 5, 0 ≤ cents ≤ goal) held over 3 × 500 steps with celebrations', () => {
    expect(all.every(run => run.actions.length === STEPS && reached(run, 'celebration.started'))).toBe(true);
  });
  it('VERIFY-CORE-003 = VERIFY-MEC-009-018: invariant 2 (hearts = fulfilled prefix of wants) held; every seed fulfilled a want', () => {
    expect(all.every(run => reached(run, 'want.fulfilled'))).toBe(true);
  });
  it('VERIFY-CORE-004 = VERIFY-MEC-005-011: invariant 3 (placements owned, size class matches) held through placements and removals', () => {
    expect(all.every(run => reached(run, 'charm.placed') && reached(run, 'charm.removed'))).toBe(true);
  });
  it('VERIFY-CORE-005 = VERIFY-MEC-006-008: invariant 4 recomputed in the test equals starsOf, max = 4 × 12', () => {
    expect(all.every(run => reached(run, 'charm.placed'))).toBe(true);
  });
  it('VERIFY-CORE-006 = VERIFY-MEC-001-015: invariant 5 (celebration ⇒ street, design ⇒ interior) held across scene changes', () => {
    expect(all.every(run => reached(run, 'scene.changed'))).toBe(true);
  });
  it('VERIFY-CORE-007: invariant 6 (complete ⇒ ack 5; door ⇔ complete && arrivalDone) held through an arrival per seed', () => {
    expect(all.every(run => reached(run, 'arrival.finished'))).toBe(true);
  });
  it('VERIFY-CORE-010: invariant 9 (dialogue shape) held through dialogues per seed', () => {
    expect(all.every(run => reached(run, 'dialogue.opened'))).toBe(true);
  });
});

function feedOf(content: Content, state: GameState, moves: { x: number; y: number }[]) {
  const fired: SimEvent[] = [];
  let current = state;
  for (const move of moves) {
    const result = reduce(content, current, { type: 'tick', dtMs: 100, move });
    fired.push(...result.events.filter(event => event.type === 'roundup.fired'));
    current = result.state;
  }
  return { fired, rngState: current.feed.rngState };
}

it('VERIFY-CORE-009 (feed, = VERIFY-MEC-002-003): same seed + different player actions → identical roundup.fired sequence and feed.rngState', () => {
  const content = validContent();
  const fresh = initialState(content, 7);
  const start = { ...fresh, session: { ...fresh.session, orientationShown: true, eventIntervalMs: 500 } };
  const still = feedOf(content, start, Array.from({ length: 300 }, () => ({ x: 0, y: 0 })));
  const walking = feedOf(content, start, Array.from({ length: 300 }, (_, index) => ({ x: Math.cos(index), y: Math.sin(index) })));
  expect(still.fired.length).toBeGreaterThan(5);
  expect(walking).toEqual(still);
});

it('VERIFY-CORE-009 (pets, = VERIFY-MEC-007-014) / VERIFY-CORE-008 / VERIFY-CORE-011: same actions + different seed → identical pet decision sequence', () => {
  const { content, state: start } = dogRoomDesign(1);
  const reseeded = { ...start, session: { ...start.session, seed: 2 }, feed: initialState(content, 2).feed };
  let state: GameState = { ...start, mode: 'play' }, other: GameState = { ...reseeded, mode: 'play' };
  let cursor = 1, petEvents = 0;
  for (let index = 0; index < 2000; index++) {
    const generated = nextAction(content, state, cursor, false); cursor = generated.seed;
    const first = reduce(content, state, generated.action), second = reduce(content, other, generated.action);
    const pets = (events: SimEvent[]) => events.filter(event => event.type.startsWith('pet.'));
    expect(pets(second.events)).toEqual(pets(first.events));
    expect(second.state.pets).toEqual(first.state.pets);
    expect(checkInvariants(content, first.state)).toEqual([]);
    petEvents += pets(first.events).length;
    state = first.state; other = second.state;
  }
  expect(petEvents).toBeGreaterThan(10);
});

/** A reachable valid state: FX-CONTENT-MIN Dog room, Lamp placed through `reduce`, back in play mode. */
function validRoomState(): { content: Content; state: GameState } {
  const { content, state } = dogRoomDesign(1);
  const placed = reduce(content, state, { type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' }).state;
  return { content, state: reduce(content, placed, { type: 'setDesignMode', on: false }).state };
}

const breakers: [number, string, (state: GameState) => void][] = [
  [1, 'acknowledgedPhase above phaseOf', state => { state.projects['pet-house'].acknowledgedPhase = 3; }],
  [2, 'hearts ≠ fulfilledWantIds.length', state => { state.pets.dog.hearts = 1; }],
  [3, 'placed type not owned', state => { state.inventory.ownedTypeIds = state.inventory.ownedTypeIds.filter(id => id !== 'lamp'); }],
  [5, 'design mode on the street', state => { state.scene = { kind: 'street' }; }],
  [6, 'complete with acknowledgedPhase 4', state => {
    Object.assign(state.projects['pet-house'], { currentCents: 1500, acknowledgedPhase: 4, complete: true });
  }],
  [7, 'an undefined field (not plain JSON)', state => { (state.session as { testerLabel?: string }).testerLabel = undefined; }],
  [9, 'queue without a current script', state => {
    state.dialogue.queue = [{ source: 'intro', speaker: { petId: 'dog' }, lines: ['Hi'], index: 0 }];
  }],
  [10, 'resident pet outside walkArea', state => { state.pets.dog.behaviour.x = -1000; }],
];

it('core §8 invariant checkInvariants on a valid reachable state → []', () => {
  const { content, state } = validRoomState();
  expect(checkInvariants(deepFreeze(content), deepFreeze(state))).toEqual([]);
});

it.each(breakers)('core §8 invariant %s violation (%s) yields exactly one message naming it', (number, _label, edit) => {
  const { content, state } = validRoomState();
  const broken = structuredClone(state);
  if (number === 5) broken.mode = 'design';
  edit(broken);
  const messages = checkInvariants(content, deepFreeze(broken));
  expect(messages).toHaveLength(1);
  expect(messages[0]).toMatch(new RegExp(`^invariant ${number}: `));
});

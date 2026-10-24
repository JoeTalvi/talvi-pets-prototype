import { expect, it } from 'vitest';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { mulberry32 } from '../../src/sim/rng';
import { generateRoundup } from '../../src/sim/rules/feed';
import { initialState, type GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { advance, deepFreeze, tick } from './helpers';

const fired = (events: SimEvent[]) => events.filter(event => event.type === 'roundup.fired');

function dogRoom(seed: number): GameState {
  const state = initialState(validContent(), seed);
  state.scene = { kind: 'interior', roomId: 'dog-room' };
  state.session.orientationShown = true; state.pets.dog.introduced = true;
  return state;
}

it('VERIFY-MEC-002-002 one round-up on the 200th 100 ms tick, credited to pet-house', () => {
  const content = validContent();
  let state = initialState(content, 1);
  const firedAt: number[] = [];
  let last: SimEvent[] = [];
  for (let index = 1; index <= 200; index++) {
    const result = reduce(content, deepFreeze(state), tick(0, 0, 100));
    if (fired(result.events).length) { firedAt.push(index); last = result.events; }
    state = result.state;
  }
  expect(firedAt).toEqual([200]);
  const event = fired(last)[0] as Extract<SimEvent, { type: 'roundup.fired' }>;
  expect(event.projectId).toBe('pet-house');
  expect(event.changeCents).toBeGreaterThanOrEqual(1);
  expect(event.changeCents).toBeLessThanOrEqual(99);
  expect(event.amountCents % 100).toBe(100 - event.changeCents);
  expect(event.currentCents).toBe(state.projects['pet-house'].currentCents);
  expect(state.projects['pet-house'].currentCents).toBe(event.changeCents);
  expect(state.feed.eventCount).toBe(1);
  expect(state.feed.sinceLastEventMs).toBe(0);
  expect(JSON.parse(JSON.stringify(state))).toEqual(state);
});

function runTenMinutes(seed: number, decorate: boolean) {
  const content = validContent();
  let state = dogRoom(seed);
  const events: SimEvent[] = [];
  const design: Action[] = [{ type: 'setDesignMode', on: true }, { type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' },
    { type: 'removeCharm', slotId: 'floor-1' }, { type: 'setDesignMode', on: false }];
  for (let index = 0; index < 6000; index++) {
    if (decorate && index % 50 === 0) state = reduce(content, state, design[(index / 50) % 4]).state;
    const result = reduce(content, state, tick(0, 0, 100));
    state = result.state; events.push(...result.events);
  }
  return { state, fired: fired(events) };
}

it('VERIFY-MEC-002-003 partial: feed determinism under interleaved setDesignMode/placeCharm/removeCharm (FX-ARB form is WORK-003-5 CORE-009)', () => {
  const plain = runTenMinutes(1, false), decorated = runTenMinutes(1, true);
  expect(plain.fired.length).toBeGreaterThan(10); // the feed stops once pet-house reaches its goal
  expect(decorated.fired).toEqual(plain.fired);
  expect(decorated.state.feed.rngState).toBe(plain.state.feed.rngState);
  expect(runTenMinutes(2, false).state.feed.rngState).not.toBe(plain.state.feed.rngState);
});

it('VERIFY-MEC-002-004 whole-dollar re-roll: toll gives 101/99 and 1000 events are never whole dollars', () => {
  const content = validContent();
  const seed = Array.from({ length: 200 }, (_, index) => index + 1)
    .find(candidate => content.merchants[Math.floor(mulberry32(candidate).value * 3)].id === 'toll');
  expect(seed).toBeDefined();
  let state = initialState(content, seed!);
  const first = generateRoundup(content, deepFreeze(structuredClone(state)));
  expect(first.events[0]).toMatchObject({ merchantId: 'toll', merchantName: 'Toll', amountCents: 101, changeCents: 99 });
  for (let index = 0; index < 1000; index++) {
    state.projects['pet-house'].currentCents = 0;
    const result = generateRoundup(content, state);
    const event = result.events[0] as Extract<SimEvent, { type: 'roundup.fired' }>;
    expect(event.amountCents % 100).not.toBe(0);
    expect(event.changeCents).toBeGreaterThanOrEqual(1);
    expect(event.changeCents).toBeLessThanOrEqual(99);
    state = structuredClone(result.state);
  }
  expect(state.feed.eventCount).toBe(1000);
});

it('VERIFY-MEC-002-004 draw order: r1 picks the merchant, r2 the amount', () => {
  const content = validContent(), state = initialState(content, 7);
  const r1 = mulberry32(state.feed.rngState), merchant = content.merchants[Math.floor(r1.value * 3)];
  const r2 = mulberry32(r1.seed);
  const amount = merchant.minCents + Math.floor(r2.value * (merchant.maxCents - merchant.minCents + 1));
  const result = generateRoundup(content, state);
  expect(result.events[0]).toMatchObject({ merchantId: merchant.id });
  if (amount % 100 !== 0) {
    expect(result.events[0]).toMatchObject({ amountCents: amount });
    expect(result.state.feed.rngState).toBe(r2.seed);
  }
});

it('VERIFY-MEC-002-006 partial: synthetic eventIntervalMs = null banks no time over 20 min (debugSetEventInterval form lands in WORK-003-4)', () => {
  const content = validContent(), state = initialState(content, 1);
  state.session.eventIntervalMs = null;
  const result = advance(reduce, content, deepFreeze(state), 20 * 60 * 1000);
  expect(fired(result.events)).toEqual([]);
  expect(result.state.feed.sinceLastEventMs).toBe(0);
  expect(result.state.feed).toEqual(state.feed);
});

it('MEC-002 §2.2 the feed stops banking time once no project is active', () => {
  const content = validContent(), state = initialState(content, 1);
  state.projects['pet-house'].currentCents = 1500;
  const result = advance(reduce, content, state, 60_000);
  expect(fired(result.events)).toEqual([]);
  expect(result.state.feed.sinceLastEventMs).toBe(0);
});

it('MEC-002 §2.2 roundup.fired precedes the credit events and carries currentCents after the cap', () => {
  const content = validContent(), state = initialState(content, 1);
  state.projects['pet-house'].currentCents = 1499;
  state.feed.sinceLastEventMs = 19_950;
  state.session.orientationShown = true; // the first-tick orientation (MEC-008) is not this row's subject
  const result = reduce(content, state, tick(0, 0, 100));
  expect(result.events.map(event => event.type)).toEqual(['roundup.fired', 'phase.reached', 'feed.stopped']);
  expect(result.events[0]).toMatchObject({ currentCents: 1500 });
  expect(result.state.feed.sinceLastEventMs).toBe(50);
});

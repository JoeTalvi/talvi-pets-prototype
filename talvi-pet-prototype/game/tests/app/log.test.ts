import { describe, expect, it } from 'vitest';
import { CONTROLLER_RECORD_TYPES, createLog, STORAGE_KEYS, type LogLine } from '../../src/app/log';
import { createPersistence } from '../../src/app/persistence';
import { createStore } from '../../src/app/store';
import type { Content } from '../../src/content/types';
import type { Action } from '../../src/sim/actions';
import { chooserTypes } from '../../src/sim/select';
import { initialState, type GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { eventNames } from '../fixtures/core-contract';
import { dogRoomDesign, owing } from '../sim/helpers';
import { headerFor, testClock, testLog } from './helpers';
import { createMemoryStorage, createQuotaStorage } from './memoryStorage';

const WALL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const EVIDENCE = process.env.TPP_EVIDENCE_DIR;

/** A started log attached to a store; each dispatch advances the clock by `stepMs`. */
function session(content: Content, state: GameState, storage: Storage = createMemoryStorage(), stepMs = 40) {
  const clock = testClock();
  const { log } = testLog(content, storage, clock);
  const store = createStore(content, state);
  log.start(headerFor(state));
  log.attach(store);
  const dispatch = (...actions: Action[]) => { for (const action of actions) { clock.advance(stepMs); store.dispatch(action); } };
  const drain = () => { while (store.getState().dialogue.current) dispatch({ type: 'advanceDialogue' }); };
  return { log, store, clock, dispatch, drain, storage };
}
const typed = (lines: LogLine[], type: string) => lines.filter(line => line.type === type);
const nonDecreasingIntegers = (lines: LogLine[]) =>
  lines.every((line, index) => Number.isInteger(line.t) && (index === 0 || line.t >= lines[index - 1].t));

describe('VERIFY-MEC-010-009 line schema', () => {
  it('VERIFY-MEC-010-009 JSONL lines {t, wall, type, …payload}; first line is a complete session.started at t 0', async () => {
    const { content, state } = dogRoomDesign();
    const { log, dispatch } = session(content, state);
    dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' }, { type: 'removeCharm', slotId: 'floor-1' },
      { type: 'setDesignMode', on: false }, { type: 'setDesignMode', on: true },
      { type: 'debugSetStarsVisible', on: false }, { type: 'debugSetMuted', on: true },
      { type: 'debugSetCurrent', projectId: 'pet-house', cents: 300 }, { type: 'tapPet', petId: 'dog' },
      { type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' }, { type: 'advanceDialogue' });
    const text = log.lines().map(line => JSON.stringify(line)).join('\n');
    const lines = text.split('\n').map(line => JSON.parse(line) as LogLine);
    expect(lines.length).toBeGreaterThanOrEqual(11);
    expect(nonDecreasingIntegers(lines)).toBe(true);
    const known = new Set<string>([...eventNames, ...CONTROLLER_RECORD_TYPES]);
    for (const line of lines) {
      expect(Object.keys(line).slice(0, 3)).toEqual(['t', 'wall', 'type']);
      expect(line.wall).toMatch(WALL);
      expect(known.has(line.type)).toBe(true);
      expect(line).not.toHaveProperty('stateAfter');
    }
    expect(lines[0]).toEqual({ t: 0, wall: expect.stringMatching(WALL), type: 'session.started', build: 'tpp-test',
      schemaVersion: 1, seed: 1, cadence: state.session.eventIntervalMs, feedPresentation: 'events', testerLabel: '',
      userAgent: 'vitest', viewport: { w: 1920, h: 885, dpr: 3 } });
    if (EVIDENCE) (await import('node:fs')).writeFileSync(`${EVIDENCE}/sample-log.jsonl`, `${text}\n`);
  });
});

describe('VERIFY-MEC-010-010 ring and mirror', () => {
  it('VERIFY-MEC-010-010 ring keeps 5,000 lines (oldest dropped); mirror ≤ 1 write/s and equals the ring on flush', () => {
    const content = validContent();
    const storage = createMemoryStorage();
    const clock = testClock();
    const log = createLog({ storage, ringLines: content.tuning.logRingLines, now: clock.now, wall: clock.wall });
    for (let index = 0; index < 5100; index += 1) { clock.advance(10); log.record('ui.debugPanel', { open: true, index }); }
    const lines = log.lines();
    expect(lines).toHaveLength(content.tuning.logRingLines);
    expect(lines[0].index).toBe(100);
    expect(storage.writes).toBeLessThanOrEqual(Math.ceil((5100 * 10) / 1000) + 1);
    log.flush();
    expect(storage.getItem(STORAGE_KEYS.log)).toBe(lines.map(line => JSON.stringify(line)).join('\n'));
  });

  it('VERIFY-MEC-010-010 the mirror survives a reload: start() keeps it and appends a new header; reset() clears it', () => {
    const content = validContent();
    const storage = createMemoryStorage();
    const first = testLog(content, storage).log;
    first.start(headerFor(initialState(content, 1)));
    first.record('ui.debugPanel', { open: true });
    first.flush();
    const second = testLog(content, storage).log;
    second.start(headerFor(initialState(content, 1)));
    expect(second.lines().map(line => line.type)).toEqual(['session.started', 'ui.debugPanel', 'session.started']);
    second.reset(headerFor(initialState(content, 1)));
    expect(second.lines()).toEqual([expect.objectContaining({ t: 0, type: 'session.started' })]);
    expect(storage.getItem(STORAGE_KEYS.log)).toBe(JSON.stringify(second.lines()[0]));
  });
});

describe('VERIFY-MEC-010-014 quota', () => {
  it('VERIFY-MEC-010-014 with a throwing Storage the game continues and exactly one log.quota is recorded', () => {
    const { content, state } = dogRoomDesign();
    const storage = createQuotaStorage();
    const { log, store, dispatch } = session(content, state, storage);
    const persistence = createPersistence({ storage, log, debounceMs: content.tuning.saveDebounceMs });
    persistence.attach(store);
    dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(store.getState()).not.toBe(state);
    expect(() => { log.flush(); persistence.flush(); log.flush(); }).not.toThrow();
    dispatch({ type: 'debugSetMuted', on: true });
    expect(() => persistence.flush()).not.toThrow();
    expect(store.getState().session.muted).toBe(true);
    expect(typed(log.lines(), 'log.quota')).toHaveLength(1);
    expect(typed(log.lines(), 'save.written')).toEqual([]);
    persistence.destroy();
  });
});

describe('VERIFY-MEC-010-015 trickle parity', () => {
  it('VERIFY-MEC-010-015 partial: node half only (toast/bar glide is WORK-021, not-run (user, play session)): events vs trickle logs match but for the header', () => {
    const content = validContent();
    const run = (feedPresentation: 'events' | 'trickle') => {
      const state = owing(content, 1, 300);
      state.session.feedPresentation = feedPresentation;
      const { log, dispatch } = session(content, state);
      dispatch({ type: 'debugSetEventInterval', ms: 1000 });
      for (let elapsed = 0; elapsed < 2500; elapsed += 100) dispatch({ type: 'tick', dtMs: 100, move: { x: 0, y: 0 } });
      dispatch({ type: 'debugSimulatePurchase' });
      return log.lines();
    };
    const events = run('events');
    const trickle = run('trickle');
    expect(typed(events, 'roundup.fired').length).toBeGreaterThanOrEqual(2);
    expect(trickle[0].feedPresentation).toBe('trickle');
    expect(trickle.map(line => line.type === 'session.started' ? { ...line, feedPresentation: 'events' } : line)).toEqual(events);
  });
});

describe('VERIFY-MEC-002-023 TEST-003 log', () => {
  it('VERIFY-MEC-002-023 completeNow.shown/taken carry priceCents 240 with integer t; roundup.fired carries the feed fields', () => {
    const content = validContent();
    const { log, dispatch } = session(content, owing(content, 1, 1260));
    dispatch({ type: 'acknowledgeProject', projectId: 'pet-house' }, { type: 'cutsceneFinished' },
      { type: 'skipWait' }, { type: 'closeReveal' });
    const lines = log.lines();
    expect(typed(lines, 'completeNow.shown')).toEqual([expect.objectContaining({ projectId: 'pet-house', priceCents: 240 })]);
    expect(typed(lines, 'completeNow.taken')).toEqual([expect.objectContaining({ priceCents: 240 })]);
    // skipWait fills Pet House to its goal, so no project is active afterwards (core §2 noActiveProject);
    // the roundup half runs on a session whose Pet House is still filling (journal FORK).
    const feed = session(content, owing(content, 1, 300));
    feed.dispatch({ type: 'debugSimulatePurchase' }, { type: 'debugSimulatePurchase' });
    const roundups = typed(feed.log.lines(), 'roundup.fired');
    expect(roundups).toHaveLength(2);
    for (const line of [...typed(lines, 'completeNow.shown'), ...typed(lines, 'completeNow.taken'), ...roundups])
      expect(Number.isInteger(line.t)).toBe(true);
    for (const line of roundups)
      expect(Object.keys(line)).toEqual(expect.arrayContaining(['merchantId', 'merchantName', 'amountCents', 'changeCents', 'currentCents']));
  });
});

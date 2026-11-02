import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { loadContent, type ContentFiles } from '../../src/content/load';
import type { Action } from '../../src/sim/actions';
import { reduce } from '../../src/sim/reduce';
import { chooserTypes } from '../../src/sim/select';
import { initialState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { advance, deepFreeze, eventsOf, orientationDone, owing, run } from './helpers';

/** FX-REAL: every `src/content/**\/*.json`, read with node:fs, loaded without a manifest. */
function realContent() {
  const root = 'src/content', data: ContentFiles = {};
  for (const name of readdirSync(root).filter(file => file.endsWith('.json')))
    data[name] = JSON.parse(readFileSync(join(root, name), 'utf8'));
  for (const dir of ['rooms', 'pets'])
    for (const name of readdirSync(join(root, dir)).filter(file => file.endsWith('.json')))
      data[`${dir}/${name}`] = JSON.parse(readFileSync(join(root, dir, name), 'utf8'));
  return loadContent(undefined, data);
}

const set = (cents: number): Action => ({ type: 'debugSetCurrent', projectId: 'pet-house', cents });

it('VERIFY-MEC-010-001 debugSetCurrent 1260 from ack 1 / 305: debug.applied then phase.reached 2, 3, 4; ack unchanged', () => {
  const content = validContent();
  const { state, results } = run(content, owing(content, 1, 305), [set(1260)]);
  expect(results[0].events).toEqual([{ type: 'debug.applied', action: set(1260) },
    ...[2, 3, 4].map(phase => ({ type: 'phase.reached', projectId: 'pet-house', phase, currentCents: 1260 }))]);
  expect(state.projects['pet-house']).toMatchObject({ currentCents: 1260, acknowledgedPhase: 1 });
});

it('VERIFY-MEC-010-002 debugSetCurrent 100 below the ack-1 floor is raised to 300 with adjusted', () => {
  const content = validContent();
  const { state, results } = run(content, owing(content, 1, 305), [set(100)]);
  expect(state.projects['pet-house'].currentCents).toBe(300);
  expect(results[0].events).toEqual([{ type: 'debug.applied', action: set(100),
    adjusted: { field: 'cents', requested: 100, applied: 300 } }]);
  const unknown: Action = { type: 'debugSetCurrent', projectId: 'nope', cents: 1 };
  expect(reduce(content, state, unknown).events).toEqual([{ type: 'action.rejected', action: unknown, reason: 'unknownProject' }]);
});

it('VERIFY-MEC-010-003 debugSetEventInterval null freezes the clock at 0; 100 is invalidInterval', () => {
  const content = validContent();
  const start = advance(reduce, content, initialState(content, 1), 1_000).state;
  const frozen = run(content, start, [{ type: 'debugSetEventInterval', ms: null }]).state;
  expect(frozen.feed.sinceLastEventMs).toBe(0);
  expect(frozen.session.eventIntervalMs).toBeNull();
  const ticked = advance(reduce, content, frozen, 1_000);
  expect(ticked.state.feed.sinceLastEventMs).toBe(0);
  expect(eventsOf(ticked.events, 'roundup.fired')).toEqual([]);
  const tooFast: Action = { type: 'debugSetEventInterval', ms: 100 };
  expect(reduce(content, deepFreeze(frozen), tooFast)).toEqual({ state: frozen,
    events: [{ type: 'action.rejected', action: tooFast, reason: 'invalidInterval' }] });
});

it('VERIFY-MEC-010-013 partial: node half (120 s of ticks) — frozen from initialState: zero roundup.fired, sinceLastEventMs stays 0', () => {
  const content = validContent();
  const frozen = run(content, initialState(content, 1234), [{ type: 'debugSetEventInterval', ms: null }]).state;
  const ticked = advance(reduce, content, frozen, 120_000);
  expect(eventsOf(ticked.events, 'roundup.fired')).toEqual([]);
  expect(ticked.state.feed.sinceLastEventMs).toBe(0);
  expect(ticked.state.session.eventIntervalMs).toBeNull();
  const control = advance(reduce, content, orientationDone(initialState(content, 1234)), 120_000); // same span unfrozen: the clock does fire
  expect(eventsOf(control.events, 'roundup.fired').length).toBeGreaterThan(0);
});

it('VERIFY-MEC-010-004 two reducers given debugSetSeed 7 produce identical round-ups over 100 s', () => {
  const content = validContent();
  const streams = [1, 2].map(seed => {
    const seeded = run(content, orientationDone(initialState(content, seed)), [{ type: 'debugSetSeed', seed: 7 }]).state;
    expect(seeded.feed).toEqual({ rngState: 7, sinceLastEventMs: 0, eventCount: 0 });
    expect(seeded.session.seed).toBe(7);
    return advance(reduce, content, seeded, 100_000);
  });
  expect(eventsOf(streams[1].events, 'roundup.fired')).toEqual(eventsOf(streams[0].events, 'roundup.fired'));
  expect(streams[1].state.feed.eventCount).toBe(streams[0].state.feed.eventCount);
  expect(streams[0].state.feed.eventCount).toBe(5);
});

it('VERIFY-MEC-010-005 debugJumpPhase 305 → 600 with phase.reached 2; debugCompleteProject → 1500; again alreadyComplete', () => {
  const content = validContent();
  const jump: Action = { type: 'debugJumpPhase', projectId: 'pet-house' };
  const complete: Action = { type: 'debugCompleteProject', projectId: 'pet-house' };
  const { state, results } = run(content, owing(content, 1, 305), [jump, complete, complete]);
  expect(results[0].events).toEqual([{ type: 'debug.applied', action: jump },
    { type: 'phase.reached', projectId: 'pet-house', phase: 2, currentCents: 600 }]);
  expect(results[1].state.projects['pet-house'].currentCents).toBe(1500);
  expect(results[2].events).toEqual([{ type: 'action.rejected', action: complete, reason: 'alreadyComplete' }]);
  expect(results[2].state).toBe(results[1].state);
  expect(state.projects['pet-house'].acknowledgedPhase).toBe(1);
});

it('VERIFY-MEC-010-006 debugUnlockAllTypes owns every type, starter order first, source debug', () => {
  const content = validContent();
  const action: Action = { type: 'debugUnlockAllTypes' };
  const { state, results } = run(content, initialState(content, 1), [action]);
  const starter = content.charms.starterSet;
  const rest = content.charms.types.map(type => type.id).filter(id => !starter.includes(id));
  expect(state.inventory.ownedTypeIds).toEqual([...starter, ...rest]);
  expect(results[0].events).toEqual([{ type: 'debug.applied', action }, { type: 'types.unlocked', typeIds: rest, source: 'debug' }]);
});

it('VERIFY-MEC-004-007 debugUnlockAllTypes on FX-REAL twice: every unowned type in file order, then []; small chooser starter first', () => {
  const content = realContent();
  const { state, results } = run(content, initialState(content, 1), [{ type: 'debugUnlockAllTypes' }, { type: 'debugUnlockAllTypes' }]);
  const starter = content.charms.starterSet;
  const rest = content.charms.types.map(type => type.id).filter(id => !starter.includes(id));
  expect(results[0].events[1]).toEqual({ type: 'types.unlocked', typeIds: rest, source: 'debug' });
  expect(results[1].events[1]).toEqual({ type: 'types.unlocked', typeIds: [], source: 'debug' });
  const roomId = Object.keys(content.rooms)[0];
  const small = content.rooms[roomId].slots.find(slot => slot.sizeClass === 'small')!;
  const inside = { ...state, scene: { kind: 'interior' as const, roomId } };
  const isSmall = (id: string) => content.charms.types.find(type => type.id === id)!.sizeClass === 'small';
  expect(chooserTypes(content, inside, small.id).map(type => type.id))
    .toEqual([...starter.filter(isSmall), ...rest.filter(isSmall)]);
});

it('VERIFY-MEC-010-007 toggles and label write the session and emit their events after debug.applied (idempotent)', () => {
  const content = validContent();
  const actions: Action[] = [{ type: 'debugSetStarsVisible', on: false }, { type: 'debugSetStarsVisible', on: false },
    { type: 'debugSetMuted', on: true }, { type: 'debugSetTesterLabel', text: '  Tester 7  ' },
    { type: 'debugSetFeedPresentation', mode: 'trickle' }];
  const { state, results } = run(content, initialState(content, 1), actions);
  expect(results[0].events).toEqual([{ type: 'debug.applied', action: actions[0] }, { type: 'stars.visibilityChanged', visible: false }]);
  expect(results[1].events).toEqual(results[0].events);
  expect(results[2].events).toEqual([{ type: 'debug.applied', action: actions[2] }, { type: 'audio.muteChanged', muted: true }]);
  expect(results[3].events).toEqual([{ type: 'debug.applied', action: actions[3] }]);
  expect(state.session).toMatchObject({ starsVisible: false, muted: true, testerLabel: 'Tester 7', feedPresentation: 'trickle' });
});

it('VERIFY-MEC-010-008 reset {seed:42} after progress equals initialState(content, 42) except the kept testerLabel', () => {
  const content = validContent();
  const progressed = run(content, owing(content, 1, 1260), [{ type: 'debugSetTesterLabel', text: 'T9' },
    { type: 'debugUnlockAllTypes' }, { type: 'acknowledgeProject', projectId: 'pet-house' }, { type: 'debugSetMuted', on: true }]).state;
  const { state, results } = run(content, progressed, [{ type: 'reset', seed: 42 }]);
  expect(results[0].events).toEqual([{ type: 'state.reset' }]);
  const expected = initialState(content, 42);
  expected.session.testerLabel = 'T9';
  expect(state).toEqual(expected);
  expect(run(content, progressed, [{ type: 'reset' }]).state.session.seed).toBe(1);
});

import { expect, it } from 'vitest';
import { creditProject } from '../../src/sim/rules/projects';
import {
  ackFloorCents, activeProjectId, attentionVisible, boundaryCents, completeNowOffered, completeNowPriceCents,
  displayedPhase, hudProjectId, owedPhases, phaseOf,
} from '../../src/sim/select';
import { initialState, type GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import type { Action } from '../../src/sim/actions';
import { reduce } from '../../src/sim/reduce';
import { ack, act, deepFreeze, owing, run } from './helpers';

const celebration = (step: 'cutscene' | 'milestone' | 'reveal', extra: Partial<NonNullable<GameState['celebration']>> = {}) => ({
  projectId: 'pet-house', fromPhase: 0, toPhase: 2, completes: false, unlockedTypeIds: [],
  step, skipTaken: false, ...extra,
});

it('VERIFY-MEC-002-001 phase arithmetic at goal 1500', () => {
  expect([0, 299, 300, 899, 900, 1499, 1500].map(cents => phaseOf(cents, 1500))).toEqual([0, 0, 1, 2, 3, 4, 5]);
  expect([1, 2, 3, 4, 5].map(phase => boundaryCents(1500, phase))).toEqual([300, 600, 900, 1200, 1500]);
  expect(boundaryCents(1500, 0)).toBe(0);
  expect(boundaryCents(1501, 1)).toBe(301);
});

it('MEC-002 §2.3 creditProject from 0 to 1260 emits phase.reached 1..4 ascending, acknowledgedPhase untouched', () => {
  const content = validContent(), state = deepFreeze(initialState(content, 1));
  const result = creditProject(content, state, 'pet-house', 1260);
  expect(result.events).toEqual([1, 2, 3, 4].map(phase =>
    ({ type: 'phase.reached', projectId: 'pet-house', phase, currentCents: 1260 })));
  expect(result.state.projects['pet-house']).toEqual({ ...state.projects['pet-house'], currentCents: 1260 });
  expect(JSON.parse(JSON.stringify(result.state))).toEqual(result.state);
});

it('MEC-002 §2.3 creditProject clamps 1490 → 1600 to the goal, phase 5 then one feed.stopped', () => {
  const content = validContent(), state = initialState(content, 1);
  state.projects['pet-house'].currentCents = 1490;
  const result = creditProject(content, deepFreeze(state), 'pet-house', 1600);
  expect(result.state.projects['pet-house'].currentCents).toBe(1500);
  expect(result.events).toEqual([
    { type: 'phase.reached', projectId: 'pet-house', phase: 5, currentCents: 1500 },
    { type: 'feed.stopped', reason: 'noActiveProject' },
  ]);
  expect(activeProjectId(content, result.state)).toBeNull();
  expect(creditProject(content, result.state, 'pet-house', 1600).events).toEqual([]);
});

it('MEC-002 §2.3 creditProject lowering emits nothing and clamps at 0; acknowledgedPhase untouched', () => {
  const content = validContent(), state = initialState(content, 1);
  state.projects['pet-house'].currentCents = 1000; state.projects['pet-house'].acknowledgedPhase = 3;
  const lowered = creditProject(content, deepFreeze(state), 'pet-house', 100);
  expect(lowered.events).toEqual([]);
  expect(lowered.state.projects['pet-house']).toMatchObject({ currentCents: 100, acknowledgedPhase: 3 });
  expect(creditProject(content, state, 'pet-house', -50).state.projects['pet-house'].currentCents).toBe(0);
});

it('MEC-002 §2.1 active, HUD, owed and attention selectors', () => {
  const content = validContent(), state = initialState(content, 1);
  expect(activeProjectId(content, state)).toBe('pet-house');
  expect(hudProjectId(content, state)).toBe('pet-house');
  state.projects['pet-house'].currentCents = 700;
  expect(owedPhases(content, state, 'pet-house')).toBe(2);
  expect(owedPhases(content, state, 'starter-house')).toBe(0);
  expect(attentionVisible(content, state, 'pet-house')).toBe(true);
  expect(attentionVisible(content, { ...state, scene: { kind: 'interior', roomId: 'dog-room' } }, 'pet-house')).toBe(false);
  expect(attentionVisible(content, { ...state, celebration: celebration('cutscene') }, 'pet-house')).toBe(false);
  expect(attentionVisible(content, { ...state, arrival: { projectId: 'pet-house', petId: 'owl' } }, 'pet-house')).toBe(false);
  state.projects['pet-house'].currentCents = 1500;
  expect(activeProjectId(content, state)).toBeNull();
  expect(hudProjectId(content, state)).toBe('pet-house');
  expect(() => owedPhases(content, state, 'nope')).toThrow('Unknown project id "nope"');
});

it('MEC-002 §2.1/§2.6 complete-now price, offer, ack floor and displayed phase read the celebration', () => {
  const content = validContent(), state = initialState(content, 1);
  state.projects['pet-house'].currentCents = 1260; state.projects['pet-house'].acknowledgedPhase = 1;
  expect(completeNowPriceCents(content, state, 'pet-house')).toBe(240);
  expect(completeNowOffered(content, state)).toBe(false);
  expect(completeNowOffered(content, { ...state, celebration: celebration('milestone') })).toBe(true);
  for (const extra of [{ completes: true }, { skipTaken: true }])
    expect(completeNowOffered(content, { ...state, celebration: celebration('milestone', extra) })).toBe(false);
  expect(completeNowOffered(content, { ...state, celebration: celebration('reveal') })).toBe(false);
  expect(ackFloorCents(content, state, 'pet-house')).toBe(300);
  expect(ackFloorCents(content, { ...state, celebration: celebration('cutscene', { toPhase: 4 }) }, 'pet-house')).toBe(1200);
  expect(displayedPhase(content, state, 'pet-house')).toBe(1);
  expect(displayedPhase(content, { ...state, celebration: celebration('cutscene') }, 'pet-house')).toBe(1);
  expect(displayedPhase(content, { ...state, celebration: celebration('milestone') }, 'pet-house')).toBe(2);
  expect(displayedPhase(content, { ...state, celebration: celebration('reveal') }, 'pet-house')).toBe(2);
  expect(displayedPhase(content, { ...state, celebration: celebration('reveal') }, 'starter-house')).toBe(5);
});

const setCurrent = (cents: number): Action => ({ type: 'debugSetCurrent', projectId: 'pet-house', cents });

it('VERIFY-MEC-002-008 debugSetCurrent 1260 from 0: four phase.reached 1..4 at 1260, acknowledgedPhase 0, owedPhases 4', () => {
  const content = validContent();
  const result = reduce(content, deepFreeze(initialState(content, 1)), setCurrent(1260));
  expect(result.events).toEqual([{ type: 'debug.applied', action: setCurrent(1260) },
    ...[1, 2, 3, 4].map(phase => ({ type: 'phase.reached', projectId: 'pet-house', phase, currentCents: 1260 }))]);
  expect(result.state.projects['pet-house'].acknowledgedPhase).toBe(0);
  expect(owedPhases(content, result.state, 'pet-house')).toBe(4);
});

it('VERIFY-MEC-002-018 debug floor: ack 2 raises 100 to 600; during a toPhase-4 celebration 700 → 1200; invariant 1 after collect', () => {
  const content = validContent();
  const atTwo = owing(content, 2, 600);
  const raised = reduce(content, atTwo, setCurrent(100));
  expect(raised.state.projects['pet-house'].currentCents).toBe(600);
  expect(raised.events[0]).toEqual({ type: 'debug.applied', action: setCurrent(100), adjusted: { field: 'cents', requested: 100, applied: 600 } });
  const { state, results } = run(content, owing(content, 2, 1260), [ack, setCurrent(700), act('cutsceneFinished'), act('collectRewards')]);
  expect(results[0].state.celebration!.toPhase).toBe(4);
  expect(results[1].state.projects['pet-house'].currentCents).toBe(1200);
  expect(results[1].events[0]).toMatchObject({ adjusted: { field: 'cents', requested: 700, applied: 1200 } });
  const progress = state.projects['pet-house'];
  expect(progress.acknowledgedPhase).toBe(4);
  expect(progress.acknowledgedPhase).toBeLessThanOrEqual(phaseOf(progress.currentCents, 1500));
});

it('VERIFY-MEC-002-019 debugJumpPhase 310 → 600 (one phase.reached 2); debugCompleteProject → 1500 (3, 4, 5, feed.stopped); again alreadyComplete', () => {
  const content = validContent();
  const jump: Action = { type: 'debugJumpPhase', projectId: 'pet-house' };
  const complete: Action = { type: 'debugCompleteProject', projectId: 'pet-house' };
  const { results } = run(content, owing(content, 0, 310), [jump, complete, complete]);
  expect(results[0].state.projects['pet-house'].currentCents).toBe(600);
  expect(results[0].events.slice(1)).toEqual([{ type: 'phase.reached', projectId: 'pet-house', phase: 2, currentCents: 600 }]);
  expect(results[1].state.projects['pet-house'].currentCents).toBe(1500);
  expect(results[1].events.slice(1)).toEqual([
    ...[3, 4, 5].map(phase => ({ type: 'phase.reached', projectId: 'pet-house', phase, currentCents: 1500 })),
    { type: 'feed.stopped', reason: 'noActiveProject' }]);
  expect(results[2].events).toEqual([{ type: 'action.rejected', action: complete, reason: 'alreadyComplete' }]);
});

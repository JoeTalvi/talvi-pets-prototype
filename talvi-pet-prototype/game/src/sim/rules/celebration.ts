import type { Content } from '../../content/types';
import type { Action } from '../actions';
import type { RuleResult, SimEvent } from '../events';
import type { GameState, ProjectId } from '../state';
import { buildScript, enqueueScript } from './dialogue';
import { grantItems } from './inventory';
import { finishSiteArrival } from './sites';
import { completionOutfitEvents } from './outfits';
import {
  completeNowOffered, completeNowPriceCents, creditProject, owedPhases, phaseOf, projectOf,
} from './projects';

type Celebration = NonNullable<GameState['celebration']>;
type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

const reject = (state: GameState, action: Action, reason: string): RuleResult =>
  ({ state, events: [{ type: 'action.rejected', action, reason }] });

const chain = (result: RuleResult, next: RuleResult): RuleResult =>
  ({ state: next.state, events: [...result.events, ...next.events] });

/** `[from .. to − 1]`: the clue cards (0-based) a celebration from `from` to `to` presents (mec-003 §2). */
export function clueIndices(fromPhase: number, toPhase: number): number[] {
  return Array.from({ length: Math.max(0, toPhase - fromPhase) }, (_, offset) => fromPhase + offset);
}

/** MEC-002 §2.4 `startCelebration`: snapshot the owed phases and their rewards (first occurrence kept). */
export function startCelebration(content: Content, state: GameState, projectId: ProjectId): RuleResult {
  const project = projectOf(content, projectId);
  const fromPhase = state.projects[projectId].acknowledgedPhase;
  const toPhase = phaseOf(state.projects[projectId].currentCents, project.goalCents);
  const unlockedTypeIds: string[] = [];
  for (let phase = fromPhase + 1; phase <= toPhase; phase++)
    for (const { typeId } of project.phaseRewards[phase - 1] ?? [])
      if (!unlockedTypeIds.includes(typeId)) unlockedTypeIds.push(typeId);
  const completes = toPhase === 5;
  const celebration: Celebration = { projectId, fromPhase, toPhase, completes,
    unlockedTypeIds, step: 'cutscene', skipTaken: false };
  return { state: { ...state, celebration }, events: [{ type: 'celebration.started', projectId, fromPhase,
    toPhase, completes, unlockedTypeIds: [...unlockedTypeIds], clueIndices: clueIndices(fromPhase, toPhase),
    replay: false }] };
}

/** MEC-002 §2.4 street-arrival hook (core §4 step 2): the first project in content order with owed phases. */
export function acknowledgeProject(content: Content, state: GameState,
  action: ActionOf<'acknowledgeProject'>): RuleResult {
  const known = content.projects.some(project => project.id === action.projectId);
  const reason = state.scene.kind !== 'street' ? 'notStreet'
    : !known ? 'unknownProject'
    : owedPhases(content, state, action.projectId) <= 0 ? 'nothingOwed'
    : state.celebration !== null ? 'celebrationActive'
    : state.dialogue.current !== null ? 'dialogueOpen'
    : state.arrival !== null || state.siteArrival !== null ? 'arrivalActive'
    : state.mode === 'design' ? 'designMode' : null;
  return reason ? reject(state, action, reason) : startCelebration(content, state, action.projectId);
}

function stepReason(state: GameState, step: Celebration['step']): string | null {
  return state.celebration === null ? 'noCelebration' : state.celebration.step !== step ? 'wrongStep' : null;
}

export function cutsceneFinished(content: Content, state: GameState,
  action: ActionOf<'cutsceneFinished'>): RuleResult {
  const reason = stepReason(state, 'cutscene');
  if (reason) return reject(state, action, reason);
  const celebration = state.celebration as Celebration;
  const next: GameState = { ...state, celebration: { ...celebration, step: 'milestone' } };
  const events: SimEvent[] = [{ type: 'celebration.stepped', step: 'milestone' }];
  if (completeNowOffered(content, next)) events.push({ type: 'completeNow.shown',
    projectId: celebration.projectId, priceCents: completeNowPriceCents(content, next, celebration.projectId) });
  return { state: next, events };
}

/** The `collectRewards` body, shared by `skipWait` (mec-002 §2.5). */
function collect(content: Content, state: GameState): RuleResult {
  const celebration = state.celebration as Celebration;
  const { projectId, fromPhase, toPhase, completes } = celebration;
  // DEC-043: every item of phases fromPhase+1..toPhase, phase then list order, one `items.granted` each.
  const items = projectOf(content, projectId).phaseRewards.slice(fromPhase, toPhase).flat();
  const granted = grantItems(content, state, items, 'phase');
  const project = granted.state.projects[projectId];
  const next: GameState = { ...granted.state,
    projects: { ...granted.state.projects, [projectId]: { ...project,
      acknowledgedPhase: toPhase as GameState['projects'][ProjectId]['acknowledgedPhase'],
      complete: project.complete || completes } },
    celebration: { ...celebration, step: 'reveal' } };
  const events: SimEvent[] = [...granted.events, { type: 'rewards.collected', projectId,
    phases: clueIndices(fromPhase, toPhase).map(index => index + 1), typeIds: [...celebration.unlockedTypeIds] }];
  if (completes) events.push({ type: 'project.completed', projectId }, ...completionOutfitEvents(content, projectId)); // WORK-037-2
  events.push({ type: 'celebration.stepped', step: 'reveal' });
  return { state: next, events };
}

export function collectRewards(content: Content, state: GameState, action: ActionOf<'collectRewards'>): RuleResult {
  const reason = stepReason(state, 'milestone');
  return reason ? reject(state, action, reason) : collect(content, state);
}

export function skipWait(content: Content, state: GameState, action: ActionOf<'skipWait'>): RuleResult {
  const celebration = state.celebration;
  const goalCents = celebration ? projectOf(content, celebration.projectId).goalCents : 0;
  const reason = stepReason(state, 'milestone') ?? (celebration!.completes ? 'completing'
    : state.projects[celebration!.projectId].currentCents >= goalCents ? 'nothingRemains' : null);
  if (reason) return reject(state, action, reason);
  const { projectId } = celebration!;
  const priceCents = completeNowPriceCents(content, state, projectId);
  const taken: RuleResult = { state: { ...state, celebration: { ...celebration!, skipTaken: true } },
    events: [{ type: 'completeNow.taken', projectId, priceCents }] };
  const credited = chain(taken, creditProject(content, taken.state, projectId, goalCents));
  return chain(credited, collect(content, credited.state));
}

/** MEC-002 §2.6 / mec-008 §2.5: the highest acknowledged phase's message, then the completion message. */
function queueMessages(content: Content, state: GameState, ended: Celebration): RuleResult {
  const project = projectOf(content, ended.projectId);
  let result: RuleResult = { state, events: [] };
  for (let phase = ended.toPhase; phase > ended.fromPhase; phase--) {
    if (!project.phaseMessages?.[phase - 1]?.length) continue;
    const script = buildScript(content, 'phaseMessage', { projectId: project.id, phase });
    result = chain(result, enqueueScript(result.state, script));
    break;
  }
  if (ended.completes && project.completionMessage?.length)
    result = chain(result, enqueueScript(result.state,
      buildScript(content, 'completionMessage', { projectId: project.id })));
  return result;
}

export function closeReveal(content: Content, state: GameState, action: ActionOf<'closeReveal'>): RuleResult {
  const reason = stepReason(state, 'reveal');
  if (reason) return reject(state, action, reason);
  const ended = state.celebration as Celebration;
  const { projectId } = ended;
  const cleared: RuleResult = { state: { ...state, celebration: null },
    events: [{ type: 'celebration.ended', projectId }] };
  const progress = cleared.state.projects[projectId];
  if (progress.complete && !progress.arrivalDone) {
    const project = projectOf(content, projectId);
    const house = content.street.houses.find(candidate => candidate.projectId === projectId);
    if (!house) throw new Error(`No street house for project "${projectId}"`);
    const arrived: RuleResult = chain(cleared, { state: { ...cleared.state,
      arrival: { projectId, petId: project.residentPetId } }, events: [{ type: 'arrival.started', projectId,
      petId: project.residentPetId, doorId: house.door.id }] });
    return chain(arrived, queueMessages(content, arrived.state, ended));
  }
  if (ended.skipTaken && owedPhases(content, cleared.state, projectId) > 0)
    return chain(cleared, startCelebration(content, cleared.state, projectId));
  return chain(cleared, queueMessages(content, cleared.state, ended));
}

export function arrivalFinished(content: Content, state: GameState, action: ActionOf<'arrivalFinished'>): RuleResult {
  const arrival = state.arrival;
  if (arrival === null && state.siteArrival !== null) return finishSiteArrival(content, state);
  if (arrival === null) return reject(state, action, 'noArrival');
  const progress = state.projects[arrival.projectId];
  return { state: { ...state, arrival: null,
    projects: { ...state.projects, [arrival.projectId]: { ...progress, arrivalDone: true } } },
  events: [{ type: 'arrival.finished', petId: arrival.petId }] };
}

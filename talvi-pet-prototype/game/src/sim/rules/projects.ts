import type { Content } from '../../content/types';
import type { Project } from '../../content/schema/project';
import type { RuleResult, SimEvent } from '../events';
import type { GameState, ProjectId } from '../state';

export function projectOf(content: Content, projectId: ProjectId): Project {
  const project = content.projects.find(candidate => candidate.id === projectId);
  if (!project) throw new Error(`Unknown project id "${projectId}"`);
  return project;
}

/** MEC-002 §2.1: `ceil(goal × p / 5)`; phase 0 is 0 cents. */
export function boundaryCents(goalCents: number, phase: number): number {
  return phase <= 0 ? 0 : Math.ceil(goalCents * phase / 5);
}

export function phaseOf(currentCents: number, goalCents: number): number {
  return Math.min(5, Math.floor(currentCents * 5 / goalCents));
}

export function owedPhases(content: Content, state: GameState, projectId: ProjectId): number {
  const project = projectOf(content, projectId);
  return phaseOf(state.projects[projectId].currentCents, project.goalCents) - state.projects[projectId].acknowledgedPhase;
}

/** First project in content order still below its goal; the feed credits it. */
export function activeProjectId(content: Content, state: GameState): ProjectId | null {
  return content.projects.find(project => state.projects[project.id].currentCents < project.goalCents)?.id ?? null;
}

export function hudProjectId(content: Content, state: GameState): ProjectId | null {
  return activeProjectId(content, state) ?? content.projects.at(-1)?.id ?? null;
}

export function completeNowPriceCents(content: Content, state: GameState, projectId: ProjectId): number {
  return projectOf(content, projectId).goalCents - state.projects[projectId].currentCents;
}

export function completeNowOffered(content: Content, state: GameState): boolean {
  const celebration = state.celebration;
  return celebration !== null && celebration.step === 'milestone' && !celebration.completes &&
    !celebration.skipTaken && completeNowPriceCents(content, state, celebration.projectId) > 0;
}

export function ackFloorCents(content: Content, state: GameState, projectId: ProjectId): number {
  const celebrating = state.celebration?.projectId === projectId ? state.celebration.toPhase : 0;
  const phase = Math.max(state.projects[projectId].acknowledgedPhase, celebrating);
  return boundaryCents(projectOf(content, projectId).goalCents, phase);
}

export function attentionVisible(content: Content, state: GameState, projectId: ProjectId): boolean {
  return state.scene.kind === 'street' && state.celebration === null && state.arrival === null &&
    owedPhases(content, state, projectId) > 0;
}

export function displayedPhase(content: Content, state: GameState, projectId: ProjectId): number {
  projectOf(content, projectId);
  const celebration = state.celebration;
  return celebration !== null && celebration.projectId === projectId && celebration.step !== 'cutscene'
    ? celebration.toPhase : state.projects[projectId].acknowledgedPhase;
}

/** MEC-002 §2.3: the only writer of `currentCents`; never touches `acknowledgedPhase`. */
export function creditProject(content: Content, state: GameState, projectId: ProjectId,
  newCents: number): RuleResult {
  const { goalCents } = projectOf(content, projectId);
  const activeBefore = activeProjectId(content, state);
  const old = state.projects[projectId].currentCents;
  const cents = Math.min(goalCents, Math.max(0, newCents));
  const next: GameState = { ...state, projects: { ...state.projects,
    [projectId]: { ...state.projects[projectId], currentCents: cents } } };
  const events: SimEvent[] = [];
  for (let phase = phaseOf(old, goalCents) + 1; phase <= phaseOf(cents, goalCents); phase++)
    events.push({ type: 'phase.reached', projectId, phase: phase as 1 | 2 | 3 | 4 | 5, currentCents: cents });
  if (activeBefore !== null && activeProjectId(content, next) === null)
    events.push({ type: 'feed.stopped', reason: 'noActiveProject' });
  return { state: next, events };
}

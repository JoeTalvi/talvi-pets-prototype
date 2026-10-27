import type { Content } from '../../content/types';
import type { GameState, ProjectId } from '../state';
import { clueIndices } from './celebration';
import { activeProjectId, projectOf } from './projects';

type CardIndex = 0 | 1 | 2 | 3 | 4;
type CardPhase = 1 | 2 | 3 | 4 | 5;
/** MEC-003 §3.3 view data contracts. */
export type ClueCardView =
  | { index: CardIndex; phase: CardPhase; unlocked: true; icon: string; line: string }
  | { index: CardIndex; phase: CardPhase; unlocked: false };
export type RevealView = { projectId: ProjectId; cards: ClueCardView[] } & (
  | { image: 'mystery' }
  | { image: 'full'; silhouetteImage: string; descriptorImage: string; petName: string });
export type RevealPopupView = RevealView & { newCardIndices: number[]; completes: boolean };

/** MEC-003 §2: the active project, else a funded rising project not yet `complete` (the Skip chain, review
 * MILESTONE-006-1 M-1), else the last completed rising project (Q10(a)), else null. */
export function revealProjectId(content: Content, state: GameState): ProjectId | null {
  const rising = content.projects.filter(project => !project.completeAtStart);
  const completed = rising.filter(project => state.projects[project.id].complete);
  return activeProjectId(content, state) ?? rising.find(project => !state.projects[project.id].complete)?.id
    ?? completed.at(-1)?.id ?? null;
}

/** MEC-003 §2: cards follow `acknowledgedPhase`; no image or name key exists until `complete` (DEC-033). */
export function revealView(content: Content, state: GameState, projectId: ProjectId): RevealView | null {
  const project = projectOf(content, projectId);
  if (project.completeAtStart || project.clueCards.length === 0) return null;
  const progress = state.projects[projectId];
  const cards = project.clueCards.map((card, index): ClueCardView => {
    const position = { index: index as CardIndex, phase: (index + 1) as CardPhase };
    return progress.acknowledgedPhase >= index + 1
      ? { ...position, unlocked: true, icon: card.icon, line: card.line } : { ...position, unlocked: false };
  });
  if (!progress.complete) return { projectId, cards, image: 'mystery' };
  if (!project.silhouetteImage || !project.descriptorImage)
    throw new Error(`Project "${projectId}" has no reveal images`);
  return { projectId, cards, image: 'full', silhouetteImage: project.silhouetteImage,
    descriptorImage: project.descriptorImage, petName: content.pets[project.residentPetId].name };
}

/** MEC-003 §3.3: the popup exists only at step `reveal`; its new cards are the celebration's clue indices. */
export function revealPopupView(content: Content, state: GameState): RevealPopupView | null {
  const celebration = state.celebration;
  if (celebration === null || celebration.step !== 'reveal') return null;
  const view = revealView(content, state, celebration.projectId);
  return view && { ...view, newCardIndices: clueIndices(celebration.fromPhase, celebration.toPhase),
    completes: celebration.completes };
}

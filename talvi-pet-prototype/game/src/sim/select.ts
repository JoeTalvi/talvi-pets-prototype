import type { Content } from '../content/types';
import type { Door } from '../content/schema/common';
import type { GameState } from './state';

export { chooserTypes, ownsTag } from './rules/inventory';
export { starsOf } from './rules/stars';
export { slotOf, placementAt } from './rules/slots';
export { residentPet, petUsingSlot } from './rules/pets';
export { revealProjectId, revealView, revealPopupView } from './rules/reveal';
export { activeWant, wantConditions, tagAvailability, missingWantTags } from './rules/wants';
export {
  boundaryCents, phaseOf, owedPhases, activeProjectId, hudProjectId, completeNowPriceCents,
  completeNowOffered, ackFloorCents, attentionVisible, displayedPhase,
} from './rules/projects';

/** CONTRACT-SELECT v1.4; content-only consumers retain their original signature. */
export function typeUnlockPhase(content: Content, typeId: string): {
    projectId: string;
    phase: number;
} | null {
    for (const project of content.projects) {
        const phase = project.phaseRewards.findIndex(ids => ids.includes(typeId));
        if (phase >= 0)
            return {
                projectId: project.id, phase: phase + 1
            };
    }
    return null;
}

export function inputFrozen(_content: Content, state: GameState): boolean {
    return state.dialogue.current !== null || state.celebration !== null ||
        state.arrival !== null || state.mode === 'design';
}

export function doorEnabled(content: Content, state: GameState, door: Door): boolean {
    const target = door.target;
    if (target.scene === 'street') return true;
    const project = content.projects.find(project => project.interiorRoomId === target.roomId);
    return project ? state.projects[project.id].complete && state.projects[project.id].arrivalDone : true;
}

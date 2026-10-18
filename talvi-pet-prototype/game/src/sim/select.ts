import type { Content } from '../content/types';
/** Content-only selector; WORK-003 takes ownership of this module. */
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

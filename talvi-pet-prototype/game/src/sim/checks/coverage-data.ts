import type { Content } from '../../content/types';
import type { Want } from '../../content/schema/pet';
export const wantTags = (w: Want) => w.conditions.flatMap(x => x.kind === 'tag' ? [
    x.tag
] : []);
export type Source = {
    kind: 'starter' | 'phase' | 'heart';
    typeId: string;
    projectId?: string;
    phase?: number;
    petId?: string;
    heart?: number;
};
export function typeSources(c: Content, typeId: string): Source[] {
    const sources: Source[] = [];
    if (c.charms.starterSet.includes(typeId))
        sources.push({
            kind: 'starter', typeId
        });
    for (const p of c.projects)
        p.phaseRewards.forEach((ts, i) => {
            if (ts.includes(typeId))
                sources.push({
                    kind: 'phase', typeId, projectId: p.id, phase: i + 1
                });
        });
    for (const p of Object.values(c.pets))
        p.wants.forEach((w, i) => {
            if (w.reward.kind === 'types' && w.reward.typeIds.includes(typeId))
                sources.push({
                    kind: 'heart', typeId, petId: p.id, heart: i + 1
                });
        });
    return sources;
}
export function tagSources(c: Content, tag: string): Source[] {
    return c.charms.types.filter(t => t.tags.includes(tag)).flatMap(t => typeSources(c, t.id)).sort((a, b) => ({
        starter: 0, phase: 1, heart: 2
    }[a.kind] - {
        starter: 0, phase: 1, heart: 2
    }[b.kind]) || ((a.phase ?? a.heart ?? 0) - (b.phase ?? b.heart ?? 0)));
}
export function reachableMax(c: Content, roomId: string, ids: string[]): number {
    const r = c.rooms[roomId];
    return [
        'small', 'large', 'wall'
    ].reduce((sum, cls) => {
        const slots = r.slots.filter(s => s.sizeClass === cls).length;
        const count = c.charms.types.filter(t => t.sizeClass === cls && ids.includes(t.id)).length;
        return sum + Math.min(slots, count) * c.tuning.starsFirstCopy + (count > 0 ? Math.max(0, slots - count) * c.tuning.starsRepeat : 0);
    }, 0);
}
export const allGrantedTypes = (c: Content) => c.charms.types.filter(t => typeSources(c, t.id).length > 0).map(t => t.id);

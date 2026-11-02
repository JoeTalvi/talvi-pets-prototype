import type { Content } from '../../src/content/types';
import type { Want } from '../../src/content/schema/pet';
import type { Finding } from '../../src/sim/checks';
import { tagSources, typeSources, allGrantedTypes, reachableMax } from '../../src/sim/checks/coverage-data';
import { petLineCount } from '../../src/sim/checks/chk-008';
import { typeUnlockPhase } from '../../src/sim/select';
export function coverage(c: Content, findings: Finding[], opts: {
    pet?: string;
    project?: string;
} = {}) {
    if (opts.project && !c.projects.some(p => p.id === opts.project))
        throw new Error(`Unknown project ${opts.project}`);
    return {
        pets: Object.fromEntries(Object.values(c.pets).filter(p => !opts.pet || p.id === opts.pet).map(p => [
            p.id, {
                wants: p.wants.map((w, i) => wantCoverage(c, p.id, w, i, findings)), lines: {
                    total: petLineCount(p), wants: p.wants.map(w => ({
                        id: w.id, announcePresent: !!p.lines.wantAnnounce[w.id], vignettePresent: !!p.lines.vignettes[w.id]?.length, vignetteLines: p.lines.vignettes[w.id]?.length ?? 0
                    }))
                }, rewardKinds: Object.fromEntries([
                    'items', 'verb', 'vignette'
                ].map(k => [
                    k, p.wants.filter(w => w.reward.some(r => r.kind === k)).length
                ]))
            }
        ])),
        types: Object.fromEntries(c.charms.types.map(t => [
            t.id, {
                sources: typeSources(c, t.id), phase: typeUnlockPhase(c, t.id), doubleGrant: typeSources(c, t.id).length > 1
            }
        ])),
        projects: Object.fromEntries(c.projects.filter(p => !p.completeAtStart && (!opts.project || opts.project === p.id)).map(p => [
            p.id, {
                cards: p.clueCards.map((card, i) => ({
                    index: i, hintTag: card.hintTag ?? null, earlyWantTag: c.pets[p.residentPetId]?.wants.slice(0, 2).some(w => w.conditions.some(x => x.kind === 'tag' && x.tag === card.hintTag)) ?? false, nameLeak: findings.some(f => f.ids.includes('CHK-003-04') && f.path === `/projects/${c.projects.indexOf(p)}/clueCards/${i}/line`)
                }))
            }
        ])),
        rooms: Object.fromEntries(Object.values(c.rooms).map(r => [
            r.id, {
                max: r.slots.length * c.tuning.starsFirstCopy, reachableMax: reachableMax(c, r.id, allGrantedTypes(c)), floors: c.pets[r.residentPetId]?.wants.flatMap(w => w.conditions.flatMap(x => x.kind === 'stars' ? [
                    {
                        wantId: w.id, min: x.min, withinMax: x.min <= r.slots.length * c.tuning.starsFirstCopy
                    }
                ] : [])) ?? []
            }
        ])), findings
    };
}
export function coverageText(c: Content, r: ReturnType<typeof coverage>): string {
    const lines = [
        'A — Want coverage'
    ];
    for (const [pet, p] of Object.entries(r.pets)) {
        for (const w of p.wants) {
            lines.push(`${pet} ${w.index + 1}. ${w.id}: ${w.brief} (${w.rewardKind})`);
            lines.push(`  checks: ${Object.entries(w.checks).map(([id, result]) => `${id}=${result.status}`).join(", ")}`);
            for (const t of w.tags) {
                const s = t.earliestSource;
                const label = !s ? 'none' : s.kind === 'starter' ? 'starter' : s.kind === 'phase' ? `${c.projects.find(p => p.id === s.projectId)?.name ?? s.projectId} phase ${s.phase}` : `Heart ${s.heart} of pet ${s.petId}`;
                lines.push(`  ${t.hidden ? '? ' : ''}${t.tag} ← ${label}${s ? ' (' + s.typeId + ')' : ''}; fills ${t.fillCount}`);
            }
        }
    }
    lines.push('B — Type unlock timeline', JSON.stringify(r.types, null, 2), 'C — Clue cards', JSON.stringify(r.projects, null, 2), 'D — Dialogue lines', JSON.stringify(Object.fromEntries(Object.entries(r.pets).map(([id, p]) => [
        id, p.lines
    ])), null, 2), 'E — Reward kinds', JSON.stringify(Object.fromEntries(Object.entries(r.pets).map(([id, p]) => [
        id, p.rewardKinds
    ])), null, 2), 'F — Stars', JSON.stringify(r.rooms, null, 2));
    return lines.join('\n');
}
function wantCoverage(c: Content, petId: string, w: Want, index: number, findings: Finding[]) {
    const tags = w.conditions.flatMap(x => x.kind === 'tag' ? [{
            tag: x.tag,
            hidden: !!x.hidden,
            fillCount: c.charms.types.filter(t => t.tags.includes(x.tag)).length,
            sources: tagSources(c, x.tag),
            earliestSource: tagSources(c, x.tag)[0] ?? null
        }] : []);
    const relevant = findings.filter(f => (f.file === `pets/${petId}.json` && (f.path === '/wants' || f.path === `/wants/${index}` || f.path.startsWith(`/wants/${index}/`))) ||
        (f.ids.includes('CHK-009-08') && tags.some(t => t.tag === f.details?.tag)));
    const checks = Object.fromEntries(['08', '09', '10', '12', '13', '15', '16'].map(n => {
        const id = `CHK-009-${n}`;
        const matches = relevant.filter(f => f.ids.includes(id));
        const applicable = n !== '16' || (petId === 'dog' && index === 0);
        return [id, { status: !applicable ? 'not-applicable' : matches.some(f => f.level === 'error') ? 'error' : matches.length ? 'warning' : 'pass', findings: matches }];
    }));
    return { id: w.id, index, brief: w.brief, rewardKind: w.reward.map(r => r.kind).join('+'), tags, checks, findings: relevant };
}

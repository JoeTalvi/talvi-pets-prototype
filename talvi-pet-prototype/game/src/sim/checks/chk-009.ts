import type { Content } from '../../content/types';
import { finding, type Finding } from './types';
import { itemTypeIds } from '../../content/schema/charms';
import { rewardItems } from '../../content/schema/pet';
import { tagSources, wantTags } from './coverage-data';
import { check009Satisfiable } from './chk-009-17';
export function check009(c: Content): Finding[] {
    const out: Finding[] = [];
    for (const p of Object.values(c.pets)) {
        const f = `pets/${p.id}.json`;
        const add = (n: string, path: string, msg: string, level: 'error' | 'warning' = 'error', details?: Record<string, unknown>, aliases: string[] = []) => out.push(finding([
            `CHK-009-${n}`, ...aliases
        ], level, f, path, msg, undefined, details));
        const homes = Object.values(c.rooms).filter(r => r.residentPetId === p.id), max = (homes[0]?.slots.length ?? 0) * c.tuning.starsFirstCopy;
        if (!p.wants.length)
            add('01', '/wants', 'At least one want required');
        if (p.wants.length !== 5)
            add('01', '/wants', 'Target is 5 wants', 'warning');
        const earlier = new Set<string>(), visibleEarlier = new Set<string>(), verbs = new Set(p.verbs.filter(v => v.atStart).map(v => v.verb));
        checkWants(c, p, add, homes.length, max, earlier, visibleEarlier, verbs);
        const earlyTypes = new Set([
            ...itemTypeIds(c.charms.starterSet), ...c.projects.filter(q => !q.completeAtStart).flatMap(q => itemTypeIds(q.phaseRewards[0] ?? []))
        ]), earlyTags = new Set(c.charms.types.filter(t => earlyTypes.has(t.id)).flatMap(t => t.tags));
        const missing = [
            ...new Set(p.wants.slice(0, 2).flatMap(wantTags))
        ].filter(t => !earlyTags.has(t));
        if (missing.length)
            add('10', '/wants', `First two wants lack starter + Pet House phase 1 coverage: ${missing.join(', ')}`, 'error', {
                missing
            });
        const kinds = new Set(p.wants.flatMap(w => w.reward.map(r => r.kind)));
        if ([
            'items', 'verb', 'vignette'
        ].some(k => !kinds.has(k as 'items' | 'verb' | 'vignette')))
            add('14', '/wants', 'Target reward variety includes items, verb, vignette', 'warning');
        if (p.id === 'dog' && p.wants[0]) {
            const starterTags = new Set(c.charms.types.filter(t => itemTypeIds(c.charms.starterSet).includes(t.id)).flatMap(t => t.tags));
            const miss = wantTags(p.wants[0]).filter(t => !starterTags.has(t));
            if (miss.length)
                add('16', '/wants/0', `Dog first want lacks starter coverage: ${miss.join(', ')}`);
        }
    }
    out.push(...check009Satisfiable(c));
    return out;
}
type AddWantFinding = (n: string, path: string, msg: string, level?: "error" | "warning", details?: Record<string, unknown>, aliases?: string[]) => unknown;
function checkWants(c: Content, p: Content["pets"][string], add: AddWantFinding, homeCount: number, max: number, earlier: Set<string>, visibleEarlier: Set<string>, verbs: Set<string>): void {
    p.wants.forEach((w, i) => {
        const path = `/wants/${i}`, tags = w.conditions.filter(x => x.kind === 'tag'), adj = w.conditions.filter(x => x.kind === 'adjacent'), stars = w.conditions.filter(x => x.kind === 'stars'), hidden = tags.filter(x => x.hidden);
        if (tags.length < 2 || tags.length > 3 || new Set(tags.map(x => x.tag)).size !== tags.length)
            add('02', path + '/conditions', 'Want requires 2–3 distinct tag conditions');
        if (adj.length > 1 || adj.some(x => x.tagA === x.tagB || ![
            x.tagA, x.tagB
        ].every(t => tags.some(y => y.tag === t && !y.hidden))))
            add('03', path + '/conditions', 'At most 1 adjacent condition referencing two distinct visible tag conditions');
        if (homeCount !== 1 || stars.length > 1 || stars.some(x => !Number.isInteger(x.min) || x.min < 1 || x.min > max))
            add('04', path + '/conditions', `Want requires exactly one home; at most one integer Stars floor 1..${max}`, 'error', undefined, [
                'CHK-005-08'
            ]);
        if (hidden.length > 1 || (hidden.length > 0 && (i === 0 || i + 1 < c.tuning.hiddenSlotFromWant)))
            add('05', path + '/conditions', 'At most one hidden tag, allowed only from hiddenSlotFromWant and never on first want');
        const items = w.reward.filter(r => r.kind === 'items');
        if (!w.rewardLabel.trim() || items.some(r => r.items.length < 1 || r.items.length > 2) || rewardItems(w).length > 2)
            add('06', path + '/reward', 'Reward requires a label and items bundles of 1–2 entries');
        w.reward.forEach((r, k) => {
            if (r.kind !== 'verb')
                return;
            if (verbs.has(r.verb))
                add('06', path + `/reward/${k}/verb`, 'Verb is already available or rewarded earlier', 'warning');
            verbs.add(r.verb);
        });
        for (const t of tags) {
            const sources = tagSources(c, t.tag), own = sources.filter(s => s.kind === 'starter' || s.kind === 'phase' || (s.kind === 'heart' && s.petId === p.id && s.heart! < i + 1)), other = sources.filter(s => s.kind === 'heart' && s.petId !== p.id);
            if (!own.length)
                add('09', path + '/conditions', other.length ? `Tag "${t.tag}" only available from another pet's Heart bundle` : `Tag "${t.tag}" has no source before this want`, other.length ? 'warning' : 'error', {
                    tag: t.tag, sources
                });
        }
        if (w.conditions.every(x => x.kind === 'stars' && x.min <= 0))
            add('11', path + '/conditions', 'Want must not be satisfiable by an empty room');
        if (i > 0 && tags.every(t => earlier.has(t.tag)) && !adj.length && !stars.length)
            add('12', path + '/conditions', 'Already satisfied by the preceding fills', 'warning');
        for (const h of hidden)
            if (visibleEarlier.has(h.tag))
                add('13', path + '/conditions', `Hidden tag "${h.tag}" was visible in an earlier want`, 'warning');
        if (i < 3 && stars.length)
            add('15', path + '/conditions', 'Stars floor on a first-three want affects TEST-001', 'warning');
        tags.forEach(t => {
            earlier.add(t.tag);
            if (!t.hidden)
                visibleEarlier.add(t.tag);
        });
    });
}

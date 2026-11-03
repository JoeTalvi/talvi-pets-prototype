import type { Content } from '../../content/types';
import { pointInPolygon, segmentInPolygon } from '../geometry';
import { finding, type Finding } from './types';
import { checkStreetPresence } from './chk-007-street';
export function check007(c: Content): Finding[] {
    const out: Finding[] = [];
    const add = (n: string, f: string, p: string, msg: string, level: 'error' | 'warning' = 'error') => out.push(finding(`CHK-007-${n}`, level, f, p, msg));
    const tags = new Set<string>();
    c.verbs.forEach((v, i) => v.tags.forEach((tag, j) => {
        if (tags.has(tag))
            add('01', 'verbs.json', `/verbs/${i}/tags/${j}`, `Tag "${tag}" appears in more than one verb`);
        tags.add(tag);
    }));
    out.push(...checkProfiles(c));
    out.push(...checkStreetPresence(c)); // WORK-035-1: CHK-007-09..13
    for (const r of Object.values(c.rooms)) {
        const f = `rooms/${r.id}.json`;
        if (r.wanderPoints.length < 2)
            add('06', f, '/wanderPoints', 'At least 2 wander points required');
        if (!pointInPolygon(r.petSpawn, r.walkArea))
            add('06', f, '/petSpawn', 'petSpawn must be inside walkArea');
        const pts = [
            {
                p: r.petSpawn, path: '/petSpawn'
            }, ...r.slots.map((s, i) => ({
                p: s.anchor, path: `/slots/${i}/anchor`
            })), ...r.wanderPoints.map((p, i) => ({
                p, path: `/wanderPoints/${i}`
            })), ...r.doors.map((d, i) => ({
                p: d.spawn, path: `/doors/${i}/spawn`
            }))
        ];
        pts.forEach((a, i) => pts.slice(i + 1).forEach(b => {
            if (!segmentInPolygon(a.p, b.p, r.walkArea))
                add('07', f, a.path, `Segment to ${b.path} crosses outside walkArea`);
        }));
    }
    const t = c.tuning;
    for (const [key, ok] of Object.entries({
        petSpeedRu: t.petSpeedRu > 0, idleMs: t.idleMs.min <= t.idleMs.max, verbHoldMs: t.verbHoldMs.min <= t.verbHoldMs.max, recentTargetPenalty: t.recentTargetPenalty >= 0 && t.recentTargetPenalty <= 1, recentTargetsKept: Number.isInteger(t.recentTargetsKept) && t.recentTargetsKept >= 0
    }))
        if (!ok)
            add('08', 'tuning.json', '/' + key, `Invalid ${key}`);
    return out;
}
function checkProfiles(c: Content): Finding[] {
    const out: Finding[] = [];
    const add = (n: string, f: string, p: string, msg: string, level: 'error' | 'warning' = 'error') => out.push(finding(`CHK-007-${n}`, level, f, p, msg));
    for (const p of Object.values(c.pets)) {
        const f = `pets/${p.id}.json`;
        if (p.likes.length < 2 || p.likes.length > 4 || new Set(p.likes.map(l => l.tag)).size !== p.likes.length || p.likes.some(l => !Number.isInteger(l.weight) || l.weight < 1 || l.weight > 3) || p.likes.filter(l => l.hidden).length > 1 || p.dislikes.length !== 1 || p.likes.some(l => p.dislikes.includes(l.tag)))
            add('02', f, '/likes', 'Pet requires 2–4 distinct likes weighted 1..3, at most 1 hidden, and 1 distinct dislike');
        const max = Math.max(...p.likes.map(l => l.weight));
        if (p.likes.filter(l => l.weight === max).length > 1)
            add('03', f, '/likes', 'More than one like has maximum weight', 'warning');
        if ((p.id === 'owl' && (!p.verbs.some(v => v.verb === 'perch') || p.verbs.some(v => v.verb === 'sit-on'))) || (p.id === 'dog' && p.verbs.some(v => v.verb === 'perch')))
            add('04', f, '/verbs', 'Owl requires perch without sit-on; Dog must not have perch');
        const acquired = new Set([
            ...p.verbs.filter(v => v.atStart).map(v => v.verb), ...p.wants.flatMap(w => w.reward.flatMap(r => r.kind === 'verb' ? [r.verb] : []))
        ]);
        p.likes.forEach((l, i) => {
            const v = c.verbs.find(v => v.tags.includes(l.tag));
            if (v && !acquired.has(v.id))
                add('05', f, `/likes/${i}`, `Liked tag "${l.tag}" has a verb the pet never gets`, 'warning');
        });
    }
    return out;
}

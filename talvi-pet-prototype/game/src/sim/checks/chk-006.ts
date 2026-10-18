import type { Content } from '../../content/types';
import { finding, type Finding } from './types';
import { reachableMax, allGrantedTypes } from './coverage-data';
export function check006(c: Content): Finding[] {
    const out: Finding[] = [];
    const t = c.tuning;
    if (!Number.isInteger(t.starsFirstCopy) || t.starsFirstCopy < 1)
        out.push(finding('CHK-006-01', 'error', 'tuning.json', '/starsFirstCopy', 'starsFirstCopy must be an integer >= 1'));
    if (!Number.isInteger(t.starsRepeat) || t.starsRepeat < 0 || t.starsRepeat > t.starsFirstCopy)
        out.push(finding('CHK-006-01', 'error', 'tuning.json', '/starsRepeat', 'starsRepeat must be an integer in 0..starsFirstCopy'));
    for (const r of Object.values(c.rooms)) {
        for (const [id, ids] of [
            [
                '02', c.charms.types.map(t => t.id)
            ], [
                '03', allGrantedTypes(c)
            ]
        ] as const) {
            const max = r.slots.length * t.starsFirstCopy, reachable = reachableMax(c, r.id, [
                ...ids
            ]);
            if ((id === '02' && r.slots.some(s => c.charms.types.filter(t => t.sizeClass === s.sizeClass).length < r.slots.filter(t => t.sizeClass === s.sizeClass).length)) || (id === '03' && reachable < max))
                out.push(finding(`CHK-006-${id}`, 'warning', `rooms/${r.id}.json`, '/slots', id === '02' ? 'Catalogue has fewer distinct types than slots of a size class' : 'Maximum Stars is unreachable from all grant sources', undefined, {
                    max, reachable
                }));
        }
    }
    return out;
}

import type { Content } from '../../content/types';
import { pointInPolygon } from '../geometry';
import { finding, type Finding } from './types';
export function check005(c: Content): Finding[] {
    const out: Finding[] = [];
    for (const r of Object.values(c.rooms)) {
        const f = `rooms/${r.id}.json`;
        const add = (n: string, p: string, msg: string, level: 'error' | 'warning' = 'error', hint?: string, alias?: string) => out.push(finding([
            `CHK-005-${n}`, ...(alias ? [
                alias
            ] : [])
        ], level, f, p, msg, hint));
        if (r.slots.length < 10 || r.slots.length > 14)
            add('01', '/slots', 'Room requires 10–14 slots');
        r.slots.forEach((s, i) => {
            s.adjacent.forEach((id, j) => {
                const other = r.slots.find(t => t.id === id);
                if (id === s.id)
                    add('02', `/slots/${i}/adjacent/${j}`, 'Adjacency must be irreflexive');
                else if (other && !other.adjacent.includes(s.id))
                    add('02', `/slots/${i}/adjacent/${j}`, `"${s.id}" lists "${id}" but "${id}".adjacent lacks "${s.id}"`, 'error', `add "${s.id}" to ${id}.adjacent`);
            });
            if (!pointInPolygon(s.anchor, r.walkArea))
                add('03', `/slots/${i}/anchor`, 'Anchor is outside walkArea', 'error', undefined, 'CHK-007-06');
            if (s.sizeClass === 'wall' && s.depthOverride === undefined && r.slots.some(t => t.sizeClass !== 'wall' && Math.abs(t.x - s.x) < 160 && s.y > t.y))
                add('06', `/slots/${i}/depthOverride`, 'Wall slot may draw over a floor charm', 'warning');
            r.slots.slice(i + 1).forEach(t => {
                if (Math.hypot(t.x - s.x, t.y - s.y) < 48)
                    add('07', `/slots/${i}`, `Base point is within 48px of "${t.id}"`, 'warning');
            });
        });
        r.wanderPoints.forEach((p, i) => {
            if (!pointInPolygon(p, r.walkArea))
                add('03', `/wanderPoints/${i}`, 'Wander point is outside walkArea', 'error', undefined, 'CHK-007-06');
        });
        const counts = [
            'small', 'large', 'wall'
        ].map(cls => r.slots.filter(s => s.sizeClass === cls).length);
        if (counts[0] < 6 || counts[0] > 8 || counts[1] < 1 || counts[1] > 2 || counts[2] < 3 || counts[2] > 4)
            add('04', '/slots', 'Target split is 6–8 small / 1–2 large / 3–4 wall', 'warning');
        for (const cls of new Set(r.slots.map(s => s.sizeClass)))
            if (!c.charms.types.some(t => t.sizeClass === cls))
                add('05', '/slots', `No catalogue type can fill "${cls}" slots`);
    }
    return out;
}

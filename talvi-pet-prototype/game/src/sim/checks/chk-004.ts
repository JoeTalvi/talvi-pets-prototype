import { itemTypeIds } from '../../content/schema/charms';
import type { Content } from '../../content/types';
import { finding, type Finding } from './types';
import { typeSources, wantTags } from './coverage-data';
export function check004(c: Content): Finding[] {
    const out: Finding[] = [];
    const add = (n: string, p: string, msg: string, level: 'error' | 'warning' = 'warning', ids?: string[]) => out.push(finding(ids ?? [
        `CHK-004-${n}`
    ], level, 'charms.json', p, msg));
    if (c.tags.length < 1 || c.tags.length > 8)
        out.push(finding('CHK-004-01', 'error', 'tags.json', '/tags', 'Tags must number 1–8'));
    c.charms.types.forEach((t, i) => {
        if (t.tags.length < 1 || t.tags.length > 2 || new Set(t.tags).size !== t.tags.length)
            add('02', `/types/${i}/tags`, 'Charm requires 1–2 distinct tags', 'error');
        if (![
            'small', 'large', 'wall'
        ].includes(t.sizeClass))
            add('03', `/types/${i}/sizeClass`, 'Unknown sizeClass', 'error');
        if (typeSources(c, t.id).length > 1)
            add('06', `/types/${i}/id`, `"${t.id}" has multiple grant sources`);
        for (const p of Object.values(c.pets))
            if (t.tags.some(tag => p.likes.some(l => l.tag === tag)) && t.tags.some(tag => p.dislikes.includes(tag)))
                add('08', `/types/${i}/tags`, `"${t.id}" combines liked/disliked tags for "${p.id}"`);
    });
    const starterIds = itemTypeIds(c.charms.starterSet);
    if (starterIds.length < 6 || starterIds.length > 8 || new Set(starterIds).size !== starterIds.length)
        add('04', '/starterSet', 'starterSet requires 6–8 distinct ids', 'error');
    const used = new Set(Object.values(c.pets).flatMap(p => p.wants.flatMap(wantTags)));
    for (const tag of c.tags) {
        const count = c.charms.types.filter(t => t.tags.includes(tag.id)).length;
        if (count < (used.has(tag.id) ? 2 : 1))
            out.push(finding([
                'CHK-004-05', ...(used.has(tag.id) ? [
                    'CHK-009-08'
                ] : [])
            ], 'warning', 'tags.json', `/tags/${c.tags.indexOf(tag)}`, `Tag "${tag.id}" has ${count} catalogue fills`, undefined, {
                tag: tag.id, count
            }));
    }
    const n = c.charms.types.length;
    if (n < 24 || n > 30 || ([
        'small', 'large', 'wall'
    ] as const).some((cls, i) => Math.abs(c.charms.types.filter(t => t.sizeClass === cls).length / Math.max(1, n) - [
        .6, .25, .15
    ][i]) > .1))
        add('07', '/types', `Target catalogue is 24–30 types with size split within 10 percentage points of 60/25/15; found ${n}`);
    for (const cls of new Set(Object.values(c.rooms).flatMap(r => r.slots.map(s => s.sizeClass))))
        if (!c.charms.types.some(t => t.sizeClass === cls && starterIds.includes(t.id)))
            add('09', '/starterSet', `No starter type of size class "${cls}"`);
    return out;
}

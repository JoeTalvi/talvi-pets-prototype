import type { Content } from '../../content/types';
import { RequiredDialogueKeys } from '../../content/schema/strings';
import { finding, type Finding } from './types';
export function petLineCount(p: Content['pets'][string]): number {
    return p.lines.greeting.length + p.lines.chatter.length + p.lines.dislike.length + p.lines.intro.length + Object.keys(p.lines.wantAnnounce).length + Object.values(p.lines.vignettes).reduce((n, lines) => n + lines.length, 0);
}
function lineReporter() {
    const out: Finding[] = [];
    const add = (n: string, f: string, path: string, msg: string, level: 'error' | 'warning' = 'error', alias = false) => out.push(finding([
        `CHK-008-${n}`, ...(alias ? [
            'CHK-009-07'
        ] : [])
    ], level, f, path, msg));
    const line = (s: string, f: string, path: string, allowed: string[]) => {
        if (s.length > 140 || /[\r\n]/.test(s))
            add('05', f, path, 'Line must be <= 140 characters without newlines');
        const placeholders = s.match(/\{[^{}]*\}/g) ?? [];
        if (placeholders.some(p => !allowed.includes(p)))
            add('06', f, path, `Only ${allowed.join(', ') || 'no'} placeholders allowed`);
    };
    return { out, add, line };
}
function checkPetLines(p: Content["pets"][string]): Finding[] {
    const { out, add, line } = lineReporter();
    const f = `pets/${p.id}.json`;
    for (const key of [
        'greeting', 'chatter', 'dislike', 'intro', 'stripped' // stripped: WORK-033-2-1 A2
    ] as const) {
        if (p.lines[key].length < (key === 'chatter' ? 2 : 1))
            add('01', f, '/lines/' + key, `Insufficient ${key} lines`);
        p.lines[key].forEach((s, i) => line(s, f, `/lines/${key}/${i}`, [
            '{pet}'
        ]));
    }
    for (const key of [
        'wantAnnounce', 'vignettes'
    ] as const) {
        const names = p.wants.map(w => w.id);
        const ids = new Set([
            ...names, ...Object.keys(p.lines[key])
        ]);
        for (const id of ids) {
            const value = p.lines[key][id];
            const path = `/lines/${key}/${id}`;
            if (!names.includes(id) || value === undefined || (typeof value === 'string' ? !value.trim() : value.length === 0))
                add(key === 'wantAnnounce' ? '02' : '03', f, path, 'Line map must have exactly the want ids, each with non-empty content', 'error', true);
            if (Array.isArray(value)) {
                if (value.length > 0 && (value.length < 3 || value.length > 5))
                    add('03', f, path, 'Target vignette length is 3–5 lines', 'warning', true);
                value.forEach((s, i) => line(s, f, path + '/' + i, [
                    '{pet}'
                ]));
            }
            else if (typeof value === 'string')
                line(value, f, path, [
                    '{pet}'
                ]);
        }
    }
    const count = petLineCount(p);
    if (count < 25 || count > 60)
        add('09', f, '/lines', `Target is 25–60 pet lines; found ${count}`, 'warning');
    return out;
}
export function check008(c: Content): Finding[] {
    const { out, add, line } = lineReporter();
    for (const p of Object.values(c.pets))
        out.push(...checkPetLines(p));
    if (c.dialogue.orientation.length < 2)
        add('04', 'dialogue.json', '/orientation', 'At least 2 orientation lines required');
    c.dialogue.orientation.forEach((s, i) => line(s, 'dialogue.json', `/orientation/${i}`, []));
    c.projects.forEach((p, i) => {
        if (p.phaseMessages && p.phaseMessages.length !== 5)
            add('07', 'projects.json', `/projects/${i}/phaseMessages`, 'phaseMessages must have 5 entries');
        if (p.completionMessage && p.completionMessage.length === 0)
            add('07', 'projects.json', `/projects/${i}/completionMessage`, 'completionMessage must have at least 1 line');
        p.phaseMessages?.forEach((ls, j) => ls.forEach((s, k) => line(s, 'projects.json', `/projects/${i}/phaseMessages/${j}/${k}`, [])));
        p.completionMessage?.forEach((s, j) => line(s, 'projects.json', `/projects/${i}/completionMessage/${j}`, []));
    });
    for (const key of RequiredDialogueKeys)
        if (!(key in c.strings))
            add('08', 'strings.json', '/' + key, `Missing ${key}`);
    for (const [key, s] of Object.entries(c.strings))
        if (key.startsWith('tpp.bubble.'))
            line(s, 'strings.json', '/' + key, key === 'tpp.bubble.want' ? [
                '{tag}'
            ] : []);
    return out;
}

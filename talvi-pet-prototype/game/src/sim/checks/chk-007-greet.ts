import type { Content } from '../../content/types';
import { finding, type Finding } from './types';

/** WORK-036-1 (DEC-046, gate Q10(a)): the greeting compatibility table is symmetric and complete, and the emote band table
 * is usable. The pet rows apply once any pet authors `compatibility`, so content without greetings stays clean. */
export function checkGreetings(c: Content): Finding[] {
    const out: Finding[] = [];
    const add = (n: string, f: string, p: string, msg: string) => out.push(finding(`CHK-007-${n}`, 'error', f, p, msg));
    const ids = Object.keys(c.pets);
    if (Object.values(c.pets).some(p => p.compatibility !== undefined))
        for (const p of Object.values(c.pets)) {
            const f = `pets/${p.id}.json`, table = p.compatibility ?? {};
            for (const key of Object.keys(table))
                if (key === p.id || !ids.includes(key))
                    add('14', f, `/compatibility/${key}`, `Compatibility key "${key}" must name another known pet`);
            for (const other of ids.filter(id => id !== p.id)) {
                const mine = table[other], theirs = c.pets[other].compatibility?.[p.id];
                if (mine === undefined)
                    add('15', f, `/compatibility`, `Missing compatibility with "${other}" (every pair needs a value)`);
                else if (theirs !== undefined && mine !== theirs)
                    add('16', f, `/compatibility/${other}`, `Compatibility with "${other}" is ${mine} here but ${theirs} there`);
            }
        }
    const bands = c.tuning.greetEmoteWeights;
    if (bands !== undefined && (bands.length === 0 || !bands.some(b => b.minCompatibility === 0) ||
        bands.some(b => Object.values(b.weights).some(w => w < 0) || Object.values(b.weights).reduce((s, w) => s + w, 0) <= 0)))
        add('17', 'tuning.json', '/greetEmoteWeights', 'Greeting bands need a 0 band and non-negative weights with a positive sum');
    return out;
}

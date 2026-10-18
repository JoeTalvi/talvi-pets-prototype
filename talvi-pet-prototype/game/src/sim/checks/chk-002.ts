import type { Content } from '../../content/types';
import { finding, type Finding } from './types';
export function check002(c: Content): Finding[] {
    const out: Finding[] = [];
    const add = (n: string, p: string, msg: string, level: 'error' | 'warning' | 'info' = 'error', file = 'projects.json') => out.push(finding(`CHK-002-${n}`, level, file, p, msg));
    c.projects.forEach((p, i) => {
        const base = `/projects/${i}`;
        if (!p.name.trim() || !p.causeName.trim())
            add('01', base, 'name and causeName must be non-empty');
        if (!Number.isInteger(p.goalCents) || p.goalCents <= 0 || p.goalCents % 5 !== 0)
            add('01', base + '/goalCents', 'goalCents must be a positive integer divisible by 5');
        if (c.rooms[p.interiorRoomId]?.residentPetId !== p.residentPetId || c.projects.filter(q => q.interiorRoomId === p.interiorRoomId).length !== 1 || c.projects.filter(q => q.residentPetId === p.residentPetId).length !== 1)
            add('02', base, 'Project room/resident must agree and be unique');
        if (p.phaseRewards.length !== 5 || new Set(p.phaseRewards.flat()).size !== p.phaseRewards.flat().length)
            add('03', base + '/phaseRewards', 'phaseRewards needs 5 arrays with no duplicate type within this project');
        p.phaseRewards.forEach((ts, j) => {
            if (ts.length !== 2)
                add('03', base + `/phaseRewards/${j}`, 'Target is 2 types per phase', 'warning');
        });
    });
    if (!c.merchants.length)
        add('04', '/merchants', 'At least one merchant is required', 'error', 'merchants.json');
    c.merchants.forEach((m, i) => {
        if (!Number.isInteger(m.minCents) || !Number.isInteger(m.maxCents) || m.minCents <= 0 || m.minCents >= m.maxCents)
            add('04', `/merchants/${i}/minCents`, 'Merchant requires integers 0 < minCents < maxCents', 'error', 'merchants.json');
        if (m.name.length > 24)
            add('05', `/merchants/${i}/name`, 'Merchant name exceeds 24 characters', 'warning', 'merchants.json');
    });
    if (c.merchants.length < 30)
        add('05', '/merchants', 'Fewer than 30 merchants', 'info', 'merchants.json');
    if (c.tuning.eventIntervalMs < 250)
        add('06', '/eventIntervalMs', 'eventIntervalMs must be at least 250', 'error', 'tuning.json');
    if (c.tuning.toastMs <= 0)
        add('06', '/toastMs', 'toastMs must be positive', 'error', 'tuning.json');
    return out;
}

import type { Content } from '../../content/types';
import type { AssetManifest } from '../../content/schema/assets';
import { coreChecks } from './chk-core';
import { check001 } from './chk-001';
import { check002 } from './chk-002';
import { check003 } from './chk-003';
import { check004 } from './chk-004';
import { check005 } from './chk-005';
import { check006 } from './chk-006';
import { check007 } from './chk-007';
import { check008 } from './chk-008';
import { check009 } from './chk-009';
import { compareFindings, type CheckOptions } from './types';
export type { Finding, CheckOptions } from './types';
export const registeredIds = [
    'CHK-CORE-01', 'CHK-CORE-02', 'CHK-CORE-03', ...[
        16, 6, 4, 9, 10, 3, 17, 9, 21
    ].flatMap((count, i) => Array.from({
        length: count
    }, (_, n) => `CHK-${String(i + 1).padStart(3, '0')}-${String(n + 1).padStart(2, '0')}`))
];
export function validateOptions(c: Content, opts: CheckOptions): void {
    for (const prefix of opts.only ?? [])
        if (prefix !== 'ZOD' && !registeredIds.some(id => id.startsWith(prefix)))
            throw new Error(`Unknown check prefix ${prefix}; known: ${registeredIds.join(', ')}`);
    if (opts.room && !c.rooms[opts.room])
        throw new Error(`Unknown room ${opts.room}`);
    if (opts.pet && !c.pets[opts.pet])
        throw new Error(`Unknown pet ${opts.pet}`);
}
export function runContentChecks(c: Content, m?: AssetManifest, opts: CheckOptions = {}) {
    validateOptions(c, opts);
    const all = [
        ...coreChecks.flatMap(check => check.run(c, m)), ...check001(c, m), ...check002(c), ...check003(c), ...check004(c), ...check005(c), ...check006(c), ...check007(c), ...check008(c), ...check009(c)
    ];
    const pet = opts.pet ?? (opts.room ? c.rooms[opts.room].residentPetId : undefined);
    const room = opts.room ?? (opts.pet ? Object.values(c.rooms).find(r => r.residentPetId === opts.pet)?.id : undefined);
    return all.filter(f => (!opts.only || f.ids.some(id => opts.only!.some(prefix => id.startsWith(prefix)))) && (!room || !f.file.startsWith('rooms/') || f.file === `rooms/${room}.json`) && (!pet || !f.file.startsWith('pets/') || f.file === `pets/${pet}.json`)).sort(compareFindings);
}

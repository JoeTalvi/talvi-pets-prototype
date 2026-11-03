import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { registeredIds, runContentChecks } from '../../src/sim/checks';
import { validContent, manifest, files, patchFiles, rawContent, type Patch } from './helpers';
it('accepts synthetic minimum content with every error-level check and retains warnings', () => {
    const findings = runContentChecks(validContent(), manifest);
    expect(findings.filter(f => f.level === 'error')).toEqual([]);
    expect(findings.some(f => f.level === 'warning')).toBe(true);
    expect(new Set(registeredIds).size).toBe(94); // WORK-032-1: CHK-001-11..14; WORK-033-1: CHK-009-17; WORK-034-2: CHK-001-15/16, CHK-005-09/10, CHK-009-18..21; WORK-035-1: CHK-007-09..13
});
for (const id of registeredIds)
    it(`${id} has an executable triggering JSON patch`, () => {
        const patch = JSON.parse(readFileSync(`tests/fixtures/content/${id}.json`, 'utf8')) as Patch[];
        expect(patch.length).toBeGreaterThan(0);
        const findings = runContentChecks(rawContent(patchFiles(files(), patch)), manifest);
        const baseline = new Set(runContentChecks(validContent(), manifest).map(f => JSON.stringify(f)));
        expect(findings.some(f => f.ids.includes(id) && !baseline.has(JSON.stringify(f)))).toBe(true);
    });
it('reports overlapping facts once, with every applicable alias', () => {
    const c = validContent();
    c.pets.dog.wants[2].conditions.push({
        kind: 'stars', min: 49
    });
    const f = runContentChecks(c, manifest).filter(f => f.ids.includes('CHK-009-04'));
    expect(f).toHaveLength(1);
    expect(f[0].ids).toContain('CHK-005-08');
});
it('keeps hidden tags in coverage and rejects self/late Heart-only sources', () => {
    const c = validContent();
    c.projects[1].phaseRewards[0] = [{ typeId: 'fern', count: 1 }];
    const w = c.pets.dog.wants[2];
    w.reward = [{ kind: 'items', items: [{ typeId: 'ball', count: 1 }] }];
    const findings = runContentChecks(c, manifest, {
        only: [
            'CHK-009-09'
        ]
    });
    expect(findings).toHaveLength(1);
    expect(findings[0].level).toBe('error');
    expect(findings[0].details?.tag).toBe('toy');
});
it('does not suppress errors with an absent manifest; only asset-dependent checks are informational', () => {
    const c = validContent();
    c.tuning.starsRepeat = 5;
    const f = runContentChecks(c);
    expect(f.some(x => x.ids.includes('CHK-CORE-03') && x.level === 'info')).toBe(true);
    expect(f.some(x => x.ids.includes('CHK-006-01') && x.level === 'error')).toBe(true);
});
it('filters prefixes and scopes and rejects invalid filters', () => {
    const c = validContent();
    expect(runContentChecks(c, manifest, {
        only: [
            'CHK-006'
        ], room: 'dog-room'
    }).every(f => f.file === 'rooms/dog-room.json')).toBe(true);
    expect(() => runContentChecks(c, manifest, {
        only: [
            'NOT-A-CHECK'
        ]
    })).toThrow('Unknown check');
    expect(() => runContentChecks(c, manifest, {
        pet: 'missing'
    })).toThrow('Unknown pet');
});
it('early coverage follows resolved rising projects when ids change', () => {
    const c = validContent();
    c.projects[1].id = 'renamed-home';
    c.street.houses[1].projectId = 'renamed-home';
    expect(runContentChecks(c, manifest).filter(f => f.level === 'error')).toEqual([]);
});

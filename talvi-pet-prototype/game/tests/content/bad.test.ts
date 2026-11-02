import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ContentError, loadContent, type ContentFiles } from '../../src/content/load';
import { runContentChecks } from '../../src/sim/checks';
import { manifest } from './helpers';
const cases: Record<string, string[]> = {
    'chk-001-04-spawn-in-door': [
        'CHK-001-04'
    ], 'chk-001-11-blocker-off-scene': [
        'CHK-001-11'
    ], 'chk-001-12-spawn-in-blocker': [
        'CHK-001-12'
    ], 'chk-001-13-door-in-blocker': [
        'CHK-001-13'
    ], 'chk-001-14-arrival-in-other-blocker': [
        'CHK-001-14'
    ], 'chk-005-02-asym-adjacency': [
        'CHK-005-02'
    ], 'chk-006-01-stars-repeat-5': [
        'CHK-006-01'
    ], 'chk-009-03': [
        'CHK-009-03'
    ], 'chk-009-05': [
        'CHK-009-05'
    ], 'chk-009-09': [
        'CHK-009-09'
    ], 'chk-009-10': [
        'CHK-009-10'
    ], 'goal-1001': [
        'CHK-002-01'
    ], 'house-missing': [
        'CHK-CORE-02'
    ], 'merchant-min-ge-max': [
        'CHK-002-04'
    ], 'four-clue-cards': [
        'CHK-003-01'
    ], 'missing-silhouette': [
        'CHK-003-01'
    ], 'unknown-hint-tag': [
        'CHK-CORE-02'
    ], 'card-name-leak': [
        'CHK-003-04'
    ], 'chk-007-wall-crossing-segment': [
        'CHK-007-07'
    ], 'chk-007-two-verbs-one-tag': [
        'CHK-007-01'
    ], 'chk-007-owl-sit-on': [
        'CHK-007-04'
    ], 'chk-008-missing-want-announce': [
        'CHK-008-02'
    ], 'chk-008-160-char-line': [
        'CHK-008-05'
    ], 'chk-008-one-orientation-line': [
        'CHK-008-04'
    ], 'unknown-cross-ref': [
        'CHK-CORE-02'
    ], 'duplicate-phase-rewards': [
        'CHK-002-03'
    ]
};
/** WORK-032-1: each CHK-001-11..14 fixture names its exact JSON path. */
const blockerPaths: Record<string, string> = {
    'chk-001-11-blocker-off-scene': '/houses/0/blockers/0', 'chk-001-12-spawn-in-blocker': '/playerSpawn',
    'chk-001-13-door-in-blocker': '/houses/0/door/rect', 'chk-001-14-arrival-in-other-blocker': '/houses/1/arrivalPath/1'
};
describe('named single-fault fixtures', () => {
    for (const [name, expected] of Object.entries(cases))
        it(name, () => {
            const files = JSON.parse(readFileSync(`tests/fixtures/bad/${name}.json`, 'utf8')) as ContentFiles;
            try {
                const f = runContentChecks(loadContent(manifest, files), manifest);
                const errors = f.filter(x => x.level === 'error');
                if (name === 'card-name-leak') {
                    expect(errors).toEqual([]);
                    expect(f.some(x => x.ids.includes('CHK-003-04'))).toBe(true);
                }
                else {
                    expect([
                        ...new Set(errors.map(x => x.ids[0]))
                    ]).toEqual(expected);
                    expect(errors.every(x => x.path.startsWith('/'))).toBe(true);
                    if (name in blockerPaths)
                        expect(errors.map(x => x.path)).toEqual([blockerPaths[name]]);
                }
            }
            catch (e) {
                if (!(e instanceof ContentError))
                    throw e;
                expect([
                    ...new Set(e.issues.map(x => x.ids?.[0]))
                ]).toEqual(expected);
                expect(e.issues.every(x => x.file && x.path.length)).toBe(true);
            }
        });
    it('invalid size class names the exact schema field', () => {
        const files = JSON.parse(readFileSync('tests/fixtures/bad/charms-bad-size-class.json', 'utf8'));
        try {
            loadContent(manifest, files);
            throw new Error('Expected ContentError');
        }
        catch (e) {
            expect(e).toBeInstanceOf(ContentError);
            expect((e as ContentError).issues[0]).toMatchObject({
                file: 'charms.json', path: [
                    'types', 3, 'sizeClass'
                ]
            });
        }
    });
});

import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { it, expect } from 'vitest';
import { runContentChecks } from '../../src/sim/checks';
import { manifest, validContent } from './helpers';
const runner = 'node_modules/tsx/dist/cli.mjs';
const input = [
    '--content', 'tests/fixtures/content-min', '--manifest', 'tests/fixtures/content-min/manifest.json'
];
function cli(extra: string[] = [], tool = 'check-content') {
    const r = spawnSync(process.execPath, [
        runner, `tools/${tool}.ts`, ...input, ...extra
    ], {
        encoding: 'utf8'
    });
    if (r.error)
        throw r.error;
    return r;
}
it('JSON findings exactly equal the shared registry and output is byte-stable', () => {
    const a = cli([
        '--format', 'json'
    ]), b = cli([
        '--format', 'json'
    ]);
    expect(a.status).toBe(0);
    expect(a.stdout).toBe(b.stdout);
    const report = JSON.parse(a.stdout);
    expect(report.findings).toEqual(runContentChecks(validContent(), manifest));
    expect(report.counts).toMatchObject({
        errors: 0, checks: 81, files: 13
    });
});
it('returns 1 and located asymmetry; 2 only for strict warnings', () => {
    const bad = cli([
        '--content', 'tests/fixtures/bad/chk-005-02-asym-adjacency'
    ]);
    expect(bad.status).toBe(1);
    expect(bad.stdout).toContain('CHK-005-02  rooms/dog-room.json:/slots/0/adjacent/0');
    expect(cli([
        '--strict'
    ]).status).toBe(2);
    expect(cli().stdout).toContain('0 errors');
});
it('bad flags, unknown prefixes, unreadable inputs and deferred previews fail with exit 3', () => {
    for (const args of [
        [
            '--unknown'
        ], [
            '--only', 'NOPE'
        ], [
            '--content', 'missing-dir'
        ]
    ])
        expect(cli(args).status).toBe(3);
    for (const flag of [
        '--panel', '--reveal', '--stars'
    ]) {
        const r = cli([
            flag
        ], 'coverage');
        expect(r.status).toBe(3);
        // WORK-003-6 landed the previews; a bare preview flag is now a missing-value usage error (still exit 3).
        expect(r.stderr).toMatch(/needs (a value|--save)/);
    }
});
it('schema failures exit 1 and aggregate located issues', () => {
    const r = cli([
        '--content', 'tests/fixtures/bad/charms-bad-size-class.json', '--format', 'json'
    ]);
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout).zodIssues[0]).toMatchObject({
        file: 'charms.json', path: '/types/3/sizeClass'
    });
});
it('only emits the requested check family and writes solely requested output', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tpp-content-'));
    try {
        const path = join(dir, 'report.json'), r = cli([
            '--only', 'CHK-006', '--room', 'dog-room', '--format', 'json', '--out', path
        ]);
        expect(r.status).toBe(0);
        expect(r.stdout).toBe('');
        expect(JSON.parse(readFileSync(path, 'utf8')).findings.every((f: {
            ids: string[];
            file: string;
        }) => f.ids.some(id => id.startsWith('CHK-006')) && f.file === 'rooms/dog-room.json')).toBe(true);
    }
    finally {
        rmSync(dir, {
            recursive: true, force: true
        });
    }
});
it('coverage A–F reports actual source timeline and Stars reachability', () => {
    const r = cli([
        '--format', 'json'
    ], 'coverage');
    expect(r.status).toBe(0);
    const report = JSON.parse(r.stdout);
    const tags = report.pets.dog.wants[1].tags;
    expect(tags.find((t: {
        tag: string;
    }) => t.tag === 'plant').earliestSource).toMatchObject({
        kind: 'phase', projectId: 'pet-house', phase: 1, typeId: 'fern'
    });
    expect(tags.find((t: {
        tag: string;
    }) => t.tag === 'light').earliestSource).toMatchObject({
        kind: 'starter', typeId: 'lamp'
    });
    expect(report.rooms['dog-room']).toMatchObject({
        max: 48, reachableMax: 42
    });
    expect(report.pets.dog.rewardKinds).toEqual({
        items: 1, verb: 1, vignette: 1
    });
    expect(report.projects['pet-house'].cards).toHaveLength(5);
    const txt = cli([], 'coverage').stdout;
    for (const section of [
        'A —', 'B —', 'C —', 'D —', 'E —', 'F —'
    ])
        expect(txt).toContain(section);
    expect(txt).toContain('plant ← Pet House phase 1 (fern)');
    expect(txt).toContain('light ← starter (lamp)');
});
it('Node CLI has no import.meta.glob runtime dependency', () => {
    const out = execFileSync(process.execPath, [
        runner, 'tools/check-content.ts', '--help'
    ], {
        encoding: 'utf8'
    });
    expect(out).toContain('check:content');
});

import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, rmSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { AssetManifest, AssetEntry } from '../../src/content/schema/assets';
import { checkClips, checkLedger, gitBaseline } from '../../tools/assets/checks';
import { alphaIoU, bounds, decodePng, dimensions } from '../../tools/assets/image';
import { assetPath, flags, type Finding } from '../../tools/assets/common';
import { main as checkAssets } from '../../tools/check-assets';
const manifest = AssetManifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const fixture = (name: string) => decodePng(readFileSync(`tests/content/asset-fixtures/${name}.png`));
function findings(next: typeof manifest, old: typeof manifest) {
    const result: Finding[] = [];
    checkLedger(next, old, (id, level, path, message) => result.push({ ids: [id], level, path, message, file: 'manifest.json' }));
    return result;
}
describe('asset registry and independent validation', () => {
    it('parses real production exports and all asset bytes exist', () => {
        for (const e of manifest.entries)
            for (const url of e.urls ?? [e.url!])
                expect(readFileSync(assetPath('public/assets', url)).length).toBeGreaterThan(0);
    });
    it('rejects duplicate IDs and malformed loader contracts', () => {
        expect(AssetManifest.safeParse({ ...manifest, entries: [manifest.entries[0], manifest.entries[0]] }).success).toBe(false);
        expect(AssetEntry.safeParse({ ...manifest.entries[0], url: undefined }).success).toBe(false);
        expect(AssetEntry.safeParse({ ...manifest.entries[0], status: 'accepted' }).success).toBe(false);
    });
    it('checks clip ranges, backwards clips and nonintegral sheet grids', () => {
        const dust = manifest.entries.find(e => e.id === 'world/dust-poof')!;
        expect(checkClips(dust)).toEqual([]);
        expect(checkClips({ ...dust, clips: { dust: { start: 9, end: 8, frameRate: 18, repeat: 0 } } }).length).toBeGreaterThan(0);
        expect(checkClips({ ...dust, frame: { w: 321, h: 320 } }).length).toBeGreaterThan(0);
        expect(checkClips({ ...dust, clips: { dust: { start: 0, end: 9, frameRate: 18, repeat: 0 } } }).length).toBeGreaterThan(0);
    });
    it('decodes synthetic alpha masks and distinguishes shifted silhouettes', () => {
        expect(alphaIoU(fixture('portrait'), fixture('silhouette'))).toBe(1);
        expect(alphaIoU(fixture('portrait'), fixture('wrong-silhouette'))).toBe(0);
        expect(bounds(fixture('portrait'))).toEqual({ bottomGap: 0, centerOffset: 0 });
    });
    it('checks measured exported dimensions', () => {
        for (const e of manifest.entries.filter(e => e.px && !e.html))
            expect(dimensions(readFileSync(assetPath('public/assets', e.url!)))).toEqual(e.px);
    });
    it('detects deleted rows, truncated histories and missing replacement snapshots', () => {
        expect(findings({ ...manifest, entries: [] }, manifest).some(f => f.message === 'Ledger id removed')).toBe(true);
        const row = manifest.entries[0], changed = { ...row, hash: 'a'.repeat(64) };
        expect(findings({ ...manifest, entries: [changed] }, { ...manifest, entries: [row] }).some(f => f.message.includes('snapshot'))).toBe(true);
        const history = { hash: row.hash, status: row.status, origin: row.origin, source: row.source, recordedAt: row.recordedAt, recordedBy: row.recordedBy };
        expect(findings({ ...manifest, entries: [row] }, { ...manifest, entries: [{ ...row, history: [history] }] }).some(f => f.message.includes('Historical'))).toBe(true);
    });
    it('rejects changes to human accepted rows', () => {
        const row = { ...manifest.entries[0], status: 'accepted' as const, acceptedBy: 'human', acceptedAt: '2026-10-17', acceptedReason: 'fixture only' };
        expect(findings({ ...manifest, entries: [{ ...row, note: 'changed' }] }, { ...manifest, entries: [row] }).some(f => f.message.includes('Human-accepted'))).toBe(true);
    });
    it('rejects traversal and unknown flags before touching files', () => {
        expect(() => assetPath('public/assets', '../outside.png')).toThrow();
        expect(() => assetPath('public/assets', 'https://example.com/a.png')).toThrow();
        expect(() => flags(['--wat'], ['format'])).toThrow();
        expect(() => flags(['--format', 'xml'], ['format'])).toThrow();
    });
});
describe('VERIFY-ASSET-007 Git baseline', () => {
    it('resolves monorepo Git prefix and preserves committed ledger entries', () => {
        const baseline = gitBaseline('public/assets/manifest.json');
        if (!baseline) {
            // Fresh copy without the manifest in Git HEAD: same disposition as check-assets --no-git.
            process.stdout.write('assets.test: no committed manifest baseline; ledger comparison skipped as with --no-git\n');
            expect(findings(manifest, manifest)).toEqual([]);
            return;
        }
        expect(findings(manifest, baseline)).toEqual([]);
    });
    it('returns no baseline outside a Git work tree instead of throwing', () => {
        const dir = mkdtempSync(join(tmpdir(), 'tpp-nogit-'));
        try {
            writeFileSync(join(dir, 'manifest.json'), JSON.stringify(manifest));
            expect(gitBaseline(join(dir, 'manifest.json'))).toBeUndefined();
        }
        finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});
const dog = manifest.entries.find(e => e.id === 'pets/dog-sheet')!;
const withIdle = (idle: Record<string, unknown>) => ({ ...dog, clips: { ...dog.clips, idle: { ...dog.clips!.idle, ...idle } } });
/** Runs the real check-assets CLI on a temporary manifest (optionally beside a copy of the dog sheet). */
function checkFixture(entries: unknown[], withSheet = false): Finding[] {
    const dir = mkdtempSync(join(tmpdir(), 'tpp-assets-'));
    try {
        const file = join(dir, 'manifest.json'), out = join(dir, 'report.json');
        if (withSheet) {
            mkdirSync(join(dir, 'pets'));
            copyFileSync('public/assets/pets/dog-sheet.png', join(dir, 'pets/dog-sheet.png'));
        }
        writeFileSync(file, JSON.stringify({ ...manifest, entries }));
        checkAssets(['--manifest', file, '--format', 'json', '--out', out, '--no-git']);
        return JSON.parse(readFileSync(out, 'utf8')).findings as Finding[];
    }
    finally {
        rmSync(dir, { recursive: true, force: true });
    }
}
describe('CN-07 explicit per-frame clip timing', () => {
    it('accepts the integrated dog idle with frameRate and [2600, 80, 120, 80]', () => {
        expect(dog.clips!.idle).toEqual({ start: 0, end: 3, frameRate: 6, repeat: -1, frameDurationsMs: [2600, 80, 120, 80] });
        expect(AssetEntry.safeParse(dog).success).toBe(true);
        expect(checkClips(dog)).toEqual([]);
    });
    it('rejects a wrong-length array in schema and VERIFY-ASSET-005 clip check', () => {
        expect(AssetEntry.safeParse(withIdle({ frameDurationsMs: [2600, 80, 120] })).success).toBe(false);
        expect(AssetEntry.safeParse(withIdle({ frameDurationsMs: [2600, 80, 120, 80, 80] })).success).toBe(false);
        expect(checkClips(withIdle({ frameDurationsMs: [2600, 80, 120] }) as AssetEntry)).toEqual([expect.stringContaining('length 3')]);
    });
    it('rejects zero, negative and fractional durations', () => {
        for (const bad of [[2600, 0, 120, 80], [2600, -80, 120, 80], [2600, 80.5, 120, 80]]) {
            expect(AssetEntry.safeParse(withIdle({ frameDurationsMs: bad })).success).toBe(false);
            expect(checkClips(withIdle({ frameDurationsMs: bad }) as AssetEntry)).toEqual([expect.stringContaining('positive integers')]);
        }
    });
    it('keeps frameRate required even when durations are present', () => {
        const idle: Record<string, unknown> = { ...dog.clips!.idle };
        delete idle.frameRate;
        expect(AssetEntry.safeParse({ ...dog, clips: { ...dog.clips, idle } }).success).toBe(false);
    });
    it('check-assets reports bad timing as a VERIFY-ASSET-005 error on a fixture manifest', () => {
        expect(checkFixture([withIdle({ frameDurationsMs: [2600, 0, 120] })])).toContainEqual(expect.objectContaining({ ids: ['VERIFY-ASSET-005'], level: 'error', path: '/entries/0/clips/idle/frameDurationsMs' }));
    });
});
describe('VERIFY-ASSET-004 sheet cells', () => {
    it('skips transparent unused cells but not empty cells inside a clip', () => {
        const pivots = (clips: AssetEntry['clips']) => checkFixture([{ ...dog, clips }], true).filter(f => f.ids[0] === 'VERIFY-ASSET-004');
        expect(pivots(dog.clips)).toEqual([]);
        const widened = pivots({ ...dog.clips, walk: { start: 4, end: 11, frameRate: 10, repeat: -1 } });
        expect(widened.map(f => (f.details as { frame: { x: number } }).frame.x)).toEqual([1024, 1280]);
    });
});

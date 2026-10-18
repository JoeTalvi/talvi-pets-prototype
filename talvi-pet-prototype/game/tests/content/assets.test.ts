import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { AssetManifest, AssetEntry } from '../../src/content/schema/assets';
import { checkClips, checkLedger, gitBaseline } from '../../tools/assets/checks';
import { alphaIoU, bounds, decodePng, dimensions } from '../../tools/assets/image';
import { assetPath, flags, type Finding } from '../../tools/assets/common';
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
    it('resolves monorepo Git prefix and preserves committed ledger entries', () => {
        const baseline = gitBaseline('public/assets/manifest.json');
        expect(baseline).toBeDefined();
        expect(findings(manifest, baseline!)).toEqual([]);
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

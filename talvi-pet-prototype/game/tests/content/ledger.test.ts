import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main as ledger } from '../../tools/asset-ledger';
import { AssetManifest } from '../../src/content/schema/assets';
const real = AssetManifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
let dir: string, file: string, source: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tpp-ledger-'));
    file = join(dir, 'manifest.json');
    source = join(dir, 'source.png');
    copyFileSync('tests/content/asset-fixtures/portrait.png', source);
    writeFileSync(file, JSON.stringify({ ...real, entries: real.entries.filter(e => e.id === 'charms/lamp') }, null, 2) + '\n');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));
const append = (extra: string[]) => ledger(['append', '--manifest', file, '--id', 'charms/lamp-derived', '--from', source, '--recorded-by', 'TASK-077 test', '--date', '2026-10-20', '--format', 'json', '--out', join(dir, 'out.json'), ...extra]);
describe('asset-ledger derived-source rule (F-11, shared with check-assets VERIFY-ASSET-007)', () => {
    it('rejects a derived row whose source is an external path and leaves the manifest untouched', () => {
        const before = readFileSync(file);
        expect(() => append(['--origin', 'derived', '--source', '/external/path/lamp.png'])).toThrow(/VERIFY-ASSET-007: Derived source is an external path/);
        expect(readFileSync(file)).toEqual(before);
    });
    it('rejects a derived row whose status differs from its runtime parent', () => {
        expect(() => append(['--origin', 'derived', '--source', 'charms/lamp', '--status', 'production-reference'])).toThrow(/inherit parent status/);
    });
    it('accepts a derived row whose source is a runtime AssetId with the parent status', () => {
        expect(append(['--origin', 'derived', '--source', 'charms/lamp'])).toBe(0);
        const written = AssetManifest.parse(JSON.parse(readFileSync(file, 'utf8'))).entries.find(e => e.id === 'charms/lamp-derived');
        expect(written).toMatchObject({ origin: 'derived', source: 'charms/lamp', status: 'ai-placeholder' });
    });
});

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, describe, expect, it } from 'vitest';
import { readKnownMissing, type Finding } from '../../tools/assets/common';
import { contentChecks } from '../../tools/assets/checks';
import { AssetManifest } from '../../src/content/schema/assets';
import { manifest } from './helpers';
const runner = 'node_modules/tsx/dist/cli.mjs', dir = mkdtempSync(join(tmpdir(), 'tpp-known-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
/** Fixture manifest without fern and ball, so two charm sprites fail to resolve. */
const partial: AssetManifest = { ...manifest, entries: manifest.entries.filter(e => e.id !== 'charms/fern' && e.id !== 'charms/ball') };
const manifestFile = join(dir, 'manifest.json');
writeFileSync(manifestFile, JSON.stringify(partial));
function knownFile(name: string, assets: unknown): string {
    const file = join(dir, name);
    writeFileSync(file, JSON.stringify({ assets }));
    return file;
}
function checkContent(extra: string[]) {
    const r = spawnSync(process.execPath, [runner, 'tools/check-content.ts', '--content', 'tests/fixtures/content-min', '--manifest', manifestFile, '--format', 'json', ...extra], { encoding: 'utf8' });
    if (r.error)
        throw r.error;
    return { status: r.status, stderr: r.stderr, report: r.stdout ? JSON.parse(r.stdout) : undefined };
}
describe('check-content continues past unresolved assets (F-04)', () => {
    it('without --known-missing: resolution errors stay errors and every CHK check still runs', () => {
        const { status, report } = checkContent([]);
        expect(status).toBe(1);
        const messages: string[] = report.zodIssues.map((i: { message: string }) => i.message);
        expect([...new Set(messages)].sort()).toEqual(['Asset "charms/ball" must resolve as image', 'Asset "charms/fern" must resolve as image']);
        expect(report.counts).toMatchObject({ errors: messages.length, checks: 76 });
        expect(report.findings.some((f: Finding) => f.ids[0] === 'CHK-CORE-03' && f.level === 'error')).toBe(false);
    });
    it('downgrades only listed IDs; an unlisted missing ID still fails', () => {
        const { status, report } = checkContent(['--known-missing', knownFile('fern.json', [{ id: 'charms/fern', batch: 'WORK-018' }])]);
        expect(status).toBe(1);
        expect(new Set(report.zodIssues.map((i: { message: string }) => i.message))).toEqual(new Set(['Asset "charms/ball" must resolve as image']));
        expect(report.findings).toContainEqual(expect.objectContaining({ ids: ['ZOD', 'KNOWN-MISSING'], level: 'warning', message: 'Asset "charms/fern" must resolve as image', hint: expect.stringContaining('WORK-018') }));
    });
    it('exits 0 when every missing ID is listed and reports listed IDs that already resolve', () => {
        const file = knownFile('all.json', [{ id: 'charms/fern', batch: 'WORK-018' }, { id: 'charms/ball', batch: 'WORK-018' }, { id: 'charms/lamp', batch: 'WORK-018' }]);
        const { status, report } = checkContent(['--known-missing', file]);
        expect(status).toBe(0);
        expect(report.counts.errors).toBe(0);
        expect(report.findings).toContainEqual(expect.objectContaining({ ids: ['KNOWN-MISSING'], level: 'info', message: expect.stringContaining('charms/lamp now resolves') }));
        expect(checkContent(['--known-missing', file, '--strict']).status).toBe(2);
    });
    it('rejects a malformed known-missing file with exit 3', () => {
        expect(checkContent(['--known-missing', knownFile('bad.json', [{ id: 'charms/fern' }])]).status).toBe(3);
        expect(checkContent(['--known-missing', knownFile('dup.json', [{ id: 'charms/fern', batch: 'WORK-018' }, { id: 'charms/fern', batch: 'WORK-022' }])]).status).toBe(3);
    });
});
describe('check-assets VERIFY-ASSET-001 honours the same list', () => {
    const run = (m: AssetManifest, known?: Map<string, string>) => {
        const out: { level: string; message: string }[] = [];
        contentChecks(m, resolve('tests/fixtures/content-min'), (id, level, _path, message) => { if (id === '001') out.push({ level, message }); }, known && { ids: known, file: 'known.json' });
        return [...new Set(out.filter(f => f.message.includes('charms/fern')).map(f => f.level))];
    };
    it('reports an absent ID as an error by default and as a warning only when listed', () => {
        expect(run(partial)).toEqual(['error']);
        expect(run(partial, new Map([['charms/fern', 'WORK-018']]))).toEqual(['warning']);
    });
    it('keeps a retired listed ID as an error', () => {
        const retired = { ...manifest, entries: manifest.entries.map(e => e.id === 'charms/fern' ? { ...e, retired: true } : e) };
        expect(run(retired, new Map([['charms/fern', 'WORK-018']]))).toEqual(['error']);
    });
});
it('the shipped list parses: every row is a WORK-022 id absent from the manifest and referenced by src/content', () => {
    const known = readKnownMissing('tools/known-missing-assets.json');
    const rows = JSON.parse(readFileSync('tools/known-missing-assets.json', 'utf8')).assets as { id: string }[];
    expect(known.size).toBe(rows.length);
    const shipped = new Set((JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')).entries as { id: string }[]).map(e => e.id));
    const contentText = readdirSync('src/content', { recursive: true, encoding: 'utf8' }).filter(f => f.endsWith('.json')).map(f => readFileSync(join('src/content', f), 'utf8')).join('\n');
    for (const [id, batch] of known) {
        expect(batch).toMatch(/^WORK-022/);
        expect(shipped.has(id), id).toBe(false);
        expect(contentText.includes(`"${id}"`), id).toBe(true);
    }
});
describe('check-assets VERIFY-ASSET-002 per-type canvas (play-session Q3, 2026-10-26)', () => {
    const run = (px: { w: number; h: number }) => {
        const contentDir = mkdtempSync(join(dir, 'canvas-'));
        writeFileSync(join(contentDir, 'charms.json'), JSON.stringify({ types: [{ id: 'bookshelf', sizeClass: 'wall', sprite: 'charms/bookshelf', canvas: { w: 192, h: 256 } }] }));
        const m = AssetManifest.parse({ ...manifest, entries: manifest.entries.map(e => e.id === 'charms/bookshelf' ? { ...e, px } : e) });
        const out: string[] = [];
        contentChecks(m, contentDir, (id, _level, _path, message) => { if (id === '002') out.push(message); });
        return out;
    };
    it('accepts a sprite that matches the type canvas and rejects the class canvas', () => {
        expect(run({ w: 192, h: 256 })).toEqual([]);
        expect(run({ w: 128, h: 128 })).toEqual(['charms/bookshelf: canvas differs from the type canvas 192×256']);
    });
});

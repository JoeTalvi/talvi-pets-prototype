import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { main as ledger } from '../../tools/asset-ledger';
import { AssetManifest } from '../../src/content/schema/assets';
import { checkLedger } from '../../tools/assets/checks';
import { encodePng } from '../../tools/assets/refit';
const real = AssetManifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
/** The lamp row as an unaccepted placeholder: the tests exercise accept/replace/retire on it whatever its shipped status. */
function lampOnly() {
    const lamp: Record<string, unknown> = { ...real.entries.find(e => e.id === 'charms/lamp')!, status: 'ai-placeholder' };
    for (const key of ['acceptedBy', 'acceptedAt', 'acceptedReason']) delete lamp[key];
    return JSON.stringify({ ...real, entries: [lamp] }, null, 2);
}
let dir: string, file: string, source: string;
beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tpp-ledger-'));
    file = join(dir, 'manifest.json');
    source = join(dir, 'source.png');
    copyFileSync('tests/content/asset-fixtures/portrait.png', source);
    writeFileSync(file, lampOnly() + '\n');
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
// Workflow layout: <project>/game/public/assets/manifest.json and <project>/phase-3-preproduction/approvals/<record>.
let project: string, manifest: string;
const record = 'phase-3-preproduction/approvals/approval-test.md';
function setupProject() {
    project = mkdtempSync(join(tmpdir(), 'tpp-accept-'));
    manifest = join(project, 'game/public/assets/manifest.json');
    mkdirSync(dirname(manifest), { recursive: true });
    mkdirSync(join(project, 'phase-3-preproduction/approvals'), { recursive: true });
    mkdirSync(join(project, 'phase-3-preproduction/other'), { recursive: true });
    writeFileSync(join(project, record), '# test approval\n');
    writeFileSync(join(project, 'phase-3-preproduction/other/note.md'), '# not an approval\n');
    writeFileSync(manifest, lampOnly() + '\n');
}
const read = () => AssetManifest.parse(JSON.parse(readFileSync(manifest, 'utf8'))).entries.find(e => e.id === 'charms/lamp')!;
const accept = (recordPath: string) => ledger(['accept', '--manifest', manifest, '--id', 'charms/lamp', '--by', 'Test Human', '--reason', 'Looks good (DEC-040).', '--record', recordPath, '--date', '2026-10-21', '--out', join(project, 'out.json')]);
describe('asset-ledger accept (DEC-040: human-instructed acceptance with an approval record)', () => {
    beforeEach(setupProject);
    afterEach(() => rmSync(project, { recursive: true, force: true }));
    it('writes status, acceptedBy, acceptedAt and acceptedReason ending with the record path, and appends history', () => {
        const before = read();
        expect(accept(record)).toBe(0);
        const after = read();
        expect(after).toMatchObject({ status: 'accepted', acceptedBy: 'Test Human', acceptedAt: '2026-10-21', hash: before.hash, url: before.url });
        expect(after.acceptedReason!.startsWith('Looks good (DEC-040).')).toBe(true);
        expect(after.acceptedReason!.endsWith(record)).toBe(true);
        expect(after.history).toEqual([...before.history, { hash: before.hash, status: before.status, origin: before.origin, source: before.source, recordedAt: before.recordedAt, recordedBy: before.recordedBy, ...(before.note ? { note: before.note } : {}) }]);
    });
    it('passes the check-assets only-grows ledger comparison against the previous manifest', () => {
        const previous = AssetManifest.parse(JSON.parse(readFileSync(manifest, 'utf8')));
        accept(record);
        const findings: string[] = [];
        checkLedger(AssetManifest.parse(JSON.parse(readFileSync(manifest, 'utf8'))), previous, (_id, _level, _path, message) => findings.push(message));
        expect(findings).toEqual([]);
    });
    it('refuses a missing record file and leaves the manifest untouched', () => {
        const before = readFileSync(manifest);
        expect(() => accept('phase-3-preproduction/approvals/missing.md')).toThrow(/record .*does not exist/);
        expect(readFileSync(manifest)).toEqual(before);
    });
    it('refuses a record outside phase-3-preproduction/approvals/', () => {
        const before = readFileSync(manifest);
        expect(() => accept('phase-3-preproduction/other/note.md')).toThrow(/phase-3-preproduction\/approvals/);
        expect(() => accept('phase-3-preproduction/approvals/../other/note.md')).toThrow(/phase-3-preproduction\/approvals/);
        expect(readFileSync(manifest)).toEqual(before);
    });
    it('requires --by, --reason and --record', () => {
        expect(() => ledger(['accept', '--manifest', manifest, '--id', 'charms/lamp', '--reason', 'x', '--record', record])).toThrow(/--by is required/);
        expect(() => ledger(['accept', '--manifest', manifest, '--id', 'charms/lamp', '--by', 'x', '--record', record])).toThrow(/--reason is required/);
        expect(() => ledger(['accept', '--manifest', manifest, '--id', 'charms/lamp', '--by', 'x', '--reason', 'x'])).toThrow(/--record is required/);
    });
    it('refuses to accept a row that is already accepted', () => {
        accept(record);
        expect(() => accept(record)).toThrow(/already accepted/);
    });
});
describe('asset-ledger accepted rows and the other verbs (DEC-040)', () => {
    beforeEach(setupProject);
    afterEach(() => rmSync(project, { recursive: true, force: true }));
    it('keeps append and replace unable to record accepted status', () => {
        const source = join(project, 'portrait.png');
        copyFileSync('tests/content/asset-fixtures/portrait.png', source);
        expect(() => ledger(['append', '--manifest', manifest, '--id', 'charms/lamp-two', '--from', source, '--origin', 'authored', '--source', 'x', '--recorded-by', 't', '--date', '2026-10-21', '--status', 'accepted'])).toThrow(/cannot record accepted status/);
        expect(() => ledger(['replace', '--manifest', manifest, '--id', 'charms/lamp', '--from', source, '--origin', 'authored', '--source', 'x', '--recorded-by', 't', '--date', '2026-10-21', '--status', 'accepted'])).toThrow(/cannot record accepted status/);
    });
    it('replace on an accepted row demotes it to ai-placeholder and keeps the accepted snapshot in history', () => {
        accept(record);
        const accepted = read(), source = join(project, 'lamp.png');
        mkdirSync(join(dirname(manifest), 'charms'));
        copyFileSync(`public/assets/${accepted.url}`, join(dirname(manifest), accepted.url!));
        copyFileSync(`public/assets/${accepted.url}`, source);
        expect(ledger(['replace', '--manifest', manifest, '--id', 'charms/lamp', '--from', source, '--origin', 'authored', '--source', 'refit', '--recorded-by', 'test', '--date', '2026-10-22', '--out', join(project, 'out.json')])).toBe(0);
        const after = read();
        expect(after.status).toBe('ai-placeholder');
        expect(after).not.toHaveProperty('acceptedBy');
        expect(after).not.toHaveProperty('acceptedAt');
        expect(after).not.toHaveProperty('acceptedReason');
        expect(after.history.at(-1)).toMatchObject({ hash: accepted.hash, status: 'accepted', recordedBy: accepted.recordedBy });
    });
    it('refuses to retire an accepted row', () => {
        accept(record);
        expect(() => ledger(['retire', '--manifest', manifest, '--id', 'charms/lamp', '--recorded-by', 't', '--date', '2026-10-22', '--note', 'n'])).toThrow(/accepted/);
    });
});
describe('asset-ledger replace --layout-change (CN-12: the pet sheet grows to 6×7 with new clips)', () => {
    let root: string, sheetManifest: string, source: string;
    const sheetId = 'pets/dog-sheet', old = real.entries.find(e => e.id === sheetId)!;
    const clips = { idle: old.clips!.idle, 'use-sit': { start: 12, end: 15, frameRate: 4, repeat: -1 } };
    beforeEach(() => {
        root = mkdtempSync(join(tmpdir(), 'tpp-layout-'));
        sheetManifest = join(root, 'manifest.json');
        source = join(root, 'sheet.png');
        writeFileSync(sheetManifest, JSON.stringify({ ...real, entries: [old] }, null, 2) + '\n');
        writeFileSync(source, encodePng({ w: 1536, h: 1792, data: new Uint8Array(1536 * 1792 * 4) }));
        writeFileSync(join(root, 'row.json'), JSON.stringify({ clips }));
    });
    afterEach(() => rmSync(root, { recursive: true, force: true }));
    const replace = (extra: string[]) => ledger(['replace', '--manifest', sheetManifest, '--id', sheetId, '--from', source, '--origin', 'asset-bot', '--generator', 'asset-bot/generate_image:nano-banana', '--source', 'runs', '--recorded-by', 'test', '--date', '2026-10-21', '--row', join(root, 'row.json'), '--out', join(root, 'out.json'), ...extra]);
    it('still refuses new dimensions or clips without the switch', () => {
        expect(() => replace([])).toThrow(/retain type, dimensions, frame, clips.*--layout-change/);
    });
    it('records the new px and clips, keeps type, frame and URL, and appends the old row to history', () => {
        expect(replace(['--layout-change'])).toBe(0);
        const after = AssetManifest.parse(JSON.parse(readFileSync(sheetManifest, 'utf8'))).entries[0];
        expect(after).toMatchObject({ type: 'spritesheet', url: old.url, frame: old.frame, px: { w: 1536, h: 1792 }, clips, status: 'ai-placeholder' });
        expect(after.history.at(-1)).toMatchObject({ hash: old.hash, status: old.status });
        const findings: string[] = [];
        checkLedger(AssetManifest.parse(JSON.parse(readFileSync(sheetManifest, 'utf8'))), AssetManifest.parse({ ...real, entries: [old] }), (_i, _l, _p, message) => findings.push(message));
        // Only-grows holds; an accepted previous row additionally trips the separate accepted-row rule (TASK-080 open item 1).
        expect(findings.filter(m => !m.startsWith('Human-accepted row changed'))).toEqual([]);
    });
    it('still refuses a changed frame size', () => {
        writeFileSync(join(root, 'row.json'), JSON.stringify({ clips, frame: { w: 128, h: 128 } }));
        expect(() => replace(['--layout-change'])).toThrow(/retain type, frame/);
    });
});

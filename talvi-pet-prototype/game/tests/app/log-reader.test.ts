import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { mmss, parseLog, PRESETS, runReader } from '../../tools/log-reader';
import { CONTROLLER_RECORD_TYPES } from '../../src/app/log';

const SAMPLE = 'tests/fixtures/logs/sample.jsonl';
const temps: string[] = [];
afterEach(() => { for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true }); });
const tempDir = () => { const dir = mkdtempSync(join(tmpdir(), 'tpp-log-reader-')); temps.push(dir); return dir; };

/** In-process run: stdout lines, stderr lines, exit code. */
function read(...args: string[]) {
  const out: string[] = [], err: string[] = [];
  const code = runReader([SAMPLE, ...args], { out: text => out.push(...text.split('\n')), err: text => err.push(...text.split('\n')) });
  return { out, err, code };
}
const typeOf = (line: string) => line.split(/\s{2,}/)[1];

// VERIFY-TOOL-007 on tests/fixtures/logs/sample.jsonl (top-level rows: the max-lines-per-function rule)
it('VERIFY-TOOL-007 sample: 30 lines, line 1 a complete session.started header, exactly one non-JSON line (17)', () => {
  const raw = readFileSync(SAMPLE, 'utf8').trimEnd().split('\n');
  expect(raw).toHaveLength(30);
  expect(Object.keys(JSON.parse(raw[0])).sort()).toEqual(
    ['build', 'cadence', 'feedPresentation', 'schemaVersion', 'seed', 't', 'testerLabel', 'type', 'userAgent', 'viewport', 'wall']);
  const broken = raw.flatMap((line, i) => { try { JSON.parse(line); return []; } catch { return [i + 1]; } });
  expect(broken).toEqual([17]);
  const ts = parseLog(raw.join('\n')).lines.map(line => line.t);
  expect(ts).toEqual([...ts].sort((a, b) => a - b));
});

it('VERIFY-TOOL-007 acceptance: --test TEST-006 --format text prints exactly the Hearts/unlock/want lines with 01:01.2 and 05:00.0', () => {
  const { out, code } = read('--test', 'TEST-006', '--format', 'text');
  expect(code).toBe(0);
  expect(out.map(typeOf)).toEqual(['want.activated', 'want.progressed', 'want.fulfilled', 'heart.earned', 'items.granted',
    'want.activated', 'heart.earned', 'want.fulfilled']);
  expect(out.filter(line => typeOf(line) === 'heart.earned')).toEqual([
    '01:01.2  heart.earned  petId=dog hearts=1', '05:00.0  heart.earned  petId=dog hearts=2']);
  expect(out).toContain('01:01.2  items.granted  typeId=cushion count=1 source=heart');
});

it('VERIFY-TOOL-007 acceptance: --summary shows "hearts: 01:01.2, 05:00.0" with header fields, span, counts and timelines', () => {
  const { out } = read('--summary');
  expect(out).toContain('hearts: 01:01.2, 05:00.0');
  for (const line of ['testerLabel: sample', 'cadence: 20000', 'seed: 1234', 'lines: 29', 'span: 00:00.0 – 05:01.2', '  charm.placed: 3',
    'phases: 1@03:01.0', 'placements: 3 (distinct types 3; first 00:15.9)', 'rejections: typeNotOwned×1', 'exports: download@05:01.2'])
    expect(out).toContain(line);
});

it('VERIFY-TOOL-007 acceptance: the broken line yields one warning with its line number and the rest is printed', () => {
  const { out, err, code } = read();
  expect(code).toBe(0);
  expect(err).toHaveLength(1);
  expect(err[0]).toMatch(/^warning: line 17: malformed JSON/);
  expect(out.filter(line => /^\d\d:\d\d\.\d {2}\S/.test(line))).toHaveLength(29);
});

it('VERIFY-TOOL-007 text: session.started prints as a header block; a nested action prints as type(k=v,…)', () => {
  const { out } = read('--to', '00:00');
  expect(out).toEqual(['00:00.0  session.started', '    build: tpp-0.0.0+development', '    seed: 1234', '    cadence: 20000',
    '    feedPresentation: events', '    testerLabel: sample',
    '    userAgent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0.0.0 Safari/537.36', '    viewport: {"w":1920,"h":1080,"dpr":2}']);
  expect(read('--test', 'TEST-008').out.at(-1)).toBe('02:00.0  debug.applied  action=debugSetEventInterval(ms=null)');
});

it('VERIFY-TOOL-007 --type: comma list and prefix wildcard', () => {
  expect(read('--type', 'roundup.fired,phase.reached').out.map(typeOf)).toEqual(['roundup.fired', 'roundup.fired', 'phase.reached']);
  expect(new Set(read('--type', 'stars.*').out.map(typeOf))).toEqual(new Set(['stars.changed', 'stars.visibilityChanged']));
});

it('VERIFY-TOOL-007 --where: string equality, repeatable, one level into a nested object', () => {
  expect(read('--where', 'typeId=lamp').out).toEqual(['00:52.3  charm.placed  roomId=dog-room slotId=wall-1 typeId=lamp replacedTypeId=null']);
  expect(read('--where', 'petId=dog', '--where', 'hearts=2').out.map(typeOf)).toEqual(['heart.earned', 'want.fulfilled']);
  expect(read('--where', 'action.type=debugSetStarsVisible').out).toEqual(['01:15.0  debug.applied  action=debugSetStarsVisible(on=false)']);
});

it('VERIFY-TOOL-007 --from/--to: inclusive mm:ss bounds', () => {
  const { out } = read('--from', '01:01.2', '--to', '01:15');
  expect(out[0].startsWith('01:01.2')).toBe(true);
  expect(out.at(-1)!.startsWith('01:15.0')).toBe(true);
  expect(out).toHaveLength(6);
});

it('VERIFY-TOOL-007 --format csv: t, mmss, type, then flattened keys; quoted cells', () => {
  const { out } = read('--test', 'TEST-006', '--format', 'csv');
  expect(out[0].startsWith('t,mmss,type,petId,wantId,index,')).toBe(true);
  expect(out).toHaveLength(9);
  expect(out.find(line => line.startsWith('300000,05:00.0,heart.earned,dog,'))).toBeDefined();
  expect(out.find(line => line.includes('items.granted'))).toContain('cushion');
});

it('VERIFY-TOOL-007 --format json and --out: the kept records as a JSON array written to the file', () => {
  const file = join(tempDir(), 'hearts.json');
  const { out, code } = read('--type', 'heart.earned', '--format', 'json', '--out', file);
  expect([code, out]).toEqual([0, []]);
  expect(JSON.parse(readFileSync(file, 'utf8')).map((line: { t: number }) => line.t)).toEqual([61214, 300000]);
});

it('VERIFY-TOOL-007 notice: a file whose first line is not session.started → "ring-truncated or partial export", exit 0', () => {
  const file = join(tempDir(), 'tail.jsonl');
  writeFileSync(file, readFileSync(SAMPLE, 'utf8').split('\n').slice(10).join('\n'));
  const err: string[] = [];
  expect(runReader([file], { out: () => {}, err: text => err.push(text) })).toBe(0);
  expect(err.some(line => line.includes('ring-truncated or partial export'))).toBe(true);
});

it('VERIFY-TOOL-007 missing t / type → one warning each, line skipped', () => {
  const parsed = parseLog('{"t":0,"type":"session.started"}\n{"type":"x"}\n{"t":5}\n{"t":9,"type":"y"}');
  expect(parsed.warnings).toEqual(['warning: line 2: missing t', 'warning: line 3: missing type']);
  expect(parsed.lines.map(line => line.type)).toEqual(['session.started', 'y']);
});

it('VERIFY-TOOL-007 presets: TEST-007 keeps only the first charm.placed; every preset type token exists in the record contract', () => {
  expect(read('--test', 'TEST-007').out.filter(line => /^\d/.test(line)).map(typeOf)).toEqual(['session.started', 'input.joystick', 'input.joystick', 'input.tap', 'charm.placed']);
  expect(Object.keys(PRESETS)).toEqual(['TEST-001', 'TEST-003', 'TEST-004', 'TEST-005', 'TEST-006', 'TEST-007', 'TEST-008']);
  expect(CONTROLLER_RECORD_TYPES).toEqual(expect.arrayContaining(['ui.revealPanel', 'ui.bubbleTapped', 'input.tap', 'input.drag', 'input.joystick']));
});

it('VERIFY-TOOL-007 mm:ss.s formatting floors tenths', () => {
  expect([0, 61214, 300000, 59999, 3_600_000].map(mmss)).toEqual(['00:00.0', '01:01.2', '05:00.0', '00:59.9', '60:00.0']);
});

it('VERIFY-TOOL-007 CLI: npm run log entry exits 3 on an unreadable file, prints --help with the jq recipes', () => {
  const cli = (...args: string[]) => spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tools/log-reader.ts', ...args], { encoding: 'utf8' });
  const missing = cli('tests/fixtures/logs/missing.jsonl');
  expect(missing.status).toBe(3);
  expect(missing.stderr).toContain('cannot read');
  const help = cli('--help');
  expect(help.status).toBe(0);
  expect(help.stdout).toContain(`jq -c 'select(.type=="heart.earned") | [(.t/1000|floor), .petId, .hearts]' log.jsonl`);
  expect(help.stdout).toContain(`jq -c 'select(.type|startswith("pet."))' log.jsonl`);
  expect(cli(SAMPLE, '--test', 'TEST-006').stdout).toContain('05:00.0  heart.earned  petId=dog hearts=2');
});

/**
 * TOOL-007 log reader (tools.md TOOL-007): filters a `.jsonl` log export (mec-010 §5) and prints `t` as mm:ss.s
 * for the observer sheet. Depends only on the JSONL contract; nothing from the game runs here.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { LogLine } from '../src/app/log';

export type TestId = 'TEST-001' | 'TEST-003' | 'TEST-004' | 'TEST-005' | 'TEST-006' | 'TEST-007' | 'TEST-008';
export type Format = 'text' | 'csv' | 'json';
export type ReaderOptions = {
  file: string; types?: string[]; where?: [string, string][]; from?: number; to?: number;
  test?: TestId; summary?: boolean; format: Format; out?: string;
};
export type Parsed = { lines: LogLine[]; warnings: string[]; notice: string | null };

export const HELP = `TOOL-007 log reader
usage: npm run log -- <file.jsonl> [--type a,b] [--where key=value ...] [--from mm:ss] [--to mm:ss]
                      [--test TEST-001|003|004|005|006|007|008] [--summary] [--format text|csv|json] [--out <file>]

  --type      keep these record types (comma list; "x.*" matches a prefix)
  --where     keep lines whose field equals the value as a string (repeatable; "action.type=…" reads one level in)
  --from/--to keep lines with from <= t <= to (mm:ss or mm:ss.s)
  --test      the mec-010 §6 preset for that TEST
  --summary   header fields, line count and t span, counts per type, Hearts / phases / placements / rejections / exports
  --format    text (default): "mm:ss.s  <type>  k=v …"; csv; json
  --out       write to a file instead of stdout
Warnings (malformed lines, missing t/type) and the ring-truncated notice go to stderr. Exit 0; 3 if the file is unreadable; 2 on bad arguments.

jq fallback recipes:
  jq -c 'select(.type=="heart.earned") | [(.t/1000|floor), .petId, .hearts]' log.jsonl
  jq -c 'select(.type|startswith("pet."))' log.jsonl`;

/** `t` in ms → `mm:ss.s` (tenths floored, so 59 999 ms never prints as 60.0). */
export function mmss(t: number): string {
  const tenths = Math.floor(t / 100);
  const minutes = Math.floor(tenths / 600), seconds = (tenths % 600) / 10;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(1).padStart(4, '0')}`;
}

/** `mm:ss` or `mm:ss.s` → ms. */
export function parseMmss(text: string): number {
  const match = /^(\d+):(\d{1,2}(?:\.\d+)?)$/.exec(text);
  if (!match) throw new UsageError(`expected mm:ss, got "${text}"`);
  return Math.round((Number(match[1]) * 60 + Number(match[2])) * 1000);
}

export class UsageError extends Error {}

export function parseLog(text: string): Parsed {
  const lines: LogLine[] = [], warnings: string[] = [];
  text.split('\n').forEach((raw, index) => {
    if (raw.trim() === '') return;
    const n = index + 1;
    let value: unknown;
    try { value = JSON.parse(raw); } catch (error) { warnings.push(`warning: line ${n}: malformed JSON (${(error as Error).message})`); return; }
    const line = value as Partial<LogLine>;
    if (typeof line !== 'object' || line === null || typeof line.t !== 'number') { warnings.push(`warning: line ${n}: missing t`); return; }
    if (typeof line.type !== 'string') { warnings.push(`warning: line ${n}: missing type`); return; }
    lines.push(line as LogLine);
  });
  const notice = lines[0]?.type === 'session.started' ? null : 'notice: the first line is not session.started — ring-truncated or partial export';
  return { lines, warnings, notice };
}

type Matcher = (line: LogLine) => boolean;
const typeMatcher = (token: string): Matcher =>
  token.endsWith('.*') ? line => line.type.startsWith(token.slice(0, -1)) : line => line.type === token;
const debugOf = (...actions: string[]): Matcher =>
  line => line.type === 'debug.applied' && actions.includes(String((line.action as { type?: unknown } | undefined)?.type));

/** mec-010 §6 presets, token for token as tools.md TOOL-007 lists them. `firstOnly` types keep only their first line. */
export const PRESETS: Record<TestId, { match: Matcher[]; firstOnly?: string[] }> = {
  'TEST-001': { match: ['stars.visibilityChanged', 'charm.placed', 'charm.removed', 'stars.changed'].map(typeMatcher) },
  'TEST-003': { match: [...['roundup.fired', 'completeNow.shown', 'completeNow.taken', 'celebration.*'].map(typeMatcher),
    debugOf('debugSetEventInterval', 'debugSetFeedPresentation')] },
  'TEST-004': { match: ['ui.revealPanel', 'celebration.stepped', 'celebration.started'].map(typeMatcher) },
  'TEST-005': { match: ['pet.reacted', 'pet.tapped', 'ui.bubbleTapped', 'pet.verbStarted', 'charm.placed'].map(typeMatcher) },
  'TEST-006': { match: ['heart.earned', 'items.granted', 'verb.unlocked', 'want.*'].map(typeMatcher) },
  'TEST-007': { match: ['session.started', 'input.joystick', 'input.drag', 'input.tap', 'charm.placed'].map(typeMatcher), firstOnly: ['charm.placed'] },
  'TEST-008': { match: [typeMatcher('session.started'), debugOf('debugSetEventInterval')] },
};

const fieldOf = (line: LogLine, key: string): unknown => {
  const [head, inner] = key.split('.', 2);
  if (inner === undefined || key in line) return line[key];
  const nested = line[head];
  return typeof nested === 'object' && nested !== null ? (nested as Record<string, unknown>)[inner] : undefined;
};

export function filterLines(lines: LogLine[], options: Omit<ReaderOptions, 'file' | 'format'>): LogLine[] {
  const types = options.types?.map(typeMatcher);
  const preset = options.test ? PRESETS[options.test] : undefined;
  const seen = new Set<string>();
  return lines.filter(line => {
    if (types && !types.some(m => m(line))) return false;
    if (options.where?.some(([key, value]) => String(fieldOf(line, key)) !== value)) return false;
    if (options.from !== undefined && line.t < options.from) return false;
    if (options.to !== undefined && line.t > options.to) return false;
    if (preset) {
      if (!preset.match.some(m => m(line))) return false;
      if (preset.firstOnly?.includes(line.type)) { if (seen.has(line.type)) return false; seen.add(line.type); }
    }
    return true;
  });
}

const PAYLOAD_SKIP = new Set(['t', 'wall', 'type']);
const scalar = (value: unknown) => (typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value));

/** The payload flattened one level; a nested `action` prints as `type(k=v,…)`. */
export function flatten(line: LogLine): [string, string][] {
  return Object.entries(line).filter(([key]) => !PAYLOAD_SKIP.has(key)).map(([key, value]) => {
    if (key === 'action' && typeof value === 'object' && value !== null) {
      const { type, ...rest } = value as Record<string, unknown>;
      return [key, `${String(type)}(${Object.entries(rest).map(([k, v]) => `${k}=${scalar(v)}`).join(',')})`];
    }
    return [key, scalar(value)];
  });
}

const HEADER_FIELDS = ['build', 'seed', 'cadence', 'feedPresentation', 'testerLabel', 'userAgent', 'viewport'];

export function formatText(lines: LogLine[]): string[] {
  return lines.flatMap(line => line.type === 'session.started'
    ? [`${mmss(line.t)}  session.started`, ...HEADER_FIELDS.map(key => `    ${key}: ${scalar(line[key])}`)]
    : [`${mmss(line.t)}  ${line.type}  ${flatten(line).map(([k, v]) => `${k}=${v}`).join(' ')}`.trimEnd()]);
}

const csvCell = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);

/** Columns `t, mmss, type`, then every flattened key in first-seen order (stable for a given file). */
export function formatCsv(lines: LogLine[]): string[] {
  const rows = lines.map(line => new Map(flatten(line)));
  const keys = [...new Set(rows.flatMap(row => [...row.keys()]))];
  return [['t', 'mmss', 'type', ...keys].join(','),
    ...lines.map((line, i) => [String(line.t), mmss(line.t), line.type, ...keys.map(k => rows[i].get(k) ?? '')].map(csvCell).join(','))];
}

export function summarise(lines: LogLine[]): string[] {
  const header = lines.find(line => line.type === 'session.started');
  const of = (type: string) => lines.filter(line => line.type === type);
  const counts = new Map<string, number>();
  for (const line of lines) counts.set(line.type, (counts.get(line.type) ?? 0) + 1);
  const placements = of('charm.placed');
  const rejections = new Map<string, number>();
  for (const line of of('action.rejected')) rejections.set(String(line.reason), (rejections.get(String(line.reason)) ?? 0) + 1);
  const list = (items: string[]) => (items.length ? items.join(', ') : '—');
  return [
    ...(header ? HEADER_FIELDS.map(key => `${key}: ${scalar(header[key])}`) : ['header: none (ring-truncated or partial export)']),
    `lines: ${lines.length}`,
    `span: ${lines.length ? `${mmss(lines[0].t)} – ${mmss(lines.at(-1)!.t)}` : '—'}`,
    'counts:', ...[...counts].sort(([a], [b]) => a.localeCompare(b)).map(([type, n]) => `  ${type}: ${n}`),
    `hearts: ${list(of('heart.earned').map(line => mmss(line.t)))}`,
    `phases: ${list(of('phase.reached').map(line => `${String(line.phase)}@${mmss(line.t)}`))}`,
    `placements: ${placements.length} (distinct types ${new Set(placements.map(line => line.typeId)).size}; first ${placements[0] ? mmss(placements[0].t) : '—'})`,
    `rejections: ${list([...rejections].map(([reason, n]) => `${reason}×${n}`))}`,
    `exports: ${list(of('log.exported').map(line => `${String(line.method)}@${mmss(line.t)}`))}`,
  ];
}

export function parseArgs(argv: string[]): ReaderOptions | 'help' {
  if (argv.includes('--help') || argv.includes('-h')) return 'help';
  const options: ReaderOptions = { file: '', format: 'text' };
  const where: [string, string][] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => { const v = argv[++i]; if (v === undefined) throw new UsageError(`${arg} needs a value`); return v; };
    if (arg === '--type') options.types = value().split(',').map(s => s.trim()).filter(Boolean);
    else if (arg === '--where') {
      const pair = value(), at = pair.indexOf('=');
      if (at < 1) throw new UsageError(`--where expects key=value, got "${pair}"`);
      where.push([pair.slice(0, at), pair.slice(at + 1)]);
    } else if (arg === '--from') options.from = parseMmss(value());
    else if (arg === '--to') options.to = parseMmss(value());
    else if (arg === '--test') {
      const id = value().toUpperCase().replace(/^(\d+)$/, 'TEST-$1').replace(/^TEST-(\d)$/, 'TEST-00$1') as TestId;
      if (!(id in PRESETS)) throw new UsageError(`unknown --test ${id}; one of ${Object.keys(PRESETS).join(', ')}`);
      options.test = id;
    } else if (arg === '--summary') options.summary = true;
    else if (arg === '--format') {
      const format = value();
      if (format !== 'text' && format !== 'csv' && format !== 'json') throw new UsageError(`unknown --format ${format}`);
      options.format = format;
    } else if (arg === '--out') options.out = value();
    else if (arg.startsWith('--')) throw new UsageError(`unknown option ${arg}`);
    else if (!options.file) options.file = arg;
    else throw new UsageError(`unexpected argument ${arg}`);
  }
  if (!options.file) throw new UsageError('missing <file.jsonl>');
  if (where.length) options.where = where;
  return options;
}

/** Runs the reader; returns the exit code. `io` is injectable for tests. */
export function runReader(argv: string[], io: { out: (text: string) => void; err: (text: string) => void }): number {
  let options: ReaderOptions | 'help';
  try { options = parseArgs(argv); } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    io.err(`log-reader: ${error.message}\n${HELP}`); return 2;
  }
  if (options === 'help') { io.out(HELP); return 0; }
  let text: string;
  try { text = readFileSync(options.file, 'utf8'); } catch (error) {
    io.err(`log-reader: cannot read ${options.file}: ${(error as Error).message}`); return 3;
  }
  const parsed = parseLog(text);
  for (const warning of parsed.warnings) io.err(warning);
  if (parsed.notice) io.err(parsed.notice);
  const kept = filterLines(parsed.lines, options);
  const output = options.summary ? summarise(kept).join('\n')
    : options.format === 'json' ? JSON.stringify(kept, null, 2)
      : (options.format === 'csv' ? formatCsv(kept) : formatText(kept)).join('\n');
  if (options.out) writeFileSync(options.out, `${output}\n`);
  else io.out(output);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = runReader(process.argv.slice(2), { out: text => console.log(text), err: text => console.error(text) });
}

import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadContent } from '../src/content/load';
import type { Content } from '../src/content/types';
import type { SimEvent } from '../src/sim/events';
import { reduce } from '../src/sim/reduce';
import { phaseOf } from '../src/sim/select';
import { initialState } from '../src/sim/state';
import { readContentFiles } from './content/io';

/** TOOL-004 (tools.md §3): the first N round-ups of a seed, through `reduce` + `debugSimulatePurchase` only. */
export type FeedOptions = { seed: number; count: number; interval: number; seeds?: number[]; format: 'text' | 'csv' | 'json' };
export type FeedRow = {
  index: number; tMs: number; projectId: string; merchantId: string; merchantName: string;
  amountCents: number; changeCents: number; currentCents: number; goalCents: number; phase: number; reached: number | null;
};
export type FeedSummary = {
  seed: number; rows: number; stopped: boolean; boundaries: { phase: number; index: number; tMs: number }[];
  meanChangeCents: number; draws: Record<string, number>; neverDrawn: string[];
};

type Roundup = Extract<SimEvent, { type: 'roundup.fired' }>;
type Reached = Extract<SimEvent, { type: 'phase.reached' }>;

/** One `debugSimulatePurchase` per row; stops after the row that emits `feed.stopped` (or at a `noActiveProject` rejection). */
export function feedRows(content: Content, seed: number, count: number, interval: number): { rows: FeedRow[]; stopped: boolean } {
  const rows: FeedRow[] = [];
  let state = initialState(content, seed);
  while (rows.length < count) {
    const result = reduce(content, state, { type: 'debugSimulatePurchase' });
    const fired = result.events.find((event): event is Roundup => event.type === 'roundup.fired');
    if (!fired) return { rows, stopped: true };
    const reached = result.events.find((event): event is Reached => event.type === 'phase.reached');
    const goalCents = content.projects.find(project => project.id === fired.projectId)!.goalCents;
    const index = rows.length + 1;
    rows.push({ index, tMs: index * interval, projectId: fired.projectId, merchantId: fired.merchantId,
      merchantName: fired.merchantName, amountCents: fired.amountCents, changeCents: fired.changeCents,
      currentCents: fired.currentCents, goalCents, phase: phaseOf(fired.currentCents, goalCents), reached: reached?.phase ?? null });
    if (result.events.some(event => event.type === 'feed.stopped')) return { rows, stopped: true };
    state = result.state;
  }
  return { rows, stopped: false };
}

export function summarise(content: Content, seed: number, rows: FeedRow[], stopped: boolean): FeedSummary {
  const draws: Record<string, number> = {};
  for (const row of rows) draws[row.merchantId] = (draws[row.merchantId] ?? 0) + 1;
  const total = rows.reduce((sum, row) => sum + row.changeCents, 0);
  return { seed, rows: rows.length, stopped,
    boundaries: rows.filter(row => row.reached !== null).map(row => ({ phase: row.reached!, index: row.index, tMs: row.tMs })),
    meanChangeCents: rows.length ? Math.round(total / rows.length * 100) / 100 : 0,
    draws, neverDrawn: content.merchants.map(merchant => merchant.id).filter(id => draws[id] === undefined) };
}

export const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const dollars = (cents: number) => `$${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;

function summaryLine(summary: FeedSummary): string {
  const boundaries = summary.boundaries.map(b => `phase ${b.phase} #${b.index} ${clock(b.tMs)}`).join(', ') || 'no boundary';
  const goal = summary.boundaries.find(b => b.phase === 5);
  return `summary  seed ${summary.seed}  rows ${summary.rows}${summary.stopped ? ' (feed stopped)' : ''}  ${boundaries}  ` +
    `goal ${goal ? `#${goal.index} ${clock(goal.tMs)}` : 'not reached'}  mean change ${summary.meanChangeCents}¢  ` +
    `merchants drawn ${Object.keys(summary.draws).length}`;
}

function rowText(row: FeedRow): string {
  return [String(row.index).padStart(3), clock(row.tMs).padEnd(6), row.merchantName.padEnd(24), dollars(row.amountCents).padStart(8),
    `${row.changeCents}¢`.padStart(5), `${row.currentCents} / ${row.goalCents}`.padStart(12), String(row.phase).padStart(5)]
    .join('  ') + (row.reached !== null ? `  → phase ${row.reached}` : '');
}

function textLines(content: Content, options: FeedOptions, rows: FeedRow[], summary: FeedSummary): string[] {
  const draws = Object.entries(summary.draws).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([id, n]) => `${id}×${n}`);
  return [`feed preview  seed ${options.seed}  count ${options.count}  t = row × ${options.interval} ms (uninterrupted playtest cadence)`,
    ['  #', 't     ', 'merchant'.padEnd(24), '  amount', 'change', '       total', 'phase'].join('  '),
    ...rows.map(rowText),
    `draws    ${draws.join(', ')}`,
    ...(summary.neverDrawn.length ? [`INFO     ${summary.neverDrawn.length} merchants never drawn in ${options.count}: ${summary.neverDrawn.join(', ')}`] : []),
    summaryLine(summary)];
}

const CSV_HEADER = 'index,t,merchantId,merchantName,amountCents,changeCents,currentCents,goalCents,phase,reached';
const csvCell = (value: string | number | null) => (typeof value === 'string' && /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : String(value ?? ''));

/** Pure: the tool's whole output as lines (`main` joins them). */
export function runFeedPreview(content: Content, options: FeedOptions): { lines: string[] } {
  if (options.seeds) {
    const summaries = options.seeds.map(seed => { const run = feedRows(content, seed, options.count, options.interval); return summarise(content, seed, run.rows, run.stopped); });
    return { lines: options.format === 'json' ? [JSON.stringify(summaries, null, 2)] : summaries.map(summaryLine) };
  }
  const { rows, stopped } = feedRows(content, options.seed, options.count, options.interval);
  const summary = summarise(content, options.seed, rows, stopped);
  if (options.format === 'json') return { lines: [JSON.stringify({ seed: options.seed, interval: options.interval, rows, summary }, null, 2)] };
  if (options.format === 'csv') return { lines: [CSV_HEADER, ...rows.map(row => [row.index, clock(row.tMs), row.merchantId, row.merchantName,
    row.amountCents, row.changeCents, row.currentCents, row.goalCents, row.phase, row.reached].map(csvCell).join(','))] };
  return { lines: textLines(content, options, rows, summary) };
}

const USAGE = 'preview:feed --seed <n> [--count 40] [--interval 20000] [--seeds 1,2,3] [--format text|csv|json] [--content dir] [--out file]\n' +
  'json: { seed, interval, rows: FeedRow[], summary } (with --seeds: FeedSummary[])';

const integer = (flag: string, value: string) => {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`${flag} must be an integer`);
  return n;
};

type Cli = FeedOptions & { content: string; out?: string; help: boolean };

export function feedArgs(argv: string[]): Cli {
  const cli: Cli = { seed: 0, count: 40, interval: 20000, format: 'text', content: 'src/content', help: false };
  let seeded = false;
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = argv[i + 1];
    if (flag === '--help') { cli.help = true; continue; }
    if (!['--seed', '--count', '--interval', '--seeds', '--format', '--content', '--out'].includes(flag) || value === undefined || value.startsWith('--'))
      throw new Error(`Unknown flag or missing value: ${flag}`);
    i++;
    if (flag === '--seed') { cli.seed = integer(flag, value); seeded = true; }
    else if (flag === '--count' || flag === '--interval') cli[flag.slice(2) as 'count' | 'interval'] = integer(flag, value);
    else if (flag === '--seeds') cli.seeds = value.split(',').map(part => integer(flag, part));
    else if (flag === '--format') {
      if (value !== 'text' && value !== 'csv' && value !== 'json') throw new Error('--format must be text|csv|json');
      cli.format = value;
    } else cli[flag.slice(2) as 'content' | 'out'] = value;
  }
  if (!cli.help && !seeded && !cli.seeds) throw new Error('--seed <n> or --seeds <list> is required');
  if (cli.count < 1 || cli.interval < 0) throw new Error('--count must be ≥ 1 and --interval ≥ 0');
  return cli;
}

async function main(argv: string[]): Promise<void> {
  const cli = feedArgs(argv);
  const text = cli.help ? USAGE : runFeedPreview(loadContent(undefined, await readContentFiles(cli.content)), cli).lines.join('\n');
  if (cli.out) writeFileSync(cli.out, text + '\n');
  else process.stdout.write(text + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`preview:feed: ${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    process.exitCode = 3;
  });
}

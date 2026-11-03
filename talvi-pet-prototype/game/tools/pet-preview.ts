import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadContent } from '../src/content/load';
import type { Content } from '../src/content/types';
import type { Action } from '../src/sim/actions';
import type { SimEvent } from '../src/sim/events';
import { checkInvariants } from '../src/sim/invariants';
import { reduce } from '../src/sim/reduce';
import { initialState, type GameState, type PetBehaviour } from '../src/sim/state';
import { parseSaveValue } from '../src/sim/state.schema';
import { readContentFiles } from './content/io';

/** TOOL-005 (tools.md §3): the resident pet headless, every rule through `reduce`; tools §2.4 edits only. */
export type TimedEdit = { atMs: number; slotId: string; typeId: string | null };
export type PetOptions = {
  room: string; seconds: number; seed: number; fill: 'all' | 'starter' | 'none'; place: [string, string][];
  at: TimedEdit[]; dt: number; format: 'text' | 'json'; initial?: GameState;
};
export type PetSummary = {
  ticks: number; phaseMs: Record<string, number>; decisions: number; targets: Record<string, number>;
  wander: Record<string, number>; verbs: Record<string, number>; reactions: Record<string, number>;
  linesUsed: string[]; penaltyHits: number; invariant10: 'held';
};
/** A run the tool reports with exit 1: a rejected setup/edit action or an invariant 10 failure. */
export class PetPreviewError extends Error {}

type Run = { state: GameState; elapsedMs: number; lines: string[]; events: { t: number; event: SimEvent }[] };

const stamp = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms % 60000 / 1000).toFixed(1).padStart(4, '0')}`;
const target = (t: PetBehaviour['target']) => (t === null ? 'none' : 'slotId' in t ? `slot:${t.slotId}` : `wander:${t.wanderPointId}`);

function eventText(event: SimEvent, state: GameState): string | null {
  switch (event.type) {
    case 'pet.phaseChanged': {
      const b = state.pets[event.petId].behaviour;
      return `pet.phaseChanged ${event.from}→${event.to} target=${target(event.target)} verb=${event.verb ?? '-'}` +
        `${event.reaction ? ` reaction=${event.reaction}` : ''} (${b.x.toFixed(1)},${b.y.toFixed(1)})`;
    }
    case 'pet.verbStarted': case 'pet.verbEnded': return `${event.type} verb=${event.verb} slot=${event.slotId}`;
    case 'pet.reacted': return `pet.reacted ${event.reaction} slot=${event.slotId ?? '-'} type=${event.typeId ?? '-'} walkOver=${event.walkOver}` +
      `${event.line ? ` line="${event.line}"` : ''}`;
    case 'charm.placed': return `charm.placed slot=${event.slotId} type=${event.typeId}`;
    case 'charm.removed': return `charm.removed slot=${event.slotId} type=${event.typeId}`;
    case 'pet.wantBubble': return `pet.wantBubble tag=${event.tag ?? '?'}`;
    case 'dialogue.opened': return `dialogue.opened ${event.script.source} lines=${event.script.lines.length} (auto-advanced)`;
    case 'action.rejected': return `action.rejected ${event.action.type} reason=${event.reason}`;
    default: return null;
  }
}

/** Dispatch through `reduce`; a rejection stops the run (exit 1); open dialogues are advanced (tools §8). */
function dispatch(content: Content, run: Run, action: Action): SimEvent[] {
  const result = reduce(content, run.state, action);
  const rejected = result.events.find(event => event.type === 'action.rejected');
  if (rejected) throw new PetPreviewError(`${stamp(run.elapsedMs)}  ${eventText(rejected, run.state)}`);
  run.state = result.state;
  for (const event of result.events) {
    run.events.push({ t: run.elapsedMs, event });
    const text = eventText(event, run.state);
    if (text) run.lines.push(`${stamp(run.elapsedMs)}  ${text}`);
  }
  for (let count = 0; run.state.dialogue.current !== null; count++) {
    if (count === 100) throw new PetPreviewError('dialogue still open after 100 advances');
    dispatch(content, run, { type: 'advanceDialogue' });
  }
  return result.events;
}

function placementsFor(content: Content, options: PetOptions): Map<string, string> {
  const placements = new Map<string, string>();
  const pool = options.fill === 'all' ? content.charms.types
    : content.charms.types.filter(type => content.charms.starterSet.some(item => item.typeId === type.id));
  if (options.fill !== 'none')
    for (const slot of content.rooms[options.room].slots) {
      const type = pool.find(candidate => candidate.sizeClass === slot.sizeClass);
      if (type) placements.set(slot.id, type.id);
    }
  for (const [slotId, typeId] of options.place) placements.set(slotId, typeId);
  return placements;
}

/** DEC-043: a fill may repeat a type across slots; the preview tops `counts` up so every listed placement has a
 * copy in hand (a synthetic setup edit like `enterRoom`, no events). */
function withCopiesFor(state: GameState, typeIds: string[]): GameState {
  const needed: Record<string, number> = {};
  typeIds.forEach(id => { needed[id] = (needed[id] ?? 0) + 1; });
  const next = structuredClone(state);
  for (const [id, count] of Object.entries(needed))
    if (Object.hasOwn(next.inventory.counts, id)) next.inventory.counts[id] = Math.max(next.inventory.counts[id], count);
  return next;
}

function enterRoom(content: Content, state: GameState, roomId: string): GameState {
  const room = content.rooms[roomId];
  if (!room) throw new Error(`Unknown room "${roomId}"`);
  const door = room.doors.find(candidate => candidate.target.scene === 'street')!;
  const next = structuredClone(state);
  next.scene = { kind: 'interior', roomId };
  next.avatar = { x: door.spawn.x, y: door.spawn.y, facing: door.spawn.facing ?? 'down', immunityMs: 0, facingCandidate: null };
  next.pets[room.residentPetId].introduced = true;
  return next;
}

function designEdit(content: Content, run: Run, actions: Action[]): void {
  dispatch(content, run, { type: 'setDesignMode', on: true });
  for (const action of actions) dispatch(content, run, action);
  dispatch(content, run, { type: 'setDesignMode', on: false });
}

/** tools §3 TOOL-005 setup order: state → unlock → §2.4 edits → frozen feed → placements in design mode. */
function setup(content: Content, options: PetOptions): Run {
  const run: Run = { state: options.initial ?? initialState(content, options.seed), elapsedMs: 0, lines: [], events: [] };
  const placements = placementsFor(content, options);
  const wanted = [...placements.values(), ...options.at.flatMap(edit => (edit.typeId ? [edit.typeId] : []))];
  if (options.fill === 'all' || wanted.some(id => !Object.hasOwn(run.state.inventory.counts, id)))
    dispatch(content, run, { type: 'debugUnlockAllTypes' });
  run.state = withCopiesFor(run.state, [...placements.values()]);
  run.state = enterRoom(content, run.state, options.room);
  dispatch(content, run, { type: 'debugSetEventInterval', ms: null });
  designEdit(content, run, [...placements].map(([slotId, typeId]) => ({ type: 'placeCharm', slotId, typeId })));
  return run;
}

function checkTick(content: Content, run: Run, index: number, before: PetBehaviour, petId: string): void {
  const failure = checkInvariants(content, run.state).find(message => message.startsWith('invariant 10'));
  if (!failure) return;
  const after = run.state.pets[petId].behaviour;
  throw new PetPreviewError(`${failure} at tick ${index} (${stamp(run.elapsedMs)}), segment (${before.x}, ${before.y}) → (${after.x}, ${after.y})`);
}

type Tally = PetSummary;
const bump = (record: Record<string, number>, key: string, by = 1) => { record[key] = (record[key] ?? 0) + by; };

function tally(summary: Tally, events: SimEvent[], before: GameState, petId: string): void {
  for (const event of events) {
    if (event.type === 'pet.phaseChanged' && event.from === 'idle' && event.to === 'walking' && event.target) {
      summary.decisions++;
      if ('slotId' in event.target) {
        bump(summary.targets, `${event.target.slotId} (${event.verb ?? '-'})`);
        if (before.pets[petId].recentTargets.includes(event.target.slotId)) summary.penaltyHits++;
      } else bump(summary.wander, event.target.wanderPointId);
    }
    if (event.type === 'pet.verbStarted') bump(summary.verbs, event.verb);
    if (event.type === 'pet.reacted') {
      bump(summary.reactions, event.reaction);
      if (event.line && !summary.linesUsed.includes(event.line)) summary.linesUsed.push(event.line);
    }
  }
}

function timedEdits(content: Content, run: Run, pending: TimedEdit[]): TimedEdit[] {
  const due = pending.filter(edit => edit.atMs <= run.elapsedMs);
  if (due.length) designEdit(content, run, due.map((edit): Action => (edit.typeId === null
    ? { type: 'removeCharm', slotId: edit.slotId } : { type: 'placeCharm', slotId: edit.slotId, typeId: edit.typeId })));
  return pending.filter(edit => edit.atMs > run.elapsedMs);
}

function loop(content: Content, run: Run, options: PetOptions): Tally {
  const petId = content.rooms[options.room].residentPetId, totalMs = options.seconds * 1000;
  const summary: Tally = { ticks: 0, phaseMs: {}, decisions: 0, targets: {}, wander: {}, verbs: {}, reactions: {}, linesUsed: [], penaltyHits: 0, invariant10: 'held' };
  let pending = [...options.at].sort((a, b) => a.atMs - b.atMs);
  while (run.elapsedMs < totalMs) {
    const edited = run.state, logged = run.events.length;
    pending = timedEdits(content, run, pending);
    tally(summary, run.events.slice(logged).map(entry => entry.event), edited, petId);
    const before = run.state, dtMs = Math.min(options.dt, totalMs - run.elapsedMs);
    run.elapsedMs += dtMs;
    const events = dispatch(content, run, { type: 'tick', dtMs, move: { x: 0, y: 0 } });
    summary.ticks++;
    checkTick(content, run, summary.ticks, before.pets[petId].behaviour, petId);
    bump(summary.phaseMs, run.state.pets[petId].behaviour.phase, dtMs);
    tally(summary, events, before, petId);
  }
  return summary;
}

const percent = (n: number, of: number) => `${of ? (n * 100 / of).toFixed(1) : '0.0'} %`;

function summaryLines(options: PetOptions, s: PetSummary): string[] {
  const total = options.seconds * 1000;
  const rows = (title: string, record: Record<string, number>, of: number) =>
    Object.entries(record).sort(([a], [b]) => a.localeCompare(b, 'en')).map(([key, n]) => `${title.padEnd(9)}${key.padEnd(24)}${String(n).padStart(5)}  ${percent(n, of)}`);
  return ['summary', ...rows('phase', s.phaseMs, total).map(line => line.replace(/(\d+)(\s+\d)/, '$1 ms$2')),
    ...rows('target', s.targets, s.decisions), ...rows('wander', s.wander, s.decisions),
    ...rows('verb', s.verbs, Object.values(s.verbs).reduce((a, b) => a + b, 0)),
    ...rows('reaction', s.reactions, Object.values(s.reactions).reduce((a, b) => a + b, 0)),
    `lines    ${s.linesUsed.length} used${s.linesUsed.length ? `: ${s.linesUsed.map(line => `"${line}"`).join(', ')}` : ''}`,
    `summary  room ${options.room}  seed ${options.seed}  ${options.seconds} s  ticks ${s.ticks}  decisions ${s.decisions}  ` +
    `targets ${Object.keys(s.targets).length}  wander ${Object.values(s.wander).reduce((a, b) => a + b, 0)}  ` +
    `recentTargets penalty hits ${s.penaltyHits}  invariant 10 held every tick`];
}

/** Pure: setup + loop; the lines `main` prints. Throws PetPreviewError (exit 1) on a rejection or invariant 10. */
export function runPetPreview(content: Content, options: PetOptions): { lines: string[]; summary: PetSummary } {
  const run = setup(content, options);
  const setupLines = run.lines.splice(0);
  const summary = loop(content, run, options);
  const pet = content.rooms[options.room].residentPetId, avatar = run.state.avatar;
  if (options.format === 'json') return { summary, lines: [JSON.stringify({ room: options.room, seed: options.seed, setup: setupLines, events: run.lines, summary }, null, 2)] };
  return { summary, lines: [`pet preview  room ${options.room}  pet ${pet}  seed ${options.seed}  ${options.seconds} s  dt ${options.dt} ms  avatar fixed at (${avatar.x}, ${avatar.y})`,
    'setup', ...setupLines.map(line => `  ${line}`), 'run', ...run.lines, ...summaryLines(options, summary)] };
}

const USAGE = 'preview:pet --room <roomId> --seconds 180 [--seed 7] [--fill all|starter|none] [--place <slotId>=<typeId> ...]\n' +
  '  [--at <s>:<slotId>=<typeId>|<s>:remove:<slotId> ...] [--save fixture.json] [--dt 100] [--format text|json] [--content dir] [--out file]\n' +
  'json: { room, seed, setup: string[], events: string[], summary: PetSummary }; exit 1 = rejected action or invariant 10 failure';

type Cli = PetOptions & { content: string; out?: string; save?: string; help: boolean };

const number = (flag: string, value: string, integer = true) => {
  const n = Number(value);
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n))) throw new Error(`${flag} must be ${integer ? 'an integer' : 'a number'}`);
  return n;
};

function pair(flag: string, value: string): [string, string] {
  const [slotId, typeId, extra] = value.split('=');
  if (!slotId || !typeId || extra !== undefined) throw new Error(`${flag} expects <slotId>=<typeId>`);
  return [slotId, typeId];
}

function timed(value: string): TimedEdit {
  const [seconds, ...rest] = value.split(':');
  const atMs = number('--at', seconds, false) * 1000;
  if (rest[0] === 'remove' && rest.length === 2) return { atMs, slotId: rest[1], typeId: null };
  const [slotId, typeId] = pair('--at', rest.join(':'));
  return { atMs, slotId, typeId };
}

const VALUE_FLAGS = ['--room', '--seconds', '--seed', '--fill', '--place', '--at', '--save', '--dt', '--format', '--content', '--out'];

export function petArgs(argv: string[]): Cli {
  const cli: Cli = { room: '', seconds: 180, seed: 7, fill: 'none', place: [], at: [], dt: 100, format: 'text', content: 'src/content', help: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i], value = argv[i + 1];
    if (flag === '--help') { cli.help = true; continue; }
    if (!VALUE_FLAGS.includes(flag) || value === undefined || value.startsWith('--')) throw new Error(`Unknown flag or missing value: ${flag}`);
    i++;
    if (flag === '--seconds' || flag === '--seed' || flag === '--dt') cli[flag.slice(2) as 'seconds' | 'seed' | 'dt'] = number(flag, value);
    else if (flag === '--place') cli.place.push(pair(flag, value));
    else if (flag === '--at') cli.at.push(timed(value));
    else if (flag === '--fill') {
      if (value !== 'all' && value !== 'starter' && value !== 'none') throw new Error('--fill must be all|starter|none');
      cli.fill = value;
    } else if (flag === '--format') {
      if (value !== 'text' && value !== 'json') throw new Error('--format must be text|json');
      cli.format = value;
    } else cli[flag.slice(2) as 'room' | 'save' | 'content' | 'out'] = value;
  }
  if (!cli.help && !cli.room) throw new Error('--room <roomId> is required');
  if (cli.seconds <= 0 || cli.dt < 1 || cli.dt > 100) throw new Error('--seconds must be > 0 and --dt within 1..100 (tick.dtMs bound)');
  return cli;
}

function loadSave(content: Content, file: string): GameState {
  const loaded = parseSaveValue(content, JSON.parse(readFileSync(file, 'utf8')));
  if ('discarded' in loaded) throw new Error(`--save ${file} discarded: ${loaded.discarded}`);
  return loaded.state;
}

async function main(argv: string[]): Promise<void> {
  const cli = petArgs(argv);
  if (cli.help) { process.stdout.write(USAGE + '\n'); return; }
  const content = loadContent(undefined, await readContentFiles(cli.content));
  if (!content.rooms[cli.room]) throw new Error(`Unknown room "${cli.room}"`);
  let text: string;
  try {
    text = runPetPreview(content, { ...cli, initial: cli.save ? loadSave(content, cli.save) : undefined }).lines.join('\n');
  } catch (error) {
    if (!(error instanceof PetPreviewError)) throw error;
    process.stderr.write(`preview:pet: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  if (cli.out) writeFileSync(cli.out, text + '\n');
  else process.stdout.write(text + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`preview:pet: ${error instanceof Error ? error.message : String(error)}\n${USAGE}\n`);
    process.exitCode = 3;
  });
}

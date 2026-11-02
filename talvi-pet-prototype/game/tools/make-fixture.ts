import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadContent } from '../src/content/load';
import type { Content } from '../src/content/types';
import type { Action } from '../src/sim/actions';
import { checkInvariants } from '../src/sim/invariants';
import { reduce } from '../src/sim/reduce';
import { initialState, type GameState } from '../src/sim/state';
import { GameStateSchema, parseSaveValue, SaveSchema, SAVE_SCHEMA_VERSION } from '../src/sim/state.schema';
import { readContentFiles } from './content/io';

/** TOOL-008 (tools.md §3): steps-driven fixture saves over `reduce`, byte-stable, canonical key order. */
export const SAVED_AT = '2026-01-01T00:00:00.000Z';
export const STEPS_DIR = 'tests/fixtures/steps';
export const FIXTURE_DIR = 'tests/fixtures';
/** `repeat: "drain"` (advanceDialogue only) dispatches until no dialogue is open, so steps hold on any content's scripts. */
export type Step = { action: Action; repeat?: number | 'drain' } | { set: { path: string; value: unknown } };
export type StepsFile = { seed: number; steps: Step[] };

/** A fixture problem the tool reports with exit 1 (rejection, disallowed set, schema or invariant failure). */
export class FixtureError extends Error {}

/** tools.md §2.4 direct-edit rule: only what no action reaches. */
const SETTABLE = [/^\/scene(\/.*)?$/, /^\/avatar(\/.*)?$/, /^\/pets\/[^/]+\/introduced$/, /^\/inventory\/counts(\/[^/]+)?$/];

/** RFC 6901 subset: `~1` → `/`, `~0` → `~`, arrays by index or `-` (append). */
function setPointer(state: GameState, path: string, value: unknown): void {
  const keys = path.split('/').slice(1).map(key => key.replace(/~1/g, '/').replace(/~0/g, '~'));
  let target = state as unknown as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) {
    if (target[key] === null || typeof target[key] !== 'object') throw new FixtureError(`set ${path}: no object at "${key}"`);
    target = target[key] as Record<string, unknown>;
  }
  const last = keys[keys.length - 1];
  if (Array.isArray(target) && last === '-') target.push(value);
  else target[last] = value;
}

function applyStep(content: Content, state: GameState, step: Step, index: number): GameState {
  if ('set' in step) {
    if (!SETTABLE.some(pattern => pattern.test(step.set.path)))
      throw new FixtureError(`step ${index}: set ${step.set.path} is not a tools.md §2.4 direct-edit field`);
    const next = structuredClone(state);
    setPointer(next, step.set.path, structuredClone(step.set.value));
    return next;
  }
  if (step.repeat === 'drain') return drainDialogue(content, state, step.action, index);
  let current = state;
  for (let count = 0; count < (step.repeat ?? 1); count++) current = dispatch(content, current, step.action, index);
  return current;
}

function dispatch(content: Content, state: GameState, action: Action, index: number): GameState {
  const result = reduce(content, state, action);
  const rejected = result.events.find(event => event.type === 'action.rejected');
  if (rejected) throw new FixtureError(`step ${index}: ${action.type} rejected: ${rejected.reason}`);
  return result.state;
}

const DRAIN_LIMIT = 100;

/** Each advance still goes through `reduce`; zero advances when no dialogue is open. */
function drainDialogue(content: Content, state: GameState, action: Action, index: number): GameState {
  if (action.type !== 'advanceDialogue') throw new FixtureError(`step ${index}: repeat "drain" applies only to advanceDialogue`);
  let current = state;
  for (let count = 0; current.dialogue.current !== null; count++) {
    if (count === DRAIN_LIMIT) throw new FixtureError(`step ${index}: dialogue still open after ${DRAIN_LIMIT} advances`);
    current = dispatch(content, current, action, index);
  }
  return current;
}

/** Schema, invariants and the `tick {dtMs: 0}` sanity dispatch, then the canonical `tpp.save` text. */
export function canonicalSave(content: Content, state: GameState): string {
  const parsed = GameStateSchema.safeParse(state);
  if (!parsed.success) throw new FixtureError(`GameState schema: ${parsed.error.issues.map(issue => `/${issue.path.join('/')} ${issue.message}`).join('; ')}`);
  const violations = checkInvariants(content, state);
  if (violations.length > 0) throw new FixtureError(`invariants: ${violations.join('; ')}`);
  const sanity = reduce(content, state, { type: 'tick', dtMs: 0, move: { x: 0, y: 0 } });
  if (sanity.events.some(event => event.type === 'action.rejected')) throw new FixtureError('sanity tick rejected');
  return JSON.stringify(SaveSchema.parse({ schemaVersion: SAVE_SCHEMA_VERSION, savedAt: SAVED_AT, state }), null, 2) + '\n';
}

export function generateFixture(content: Content, steps: StepsFile, seed = steps.seed): string {
  if (!Number.isInteger(seed) || !Array.isArray(steps.steps)) throw new FixtureError('steps file needs an integer "seed" and a "steps" array');
  const state = steps.steps.reduce((current, step, index) => applyStep(content, current, step, index), initialState(content, seed));
  return canonicalSave(content, state);
}

/** `--from`: validate a pasted save as the loader does, then rewrite it canonically. */
export function fixtureFromSave(content: Content, value: unknown): string {
  const loaded = parseSaveValue(content, value);
  if ('discarded' in loaded) throw new FixtureError(`save discarded: ${loaded.discarded}`);
  return canonicalSave(content, loaded.state);
}

export const readSteps = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as StepsFile;
export const stepsFiles = () => readdirSync(STEPS_DIR).filter(name => name.endsWith('.json')).sort();

/** `--all`: every steps file, generated first and written only if all succeed. */
export function generateAll(content: Content): Map<string, string> {
  return new Map(stepsFiles().map(name => {
    try {
      return [join(FIXTURE_DIR, name), generateFixture(content, readSteps(join(STEPS_DIR, name)))];
    } catch (error) {
      if (error instanceof FixtureError) throw new FixtureError(`${basename(name, '.json')}: ${error.message}`);
      throw error;
    }
  }));
}

type Flags = { scenario?: string; steps?: string; all: boolean; from?: string; seed?: number; content?: string; out?: string };

function flags(argv: string[]): Flags {
  const result: Flags = { all: false };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--all') { result.all = true; continue; }
    const value = argv[index + 1];
    if (!['--scenario', '--steps', '--from', '--seed', '--content', '--out'].includes(flag) || value === undefined || value.startsWith('--'))
      throw new Error(`Unknown flag or missing value: ${flag}`);
    index++;
    if (flag === '--seed') {
      result.seed = Number(value);
      if (!Number.isInteger(result.seed)) throw new Error('--seed must be an integer');
    } else result[flag.slice(2) as 'scenario' | 'steps' | 'from' | 'content' | 'out'] = value;
  }
  if ([result.scenario, result.steps, result.from, result.all || undefined].filter(Boolean).length !== 1)
    throw new Error('Usage: npm run fixture -- --scenario <name> [--seed n] [--content dir] [--out file] | --steps <file> | --all | --from <save.json>');
  return result;
}

async function main(argv: string[]): Promise<void> {
  const options = flags(argv);
  const content = loadContent(undefined, await readContentFiles(options.content ?? (options.all ? 'tests/fixtures/content-min' : 'src/content')));
  if (options.all) {
    const outputs = generateAll(content);
    for (const [file, text] of outputs) writeFileSync(file, text);
    process.stdout.write(`fixture: wrote ${outputs.size} fixtures\n`);
    return;
  }
  const text = options.from ? fixtureFromSave(content, JSON.parse(readFileSync(options.from, 'utf8')))
    : generateFixture(content, readSteps(options.steps ?? join(STEPS_DIR, `${options.scenario}.json`)), options.seed);
  if (options.out) writeFileSync(options.out, text);
  else process.stdout.write(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`fixture: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = error instanceof FixtureError ? 1 : 3;
  });
}

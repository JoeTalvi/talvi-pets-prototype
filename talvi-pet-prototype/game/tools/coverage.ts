import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { args, readInput, evaluate, output, findingText, zodText, fail, readContentFiles, type Args } from './content/io';
import { coverage, coverageText } from './content/coverage';
import { loadContent } from '../src/content/load';
import type { Content } from '../src/content/types';
import { itemTypeIds } from '../src/content/schema/charms';
import { rewardItems } from '../src/content/schema/pet';
import type { ConditionView } from '../src/sim/events';
import { checkInvariants } from '../src/sim/invariants';
import { boundaryCents, revealView, starsOf, wantConditions } from '../src/sim/select';
import { initialState, type GameState } from '../src/sim/state';
import { GameStateSchema, parseSaveValue } from '../src/sim/state.schema';

/** TOOL-003 preview half (WORK-003): `--panel`, `--reveal`, `--stars --save`, over selectors only.
 * The flags are consumed here before `args()` (tools/content/io.ts rejects them; fork 1). */
export type Preview =
  | { kind: 'panel'; petId: string; wantId: string; owned: string }
  | { kind: 'reveal'; projectId: string }
  | { kind: 'stars'; save: string };

/** A synthetic state that fails the schema or `checkInvariants`: the tool's own misuse (exit 3). */
export class SyntheticStateError extends Error {}

export function splitPreview(argv: string[]): { preview: Preview | null; rest: string[] } {
  const rest: string[] = [];
  let panel: [string, string] | null = null, reveal: string | null = null, stars = false, save: string | null = null, owned = 'starter';
  const value = (i: number, flag: string) => {
    if (argv[i] === undefined || argv[i].startsWith('--')) throw new Error(`${flag} needs a value`);
    return argv[i];
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--panel') { panel = [value(i + 1, flag), value(i + 2, flag)]; i += 2; }
    else if (flag === '--reveal') reveal = value(++i, flag);
    else if (flag === '--owned') owned = value(++i, flag);
    else if (flag === '--save') save = value(++i, flag);
    else if (flag === '--stars') stars = true;
    else rest.push(flag);
  }
  if ([panel, reveal, stars || null].filter(Boolean).length > 1) throw new Error('use one of --panel, --reveal, --stars');
  if (stars !== (save !== null)) throw new Error('--stars needs --save <fixture> (and --save needs --stars)');
  const preview: Preview | null = panel ? { kind: 'panel', petId: panel[0], wantId: panel[1], owned }
    : reveal ? { kind: 'reveal', projectId: reveal } : stars ? { kind: 'stars', save: save! } : null;
  if (!panel && argv.includes('--owned')) throw new Error('--owned applies to --panel only');
  return { preview, rest };
}

/** tools §2.4 / §3 TOOL-003: `initialState(content, 0)` → direct edits → schema + `checkInvariants`. */
export function syntheticState(content: Content, edit: (state: GameState) => void): GameState {
  const state = structuredClone(initialState(content, 0));
  edit(state);
  const parsed = GameStateSchema.safeParse(state);
  if (!parsed.success) throw new SyntheticStateError(`synthetic state fails the GameState schema: ${parsed.error.issues.map(issue => `/${issue.path.join('/')} ${issue.message}`).join('; ')}`);
  const violations = checkInvariants(content, state);
  if (violations.length) throw new SyntheticStateError(`synthetic state violates ${violations.join('; ')}`);
  return state;
}

/** `starter` | `phase:<n>` (starter + the first n phase rewards of the rising projects, content order) |
 * `hearts:<k>` (starter + the type rewards of the pet's first k wants) | `all`. Owned set only (§2.4). */
/** The granted type ids (distinct, first-grant order); the panel preview holds one copy of each (DEC-043). */
export function ownedSet(content: Content, petId: string, owned: string): string[] {
  const starter = itemTypeIds(content.charms.starterSet);
  const [kind, count] = owned.split(':'), n = Number(count);
  if (owned === 'starter') return starter;
  if (owned === 'all') return content.charms.types.map(type => type.id);
  if ((kind !== 'phase' && kind !== 'hearts') || !Number.isInteger(n) || n < 0) throw new Error('--owned must be starter|phase:<n>|hearts:<k>|all');
  const extra = kind === 'phase'
    ? itemTypeIds(content.projects.filter(project => !project.completeAtStart).flatMap(project => project.phaseRewards).slice(0, n).flat())
    : itemTypeIds(content.pets[petId].wants.slice(0, n).flatMap(rewardItems));
  return [...new Set([...starter, ...extra])];
}

const text = (content: Content, key: string) => content.strings[key] ?? `[${key}]`;
const tagName = (content: Content, tag: string | undefined) => content.tags.find(entry => entry.id === tag)?.name ?? `[${tag}]`;

function conditionText(content: Content, view: ConditionView, max: number): string {
  const box = view.met ? '✓' : '☐';
  if (view.kind === 'adjacent') return `${box} ${tagName(content, view.tagA)} + ${tagName(content, view.tagB)} ${text(content, 'tpp.want.adjacent')}`;
  if (view.kind === 'stars') return `${box} ${text(content, 'tpp.want.starsFloor').replace('{min}', String(view.min))} (${view.current} / ${max})`;
  if (view.hidden) return `${box} ${text(content, 'tpp.want.hidden')}`;
  const note = view.availability === 'owned' ? '(owned)' : `— ${text(content, `tpp.want.availability.${view.availability}`)}`;
  return `${box} ${tagName(content, view.tag)} ${note}`;
}

export function panelPreview(content: Content, preview: Extract<Preview, { kind: 'panel' }>) {
  const pet = content.pets[preview.petId];
  if (!pet) throw new Error(`Unknown pet "${preview.petId}"`);
  const index = pet.wants.findIndex(want => want.id === preview.wantId);
  if (index < 0) throw new Error(`Unknown want "${preview.wantId}" for pet ${preview.petId}`);
  const roomId = Object.values(content.rooms).find(room => room.residentPetId === pet.id)!.id;
  const state = syntheticState(content, draft => {
    draft.inventory.counts = Object.fromEntries(ownedSet(content, pet.id, preview.owned).map(id => [id, 1])); // one copy each, none placed
    draft.pets[pet.id].fulfilledWantIds = pet.wants.slice(0, index).map(want => want.id);
    draft.pets[pet.id].hearts = index;
    draft.pets[pet.id].introduced = true;
    draft.scene = { kind: 'interior', roomId };
  });
  const conditions = wantConditions(content, state, pet.id), max = starsOf(content, state, roomId).max;
  const want = pet.wants[index];
  return { data: { petId: pet.id, wantId: want.id, index: index + 1, owned: preview.owned, conditions },
    lines: [`panel  ${pet.id}  want ${index + 1} ${want.id}  owned ${preview.owned}`, `  ${want.brief}`,
      ...conditions.map(view => `  ${conditionText(content, view, max)}`), `  ${text(content, 'tpp.want.rewardPrefix')} ${want.rewardLabel}`] };
}

export function revealPreview(content: Content, projectId: string) {
  const project = content.projects.find(candidate => candidate.id === projectId);
  if (!project) throw new Error(`Unknown project "${projectId}"`);
  const views = [0, 1, 2, 3, 4, 5].map(phase => revealView(content, syntheticState(content, draft => {
    draft.projects[projectId] = { currentCents: boundaryCents(project.goalCents, phase), acknowledgedPhase: phase as 0,
      complete: phase === 5, arrivalDone: phase === 5 };
  }), projectId));
  const lines = views.flatMap((view, phase) => view === null ? [`ack ${phase}  no reveal view`] : [
    `ack ${phase}  image ${view.image}  cards ${view.cards.map(card => (card.unlocked ? `${card.phase}:${card.icon}` : `${card.phase}:locked`)).join(' ')}`,
    `       ${JSON.stringify(view)}`]);
  return { data: views, lines: [`reveal  ${projectId}  acknowledgedPhase 0..5`, ...lines] };
}

export function starsPreview(content: Content, save: unknown, file: string) {
  const loaded = parseSaveValue(content, save);
  if ('discarded' in loaded) throw new SyntheticStateError(`--save ${file} discarded: ${loaded.discarded}`);
  const rooms = Object.keys(content.rooms).map(roomId => ({ roomId, ...starsOf(content, loaded.state, roomId) }));
  return { data: rooms, lines: [`stars  ${file}`, ...rooms.map(room => `  ${room.roomId} ${room.points} / ${room.max}`)] };
}

export function runPreview(content: Content, preview: Preview, readSave = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as unknown) {
  if (preview.kind === 'panel') return panelPreview(content, preview);
  if (preview.kind === 'reveal') return revealPreview(content, preview.projectId);
  return starsPreview(content, readSave(preview.save), preview.save);
}

async function previewMain(a: Args, preview: Preview) {
  const result = runPreview(loadContent(undefined, await readContentFiles(a.content)), preview);
  await output(a, a.format === 'json' ? JSON.stringify(result.data, null, 2) : result.lines.join('\n'));
}

const USAGE = 'report:coverage [--content dir|bundle.json] [--manifest file] [--pet id] [--project id] [--format text|json] [--out file] [--known-missing file]\n' +
  '  | --panel <petId> <wantId> [--owned starter|phase:<n>|hearts:<k>|all] | --reveal <projectId> | --stars --save <fixture.json>\n' +
  'previews load content without the manifest; json: panel { petId, wantId, index, owned, conditions }, reveal RevealView[6], stars { roomId, points, max }[]';

async function main() {
  const { preview, rest } = splitPreview(process.argv.slice(2));
  const a = args(rest, true);
  if (a.help) {
    await output(a, USAGE);
    return;
  }
  if (preview) return previewMain(a, preview);
  const { files, manifest, knownMissing } = await readInput(a), { content, report } = evaluate(files, manifest, a, knownMissing);
  if (!content) {
    await output(a, a.format === 'json' ? JSON.stringify(report, null, 2) : report.zodIssues.map(i => `${i.file}:${i.path} ${i.message}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  const data = coverage(content, report.findings, a);
  await output(a, a.format === 'json' ? JSON.stringify(data, null, 2) : coverageText(content, data) + '\n' + [...report.zodIssues.map(zodText), ...report.findings.map(findingText)].join('\n'));
  process.exitCode = report.exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(fail);

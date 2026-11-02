import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { clueIndices } from '../../src/sim/rules/celebration';
import { checkInvariants } from '../../src/sim/invariants';
import { reduce } from '../../src/sim/reduce';
import type { GameState } from '../../src/sim/state';
import { parseSaveValue } from '../../src/sim/state.schema';
import { parseSave } from '../../src/app/persistence';
import { FIXTURE_DIR, generateFixture, readSteps, STEPS_DIR, stepsFiles } from '../../tools/make-fixture';
import { loadContent } from '../../src/content/load';
import { readContentFiles } from '../../tools/content/io';
import { validContent } from './helpers';

const content = validContent();
const runner = 'node_modules/tsx/dist/cli.mjs', dir = mkdtempSync(join(tmpdir(), 'tpp-fixture-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const committed = (name: string) => readFileSync(join(FIXTURE_DIR, name), 'utf8');
const stateOf = (name: string) => (JSON.parse(committed(name)) as { state: GameState }).state;
const fixture = (argv: string[]) => spawnSync(process.execPath, [runner, 'tools/make-fixture.ts', ...argv], { encoding: 'utf8' });

describe('VERIFY-TOOL-008 committed fixtures', () => {
  it('VERIFY-TOOL-008 there are 22 steps files, each with its generated fixture', () => {
    expect(stepsFiles()).toHaveLength(22);
    for (const name of stepsFiles()) expect(existsSync(join(FIXTURE_DIR, name)), name).toBe(true);
  });
  it.each(stepsFiles())('VERIFY-TOOL-008 %s: regenerating in-process equals the committed bytes; it loads without discard and checkInvariants → []', name => {
    expect(generateFixture(content, readSteps(join(STEPS_DIR, name)))).toBe(committed(name));
    const loaded = parseSaveValue(content, JSON.parse(committed(name)));
    expect(loaded).not.toHaveProperty('discarded');
    expect(checkInvariants(content, (loaded as { state: GameState }).state)).toEqual([]);
  });
});

it('VERIFY-MEC-004-006 (fixture form, rewritten): save-v1.milestone loads at step milestone; collectRewards emits one items.granted {phase} per phase item, the pre-owned bookshelf gains a copy', () => {
  const state = (parseSaveValue(content, JSON.parse(committed('save-v1.milestone.json'))) as { state: GameState }).state;
  expect(state.celebration!.step).toBe('milestone');
  const owned = state.celebration!.unlockedTypeIds.filter(id => Object.hasOwn(state.inventory.counts, id));
  expect(owned).toEqual(['bookshelf']);
  const result = reduce(content, state, { type: 'collectRewards' });
  const granted = result.events.filter(event => event.type === 'items.granted');
  expect(granted.map(event => (event as { typeId: string }).typeId)).toEqual(state.celebration!.unlockedTypeIds);
  expect(granted.every(event => (event as { source: string; count: number }).source === 'phase' && (event as { count: number }).count === 1)).toBe(true);
  expect(result.state.inventory.counts.bookshelf).toBe(state.inventory.counts.bookshelf + 1);
});

it('VERIFY-MEC-008-012 / VERIFY-MEC-009-020 (FX-SAVE-V1-VIGNETTE shape): vignette current at index 0, hearts 1, Heart bundle owned', () => {
  const state = stateOf('save-v1.vignette.json');
  expect(state.dialogue.current).toMatchObject({ source: 'vignette', index: 0, wantId: 'soft-nap' });
  expect(state.pets.dog.hearts).toBe(1);
  expect(state.inventory.counts).toMatchObject({ rug: 1, cushion: 1 });
});

describe('VERIFY-TOOL-008 CLI', () => {
  it('VERIFY-TOOL-008 a steps file with a rejected action exits 1 naming the step index and reason and writes nothing', () => {
    const steps = join(dir, 'bad.json'), out = join(dir, 'bad-out.json');
    writeFileSync(steps, JSON.stringify({ seed: 1, steps: [{ action: { type: 'setDesignMode', on: true } }] }));
    const result = fixture(['--steps', steps, '--content', 'tests/fixtures/content-min', '--out', out]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('step 0: setDesignMode rejected: notInterior');
    expect(existsSync(out)).toBe(false);
  });
  it('VERIFY-TOOL-008 a set outside the tools.md §2.4 fields exits 1 and writes nothing', () => {
    const steps = join(dir, 'set.json'), out = join(dir, 'set-out.json');
    writeFileSync(steps, JSON.stringify({ seed: 1, steps: [{ set: { path: '/pets/dog/hearts', value: 3 } }] }));
    const result = fixture(['--steps', steps, '--content', 'tests/fixtures/content-min', '--out', out]);
    expect([result.status, existsSync(out)]).toEqual([1, false]);
    expect(result.stderr).toContain('step 0: set /pets/dog/hearts is not a tools.md §2.4 direct-edit field');
  });
  it('VERIFY-TOOL-008 --from on a committed fixture reproduces it byte for byte', () => {
    const out = join(dir, 'from.json');
    const result = fixture(['--from', join(FIXTURE_DIR, 'save-v1.reveal.json'), '--content', 'tests/fixtures/content-min', '--out', out]);
    expect(result.status).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(committed('save-v1.reveal.json'));
  });
  it('VERIFY-TOOL-008 --scenario celebration-milestone on the default content (src/content) writes a save at step milestone with clueIndices [1, 2, 3] (in-engine replay is WORK-021)', () => {
    const out = join(dir, 'milestone.json');
    expect(fixture(['--scenario', 'celebration-milestone', '--out', out]).status).toBe(0);
    const { celebration } = (JSON.parse(readFileSync(out, 'utf8')) as { state: GameState }).state;
    expect(celebration!.step).toBe('milestone');
    expect(clueIndices(celebration!.fromPhase, celebration!.toPhase)).toEqual([1, 2, 3]);
  });
  it('VERIFY-TOOL-008 repeat "drain" on any action but advanceDialogue exits 1', () => {
    const steps = join(dir, 'drain.json');
    writeFileSync(steps, JSON.stringify({ seed: 1, steps: [{ action: { type: 'skipWait' }, repeat: 'drain' }] }));
    const result = fixture(['--steps', steps, '--content', 'tests/fixtures/content-min']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('repeat "drain" applies only to advanceDialogue');
  });
  it('VERIFY-TOOL-008 an unknown flag exits 3', () => {
    expect(fixture(['--nope']).status).toBe(3);
  });
});

describe('VERIFY-TOOL-008 named scenarios over the real content (src/content)', async () => {
  const real = loadContent(undefined, await readContentFiles('src/content'));
  it.each(stepsFiles())('VERIFY-TOOL-008 %s generates over src/content and loads there without discard', name => {
    const text = generateFixture(real, readSteps(join(STEPS_DIR, name)));
    expect(parseSaveValue(real, JSON.parse(text))).not.toHaveProperty('discarded');
  });
});

describe('prototype.md §4 fixed opening: the session-opening family (Q-C) on real content', async () => {
  const real = loadContent(undefined, await readContentFiles('src/content'));
  const arms: [string, Partial<GameState['session']>][] = [
    ['session-opening', { starsVisible: true, feedPresentation: 'events', eventIntervalMs: 20000 }],
    ['session-opening-stars-hidden', { starsVisible: false }], ['session-opening-trickle', { feedPresentation: 'trickle' }],
    ['session-opening-frozen', { eventIntervalMs: null }]];
  it.each(arms)('VERIFY-TOOL-008 %s.real.json parses through parseSave on src/content with the fixed-opening invariants and its arm', (name, arm) => {
    const text = readFileSync(join('tests/view/capture', `${name}.real.json`), 'utf8');
    expect(text).toBe(generateFixture(real, readSteps(join(STEPS_DIR, `${name}.json`))));
    const loaded = parseSave(real, text);
    expect(loaded).not.toHaveProperty('discarded');
    const { state } = loaded as { state: GameState };
    expect(state.pets.dog).toMatchObject({ introduced: true, hearts: 0, fulfilledWantIds: [] });
    expect(state.projects['pet-house']).toMatchObject({ currentCents: 0, acknowledgedPhase: 0 });
    expect(state.projects['starter-house'].complete).toBe(true);
    expect(state.scene).toEqual({ kind: 'interior', roomId: 'dog-room' });
    expect(state.dialogue.current).toBeNull();
    expect(state.session).toMatchObject({ seed: 1234, ...arm });
  });
});

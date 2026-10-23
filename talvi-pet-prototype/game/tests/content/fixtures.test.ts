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
import { FIXTURE_DIR, generateFixture, readSteps, STEPS_DIR, stepsFiles } from '../../tools/make-fixture';
import { validContent } from './helpers';

const content = validContent();
const runner = 'node_modules/tsx/dist/cli.mjs', dir = mkdtempSync(join(tmpdir(), 'tpp-fixture-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const committed = (name: string) => readFileSync(join(FIXTURE_DIR, name), 'utf8');
const stateOf = (name: string) => (JSON.parse(committed(name)) as { state: GameState }).state;
const fixture = (argv: string[]) => spawnSync(process.execPath, [runner, 'tools/make-fixture.ts', ...argv], { encoding: 'utf8' });

describe('VERIFY-TOOL-008 committed fixtures', () => {
  it('VERIFY-TOOL-008 there are 18 steps files, each with its generated fixture', () => {
    expect(stepsFiles()).toHaveLength(18);
    for (const name of stepsFiles()) expect(existsSync(join(FIXTURE_DIR, name)), name).toBe(true);
  });
  it.each(stepsFiles())('VERIFY-TOOL-008 %s: regenerating in-process equals the committed bytes; it loads without discard and checkInvariants → []', name => {
    expect(generateFixture(content, readSteps(join(STEPS_DIR, name)))).toBe(committed(name));
    const loaded = parseSaveValue(content, JSON.parse(committed(name)));
    expect(loaded).not.toHaveProperty('discarded');
    expect(checkInvariants(content, (loaded as { state: GameState }).state)).toEqual([]);
  });
});

it('VERIFY-MEC-004-006 (fixture form): save-v1.milestone loads at step milestone; collectRewards emits types.unlocked without the pre-owned id', () => {
  const state = (parseSaveValue(content, JSON.parse(committed('save-v1.milestone.json'))) as { state: GameState }).state;
  expect(state.celebration!.step).toBe('milestone');
  const owned = state.celebration!.unlockedTypeIds.filter(id => state.inventory.ownedTypeIds.includes(id));
  expect(owned).toEqual(['bookshelf']);
  const first = reduce(content, state, { type: 'collectRewards' }).events[0];
  expect(first).toMatchObject({ type: 'types.unlocked' });
  expect((first as { typeIds: string[] }).typeIds).toEqual(state.celebration!.unlockedTypeIds.filter(id => id !== 'bookshelf'));
});

it('VERIFY-MEC-008-012 / VERIFY-MEC-009-020 (FX-SAVE-V1-VIGNETTE shape): vignette current at index 0, hearts 1, Heart bundle owned', () => {
  const state = stateOf('save-v1.vignette.json');
  expect(state.dialogue.current).toMatchObject({ source: 'vignette', index: 0, wantId: 'soft-nap' });
  expect(state.pets.dog.hearts).toBe(1);
  expect(state.inventory.ownedTypeIds).toEqual(expect.arrayContaining(['rug', 'cushion']));
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
  it('VERIFY-TOOL-008 --scenario celebration-milestone writes a save at step milestone with clueIndices [1, 2, 3] (in-engine replay is WORK-021)', () => {
    const out = join(dir, 'milestone.json');
    expect(fixture(['--scenario', 'celebration-milestone', '--content', 'tests/fixtures/content-min', '--out', out]).status).toBe(0);
    const { celebration } = (JSON.parse(readFileSync(out, 'utf8')) as { state: GameState }).state;
    expect(celebration!.step).toBe('milestone');
    expect(clueIndices(celebration!.fromPhase, celebration!.toPhase)).toEqual([1, 2, 3]);
  });
  it('VERIFY-TOOL-008 an unknown flag exits 3', () => {
    expect(fixture(['--nope']).status).toBe(3);
  });
});

import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import { PetPreviewError, petArgs, runPetPreview } from '../../tools/pet-preview';
import { files, manifest, patchFiles, validContent } from '../content/helpers';
import { deepFreeze } from './helpers';

const min = deepFreeze(validContent());
const args = (extra: string[]) => petArgs(['--room', 'dog-room', '--seed', '7', '--seconds', '180', ...extra]);
// Fork 3: the fixture Dog has no `light` like and `sit-on` is not an atStart verb, so `stool` (seat) is never a
// candidate; `rug` (soft → nap, atStart) is the liked small type that exercises the same rule.
const fork3 = ['--place', 'large-1=dog-bed', '--place', 'floor-1=rug'];

describe('TOOL-005 pet preview (FX-CONTENT-MIN)', () => {
  it('VERIFY-TOOL-005 candidate rule on FX-CONTENT-MIN with floor-1=rug (soft → nap; the fixture Dog has no light like and no atStart seat verb): only large-1 and floor-1 are targets, zero wander', () => {
    const { summary } = runPetPreview(min, args(fork3));
    expect(summary.decisions).toBeGreaterThan(0);
    expect(Object.keys(summary.targets).map(key => key.split(' ')[0]).sort()).toEqual(['floor-1', 'large-1']);
    expect(summary.wander).toEqual({});
    expect(summary.invariant10).toBe('held');
    expect(summary.ticks).toBe(1800);
  });

  it('VERIFY-TOOL-005 reruns are identical (text and json) and the output is plain JSON', () => {
    expect(runPetPreview(min, args(fork3)).lines).toEqual(runPetPreview(min, args(fork3)).lines);
    const json = runPetPreview(min, args([...fork3, '--format', 'json'])).lines[0];
    expect(json).toBe(runPetPreview(min, args([...fork3, '--format', 'json'])).lines[0]);
    expect(JSON.parse(json).summary.wander).toEqual({});
  });

  it('VERIFY-TOOL-005 invariant 10 is checked every tick: a walkArea that excludes the pet stops at tick 1 with the segment', () => {
    const away = loadContent(manifest, patchFiles(files(), [{ file: 'rooms/dog-room.json', path: '/walkArea',
      value: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] }]));
    expect(() => runPetPreview(away, args(['--seconds', '1']))).toThrow(PetPreviewError);
    expect(() => runPetPreview(away, args(['--seconds', '1']))).toThrow(/invariant 10: .* at tick 1 \(00:00\.1\), segment/);
  });

  it('VERIFY-TOOL-005 a mismatched --place reports the action.rejected reason; --at edits run in design mode', () => {
    expect(() => runPetPreview(min, args(['--place', 'floor-1=dog-bed']))).toThrow(/action\.rejected placeCharm reason=\w+/);
    const edited = runPetPreview(min, args(['--seconds', '20', '--place', 'floor-1=rug', '--at', '5:remove:floor-1']));
    expect(edited.lines).toContain('00:05.0  charm.removed slot=floor-1 type=rug');
    expect(() => petArgs(['--room', 'dog-room', '--at', 'x:floor-1=stool'])).toThrow();
  });

  it('VERIFY-TOOL-005 CLI exits 0 on a run, 1 on a rejected placement and 3 on an unknown flag', () => {
    const cli = (extra: string[]) => spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tools/pet-preview.ts',
      '--content', 'tests/fixtures/content-min', '--room', 'dog-room', '--seconds', '2', ...extra], { encoding: 'utf8' });
    expect(cli([]).status).toBe(0);
    expect(cli(['--place', 'floor-1=dog-bed']).status).toBe(1);
    expect(cli(['--bogus', 'x']).status).toBe(3);
  }, 30000);
});

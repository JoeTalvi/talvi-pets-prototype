import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import { boundaryCents } from '../../src/sim/select';
import { ownedSet, panelPreview, revealPreview, runPreview, splitPreview, syntheticState, SyntheticStateError } from '../../tools/coverage';
import { validContent } from '../content/helpers';
import { deepFreeze } from './helpers';

const real = deepFreeze(loadContent());
const min = deepFreeze(validContent());

describe('TOOL-003 coverage previews: panel', () => {
  it('VERIFY-TOOL-003 --panel dog bright-corner --owned starter on the real strings: plant unmet with the nextPhase text, light owned, adjacent worded by tpp.want.adjacent', () => {
    const { lines, data } = panelPreview(real, { kind: 'panel', petId: 'dog', wantId: 'bright-corner', owned: 'starter' });
    expect(lines).toContain(`  ☐ Plant — ${real.strings['tpp.want.availability.nextPhase']}`);
    expect(real.strings['tpp.want.availability.nextPhase']).toBe('arrives with the next home phase');
    expect(lines).toContain('  ☐ Light (owned)');
    expect(lines).toContain(`  ☐ Light + Plant ${real.strings['tpp.want.adjacent']}`);
    expect(data.conditions.map(view => view.kind)).toEqual(['tag', 'tag', 'adjacent']);
    expect(data.index).toBe(2);
  });

  it('VERIFY-TOOL-003 partial: --panel on FX-CONTENT-MIN prints [key] for absent tpp.want.* strings (the in-game comparison is WORK-021)', () => {
    const { lines } = panelPreview(min, { kind: 'panel', petId: 'dog', wantId: min.pets.dog.wants[1].id, owned: 'starter' });
    expect(lines.some(line => line.includes('[tpp.want.'))).toBe(true);
  });

  it('VERIFY-TOOL-003 --owned sets: starter, phase:n, hearts:k, all', () => {
    expect(ownedSet(real, 'dog', 'starter')).toEqual(real.charms.starterSet);
    expect(ownedSet(real, 'dog', 'phase:1')).toEqual([...real.charms.starterSet, 'fern', 'perch-branch']);
    expect(ownedSet(real, 'dog', 'hearts:1')).toEqual([...real.charms.starterSet, 'rug', 'cushion']);
    expect(ownedSet(real, 'dog', 'all')).toHaveLength(real.charms.types.length);
    expect(() => ownedSet(real, 'dog', 'phase:x')).toThrow();
    const owned = panelPreview(real, { kind: 'panel', petId: 'dog', wantId: 'bright-corner', owned: 'phase:1' });
    expect(owned.lines).toContain('  ☐ Plant (owned)');
  });

});

describe('TOOL-003 coverage previews: reveal, stars, misuse and CLI', () => {
  it('VERIFY-TOOL-003 --reveal pet-house prints six states; views 0..4 carry no image or name key, state 5 does', () => {
    const { data, lines } = revealPreview(real, 'pet-house');
    expect(data).toHaveLength(6);
    for (const view of data.slice(0, 5)) {
      const json = JSON.stringify(view);
      for (const key of ['descriptorImage', 'silhouetteImage', 'petName']) expect(json).not.toContain(key);
    }
    expect(Object.keys(data[5]!)).toEqual(expect.arrayContaining(['descriptorImage', 'silhouetteImage', 'petName']));
    expect(data.map(view => view!.cards.filter(card => card.unlocked).length)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(lines.filter(line => line.startsWith('ack '))).toHaveLength(6);
  });

  it('VERIFY-TOOL-003 --stars --save dog-room-intro-done on FX-CONTENT-MIN prints points / max per room', () => {
    const preview = splitPreview(['--stars', '--save', 'tests/fixtures/dog-room-intro-done.json']).preview!;
    expect(runPreview(min, preview).lines.slice(1)).toEqual(['  dog-room 0 / 48', '  owl-room 0 / 48']);
  });

  it('VERIFY-TOOL-003 a synthetic state failing checkInvariants is the tool\'s misuse (SyntheticStateError, exit 3)', () => {
    const goal = real.projects[1].goalCents;
    expect(() => syntheticState(real, state => { state.projects['pet-house'].acknowledgedPhase = 3; })).toThrow(SyntheticStateError);
    expect(() => syntheticState(real, state => { state.projects['pet-house'].currentCents = boundaryCents(goal, 3); state.projects['pet-house'].acknowledgedPhase = 3; })).not.toThrow();
    const save = JSON.parse(readFileSync('tests/fixtures/dog-room-intro-done.json', 'utf8'));
    save.state.pets.dog.hearts = 4;
    expect(() => runPreview(min, { kind: 'stars', save: 'x' }, () => save)).toThrow(SyntheticStateError);
  });

  it('VERIFY-TOOL-003 the preview flags are consumed before args(); conflicting flags are rejected', () => {
    expect(splitPreview(['--panel', 'dog', 'bright-corner', '--format', 'json'])).toEqual({
      preview: { kind: 'panel', petId: 'dog', wantId: 'bright-corner', owned: 'starter' }, rest: ['--format', 'json'] });
    expect(splitPreview(['--pet', 'dog']).preview).toBeNull();
    expect(() => splitPreview(['--stars'])).toThrow();
    expect(() => splitPreview(['--reveal', 'pet-house', '--stars', '--save', 'f'])).toThrow();
  });

  it('VERIFY-TOOL-003 CLI exits 0 on a preview and on sections A–F, 3 on an unknown flag or a discarded save', () => {
    const cli = (args: string[]) => spawnSync(process.execPath, ['node_modules/tsx/dist/cli.mjs', 'tools/coverage.ts', ...args], { encoding: 'utf8' });
    const panel = cli(['--panel', 'dog', 'bright-corner', '--owned', 'starter']);
    expect(panel.status).toBe(0);
    expect(panel.stdout).toContain('☐ Plant — arrives with the next home phase');
    expect(cli(['--content', 'tests/fixtures/content-min', '--manifest', 'tests/fixtures/content-min/manifest.json']).status).toBe(0);
    expect(cli(['--bogus']).status).toBe(3);
    expect(cli(['--stars', '--save', 'package.json']).status).toBe(3);
  }, 30000);
});

import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { loadContent, type ContentFiles } from '../../src/content/load';
import { runContentChecks } from '../../src/sim/checks';
import { ownedAtActivation, wantSatisfiable } from '../../src/sim/checks/chk-009-17';
import { realContent } from '../sim/helpers';
import { manifest, validContent } from './helpers';

it('VERIFY-MEC-009-025 (new) CHK-009-17 on FX-REAL: every Dog and Owl want is satisfiable from the copies owned at its activation', () => {
  const content = realContent();
  for (const pet of Object.values(content.pets))
    pet.wants.forEach((want, index) => expect(wantSatisfiable(content, pet.id, index), `${pet.id} ${want.id}`).toMatchObject({ satisfiable: true, unmet: [] }));
  expect(runContentChecks(content).filter(finding => finding.ids.includes('CHK-009-17'))).toEqual([]);
  expect(wantSatisfiable(content, 'dog', 4).maxStars).toBeGreaterThanOrEqual(24);
  expect(wantSatisfiable(content, 'owl', 4).maxStars).toBeGreaterThanOrEqual(28);
});

it('CHK-009-17 owned copies: opening pet = starter (+ rising phase 1 from want 1) + own earlier Hearts; arriving pet = starter + its project phases', () => {
  const content = realContent();
  const starter = Object.fromEntries(content.charms.starterSet.map(entry => [entry.typeId, entry.count]));
  expect(ownedAtActivation(content, 'dog', 0)).toEqual(starter);
  expect(ownedAtActivation(content, 'dog', 1)).toEqual({ ...starter, fern: 1, 'perch-branch': 1, rug: 1, cushion: 1 });
  const owl = ownedAtActivation(content, 'owl', 0);
  expect(Object.values(owl).reduce((sum, count) => sum + count, 0)).toBe(6 + 10);
  expect(owl).not.toHaveProperty('rug');
  expect(Object.values(ownedAtActivation(content, 'owl', 4)).reduce((sum, count) => sum + count, 0)).toBe(6 + 10 + 4);
  expect(Object.values(ownedAtActivation(content, 'dog', 4)).reduce((sum, count) => sum + count, 0)).toBe(6 + 2 + 4);
});

it('CHK-009-17 catches a Stars floor one copy each cannot reach (the bad fixture) and names the unmet condition', () => {
  const files = JSON.parse(readFileSync('tests/fixtures/bad/chk-009-17.json', 'utf8')) as ContentFiles;
  const findings = runContentChecks(loadContent(manifest, files), manifest).filter(finding => finding.level === 'error');
  expect(findings.map(finding => finding.ids[0])).toEqual(['CHK-009-17']);
  expect(findings[0].details).toMatchObject({ petId: 'dog', wantIndex: 2, unmet: ['stars >= 44'] });
  expect(runContentChecks(validContent(), manifest).filter(finding => finding.ids.includes('CHK-009-17'))).toEqual([]);
});

it('CHK-009-17 adjacency and copies: a want needing the same single-copy type in two adjacent slots is unsatisfiable until a second copy is owned', () => {
  const content = validContent();
  content.pets.dog.wants[0].conditions = [{ kind: 'tag', tag: 'light' }, { kind: 'tag', tag: 'seat' }, { kind: 'adjacent', tagA: 'light', tagB: 'light' }];
  content.charms.types = content.charms.types.filter(type => !type.tags.includes('light') || type.id === 'lamp');
  expect(wantSatisfiable(content, 'dog', 0).satisfiable).toBe(false);
  content.charms.starterSet = content.charms.starterSet.map(entry => entry.typeId === 'lamp' ? { ...entry, count: 2 } : entry);
  expect(wantSatisfiable(content, 'dog', 0).satisfiable).toBe(true);
});

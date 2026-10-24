// @vitest-environment jsdom
import './setup';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import { AssetManifest } from '../../src/content/schema/assets';
import { parseSave } from '../../src/app/persistence';
import { createWantPanel } from '../../src/ui/panels/wantPanel';
import { panelPreview } from '../../tools/coverage';
import { generateFixture, readSteps } from '../../tools/make-fixture';
import { readContentFiles } from '../../tools/content/io';
import { contextFor } from './sceneHarness';

afterEach(() => { document.body.replaceChildren(); });

const EV = '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence/WORK-021-1';
const SAVE = `${EV}/dog-room-intro-done.real.json`;

describe('VERIFY-TOOL-003 parity (WORK-021-1)', () => {
  it('VERIFY-TOOL-003 partial: --panel text equals the want panel text (jsdom, real content)', async () => {
    // Arrange: real content as TOOL-003 loads it (no manifest, WORK-003-6 fork 2); the real manifest only for the panel's asset lookups.
    const content = loadContent(undefined, await readContentFiles('src/content'));
    const manifest = AssetManifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
    // The real-content dog-room-intro-done save (WORK-003-5 fix 1 rule): generated here by TOOL-008's own function, and byte-equal to
    // `npm run fixture -- --scenario dog-room-intro-done --out <EV>/dog-room-intro-done.real.json` when that evidence file exists.
    const save = generateFixture(content, readSteps('tests/fixtures/steps/dog-room-intro-done.json'));
    if (existsSync(SAVE)) expect(save).toBe(readFileSync(SAVE, 'utf8'));
    const loaded = parseSave(content, save);
    if (!('state' in loaded)) throw new Error(`real-content save discarded: ${loaded.discarded}`);
    const state = loaded.state;
    // tools §2.4 direct edit: want 2 (bright-corner) forced active, as panelPreview's synthetic state does.
    state.pets.dog.fulfilledWantIds = ['soft-nap']; state.pets.dog.hearts = 1;
    const context = contextFor(content, state); context.manifest = manifest;
    const host = document.createElement('div'); document.body.append(host);

    // Act
    createWantPanel(host, context).render();
    const preview = panelPreview(content, { kind: 'panel', petId: 'dog', wantId: 'bright-corner', owned: 'starter' });
    const panel = host.querySelector<HTMLElement>('.tpp-wantPanel')!;
    const pills = [...panel.querySelectorAll('.tpp-tag')].map(p => p.textContent!.trim());
    const notes = [...panel.querySelectorAll('.tpp-want-note')].map(n => n.textContent!.trim());
    const reward = panel.querySelector('.tpp-want-reward')?.textContent?.trim() ?? '';
    const rows = preview.lines.slice(2, 2 + preview.data.conditions.length).map(l => l.trim());
    const rewardLine = preview.lines[2 + preview.data.conditions.length].trim();
    if (existsSync(EV)) writeFileSync(`${EV}/parity.json`, `${JSON.stringify({ save: SAVE, cliRows: rows, cliReward: rewardLine, panelPills: pills, panelNotes: notes, panelReward: reward }, null, 2)}\n`);

    // Assert: the VERIFY-TOOL-003 clause — plant unmet with "arrives with the next home phase" in both, light listed in both.
    expect(rows).toContain('☐ Plant — arrives with the next home phase');
    expect(pills).toContain('☐ Plant');
    expect(notes).toEqual(['arrives with the next home phase']);
    // Row by row: the box and tag name of every tag row match; the availability note text matches the CLI row suffix.
    for (const [i, view] of preview.data.conditions.entries()) {
      if (view.kind !== 'tag') continue;
      expect(rows[i].startsWith(`${pills[i]} `)).toBe(true);
      if (view.availability && view.availability !== 'owned') expect(rows[i]).toBe(`${pills[i]} — ${notes[0]}`);
    }
    expect(reward).toBe(rewardLine);
  });
});

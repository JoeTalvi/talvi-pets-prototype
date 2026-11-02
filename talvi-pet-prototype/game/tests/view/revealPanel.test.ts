// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Content } from '../../src/content/types';
import type { GameState } from '../../src/sim/state';
import { parseSaveValue } from '../../src/sim/state.schema';
import type { Action } from '../../src/sim/actions';
import { mountOverlay } from '../../src/ui/overlay';
import { files, manifest, patchFiles } from '../content/helpers';
import { fixtureText } from '../app/helpers';
import { owing } from '../sim/helpers';
import { contextFor } from './sceneHarness';
import { click, linesOf, REAL_STRINGS } from './designHarness';

afterEach(() => { document.body.replaceChildren(); });

/** FX-CONTENT-MIN with the real strings and the real content's reveal ids (pet-house: pets/owl-portrait, pets/owl-silhouette). */
const portrait = manifest.entries.find(e => e.id === 'pets/owl-portrait')!;
const owlManifest = { ...manifest, entries: [...manifest.entries, { ...portrait, id: 'pets/owl-silhouette', url: 'synthetic/pets/owl-silhouette.png' }] };
const content: Content = loadContent(owlManifest, patchFiles(files(), [...REAL_STRINGS,
  { file: 'strings.json', path: '/tpp.hud.reveal', value: 'Who is moving in?' },
  { file: 'projects.json', path: '/projects/1/descriptorImage', value: 'pets/owl-portrait' },
  { file: 'projects.json', path: '/projects/1/silhouetteImage', value: 'pets/owl-silhouette' }]));
const H = '(HEADLESS jsdom: hidden, classes, text, data-asset-id and log records; no layout — geometry in work-023-1.mjs) — ';
const fixture = (name: string) => (parseSaveValue(content, JSON.parse(fixtureText(name))) as { state: GameState }).state;
const owl = content.pets.owl;
const leaks = (html: string) => [html.includes('clues/descriptor'), html.includes('clues/silhouette'), html.includes('pets/owl'),
  new RegExp(`\\b${owl.name}\\b`, 'i').test(html), /\bowl\b/i.test(html), /guess/i.test(html), /<input|<textarea/i.test(html)];
const none = [false, false, false, false, false, false, false];

function setup(state: GameState) {
  const context = contextFor(content, state);
  const host = document.createElement('div'); document.body.append(host);
  const panels = mountOverlay(host, context)!;
  const panel = host.querySelector<HTMLElement>('.tpp-revealPanel')!;
  const link = host.querySelector<HTMLButtonElement>('.tpp-reveal-link')!;
  const rows = () => [...panel.querySelectorAll<HTMLElement>('.tpp-reveal-info .tpp-clue')];
  const dispatch = (...actions: Action[]) => { for (const a of actions) context.store.dispatch(a); };
  const records = () => linesOf(context, 'ui.revealPanel');
  return { context, host, panels, panel, link, rows, dispatch, records };
}
const imageIds = (panel: HTMLElement) => [...panel.querySelectorAll<HTMLElement>('.tpp-reveal-image [data-asset-id]')].map(e => e.dataset.assetId);
const noEntry = (panel: HTMLElement) => [panel.querySelectorAll('input, textarea, [placeholder], [contenteditable]').length, /guess/i.test(panel.outerHTML)];

describe('mec-003 §3.3 reveal panel', () => {
  const t = `mec-003 §3.3 reveal panel ${H}`;
  it(`${t}opens from .tpp-reveal-link with exactly one ui.revealPanel {open:true} (ack-phase-4)`, () => {
    const s = setup(fixture('ack-phase-4.json'));
    expect([s.panel.hidden, s.link.hidden, s.link.disabled]).toEqual([true, false, false]);
    click(s.link);
    expect(s.panel.hidden).toBe(false);
    expect(s.records()).toEqual([{ type: 'ui.revealPanel', open: true }]);
    expect(s.panels.revealPanel.isOpen()).toBe(true);
  });

  it(`${t}VERIFY-MEC-003-010 phases 1 → 4 acknowledged: title, mystery shape, four unlocked rows (icon, "Phase n", quoted line), one locked "Arrives with phase 5", nothing of the Owl`, () => {
    const s = setup(fixture('ack-phase-4.json'));
    click(s.link);
    expect(s.panel.querySelector('.tpp-reveal-label')!.textContent).toBe('A new neighbour');
    expect(imageIds(s.panel)).toEqual(['ui/mystery-shape']);
    expect(s.panel.querySelector('.tpp-reveal-name')).toBeNull();
    expect(s.rows().map(r => [r.classList.contains('locked'), r.querySelector('.tpp-clue-phase')!.textContent])).toEqual([
      [false, 'Phase 1'], [false, 'Phase 2'], [false, 'Phase 3'], [false, 'Phase 4'], [true, 'Arrives with phase 5']]);
    for (const row of s.rows().slice(0, 4)) {
      expect(row.querySelector<HTMLElement>('.ns-tile [data-asset-id]')!.dataset.assetId).toBe('clues/fixture');
      expect(row.querySelector('.tpp-clue-line')!.textContent).toBe('“A green place to rest.”');
    }
    expect(s.rows()[4].querySelector('.ns-tile')!.textContent).toBe('?');
    expect(leaks(s.panel.outerHTML)).toEqual(none);
  });

  it(`${t}VERIFY-MEC-003-011 complete (ack-phase-5): the full image pets/owl-portrait and the name "Owl"; five unlocked rows`, () => {
    const s = setup(fixture('ack-phase-5.json'));
    click(s.link);
    expect(imageIds(s.panel)).toEqual(['pets/owl-portrait']);
    expect(s.panel.querySelector('.tpp-reveal-name')!.textContent).toBe('Owl');
    expect(s.rows().map(r => r.classList.contains('locked'))).toEqual([false, false, false, false, false]);
  });

  it(`${t}VERIFY-MEC-003-004 no guess entry: zero input/textarea/placeholder or "guess" text in both panel states; close and clues remain`, () => {
    for (const name of ['ack-phase-4.json', 'ack-phase-5.json']) {
      const s = setup(fixture(name));
      click(s.link);
      expect(noEntry(s.panel)).toEqual([0, false]);
      expect([s.rows().length, s.panel.querySelectorAll('.tpp-close').length]).toEqual([5, 1]);
      document.body.replaceChildren();
    }
  });

});

describe('mec-003 §3.3 reveal panel close and hide', () => {
  const t = `mec-003 §3.3 reveal panel ${H}`;
  it(`${t}close × and backdrop record {open:false} once each and hide`, () => {
    const s = setup(fixture('ack-phase-4.json'));
    click(s.link);
    click(s.panel.querySelector('.tpp-close'));
    expect(s.panel.hidden).toBe(true);
    click(s.link);
    click(s.panel.querySelector('.tpp-dismiss-backdrop'));
    expect(s.panel.hidden).toBe(true);
    expect(s.records().map(r => r.open)).toEqual([true, false, true, false]);
  });

  it(`${t}hidden on scene.changed to an interior (the door walk) with no record`, () => {
    const state = owing(content, 1, 1260);
    state.avatar = { ...state.avatar, x: 480, y: 900, facing: 'up', immunityMs: 0 };
    const s = setup(state);
    click(s.link);
    expect(s.panel.hidden).toBe(false);
    s.dispatch({ type: 'tick', dtMs: 16, move: { x: 0, y: -1 } });
    expect(s.context.store.getState().scene.kind).not.toBe('street');
    expect([s.panel.hidden, s.records().length]).toEqual([true, 1]);
  });

  it(`${t}hidden on state.reset and celebration.started with no record; open() ignored while state.celebration !== null`, () => {
    const s = setup(owing(content, 1, 1260));
    click(s.link);
    s.dispatch({ type: 'acknowledgeProject', projectId: 'pet-house' });
    expect(s.context.store.getState().celebration).not.toBeNull();
    expect(s.panel.hidden).toBe(true);
    s.panels.revealPanel.open();
    expect([s.panel.hidden, s.records().length]).toEqual([true, 1]);
    const r = setup(fixture('ack-phase-4.json'));
    click(r.link);
    r.dispatch({ type: 'reset' });
    expect([r.panel.hidden, r.records().length]).toEqual([true, 1]);
  });

  it(`${t}stays available at goal but unacknowledged (M2 play session, review MILESTONE-006-1 M-1: no icon flicker before project.completed)`, () => {
    const s = setup(owing(content, 1, 1260));
    s.dispatch({ type: 'debugCompleteProject', projectId: 'pet-house' });
    expect(s.link.hidden).toBe(false);
  });
});

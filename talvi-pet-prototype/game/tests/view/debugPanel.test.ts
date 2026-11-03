// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { loadContent } from '../../src/content/load';
import type { GameState } from '../../src/sim/state';
import { mountOverlay, type Panels } from '../../src/ui/overlay';
import { ERROR_MS, infoText, sampleFps } from '../../src/ui/panels/debugPanel';
import { InteriorScene } from '../../src/view/scenes/InteriorScene';
import { StreetScene } from '../../src/view/scenes/StreetScene';
import type { WorldScene } from '../../src/view/scenes/WorldScene';
import { GRID_DEPTH } from '../../src/view/alignmentGrid';
import type { ViewContext } from '../../src/view/context';
import { STORAGE_KEYS } from '../../src/app/persistence';
import { createLog, type Exporter, type ExportMethod } from '../../src/app/log';
import { parseSave } from '../../src/app/persistence';
import { files, manifest, patchFiles } from '../content/helpers';
import { designIn, owing } from '../sim/helpers';
import { createMemoryStorage } from '../app/memoryStorage';
import { fixtureText, headerFor } from '../app/helpers';
import { bootScene, contextFor, destroyScene } from './sceneHarness';
import { click, linesOf, REAL_STRINGS } from './designHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.useRealTimers(); vi.restoreAllMocks(); });

const content = loadContent(manifest, patchFiles(files(), REAL_STRINGS));
type Setup = { context: ViewContext; scene: WorldScene; root: HTMLElement; panels: Panels; storage: Storage; reload: ReturnType<typeof vi.fn> };

/** FX-CONTENT-MIN with the overlay mounted and the given scene booted; storage, reload and headerFor injected. */
async function setup(state: GameState = designIn(content), scene: 'interior' | 'street' = 'interior',
  exporters?: Partial<Record<ExportMethod, Exporter>>): Promise<Setup> {
  const storage = createMemoryStorage();
  const context = contextFor(content, state, storage);
  if (exporters) { // row 13: the controller's exporters injected (createLog's own seam), attached to the same store
    const log = createLog({ storage, ringLines: content.tuning.logRingLines, exporters });
    log.start(headerFor(state)); log.attach(context.store);
    Object.assign(context, { log });
  }
  const reload = vi.fn();
  Object.assign(context, { storage, reload, headerFor });
  context.persistence.attach(context.store);
  const host = document.createElement('div'); document.body.append(host);
  const panels = mountOverlay(host, context)!;
  const booted: WorldScene = scene === 'interior'
    ? await bootScene(InteriorScene, context, { roomId: 'dog-room' }, ['charms/lamp', 'rooms/fixture'])
    : await bootScene(StreetScene, context);
  booted.cameras.main.emit('camerafadeincomplete');
  return { context, scene: booted, root: host, panels, storage, reload };
}
const panelOf = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-panel=debugPanel]')!;
const rowOf = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll<HTMLElement>('.tpp-debug-row')].find(r => r.querySelector('label')!.textContent === label)!;
const buttons = (root: HTMLElement, label: string) => [...rowOf(root, label).querySelectorAll<HTMLButtonElement>('button:not([role=switch])')];
const switchIn = (root: HTMLElement, label: string) => rowOf(root, label).querySelector<HTMLButtonElement>('[role=switch]')!;
const setInput = (root: HTMLElement, label: string, value: string) => { rowOf(root, label).querySelector<HTMLInputElement>('input')!.value = value; };
const backquote = () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Backquote' }));
const errorIn = (root: HTMLElement, label: string) => rowOf(root, label).querySelector('.tpp-debug-error')?.textContent;
const open = (s: Setup) => { s.panels.debugPanel.open(); };

describe('VERIFY-MEC-010-012 hidden entry and hotkey', () => {
  it('VERIFY-MEC-010-012 partial: desktop half — entry tap opens, Backquote closes, ui.debugPanel {open} logged, frozen + joystick hidden while the sim ticks', async () => {
    const s = await setup();
    expect(panelOf(s.root).hidden).toBe(true);
    click(s.root.querySelector('.tpp-debug-entry'));
    expect(panelOf(s.root).hidden).toBe(false);
    expect(panelOf(s.root).querySelector('h2')!.textContent).toBe('Debug (hidden entry)');
    expect(s.context.debugOpen).toBe(true);
    const setVisible = vi.spyOn(s.scene.joystick, 'setVisible');
    const before = s.context.store.getState().feed.sinceLastEventMs;
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    s.scene.update(0, 50);
    expect(setVisible).toHaveBeenLastCalledWith(false);
    expect(dispatch).toHaveBeenCalledWith({ type: 'tick', dtMs: 50, move: { x: 0, y: 0 } });
    expect(s.context.store.getState().feed.sinceLastEventMs).toBeGreaterThan(before);
    backquote();
    expect(panelOf(s.root).hidden).toBe(true);
    expect(s.context.debugOpen).toBe(false);
    expect(linesOf(s.context, 'ui.debugPanel')).toEqual([{ type: 'ui.debugPanel', open: true }, { type: 'ui.debugPanel', open: false }]);
  });

  it('mec-010 §2 — × and the backdrop close; Backquote with a panel input focused does nothing', async () => {
    const s = await setup();
    backquote(); expect(panelOf(s.root).hidden).toBe(false);
    click(panelOf(s.root).querySelector('.tpp-close')); expect(panelOf(s.root).hidden).toBe(true);
    backquote(); click(panelOf(s.root).querySelector('.tpp-dismiss-backdrop')); expect(panelOf(s.root).hidden).toBe(true);
    backquote();
    const input = rowOf(s.root, 'Feed seed').querySelector('input')!;
    input.focus();
    backquote();
    expect(panelOf(s.root).hidden).toBe(false);
  });
});

describe('mec-010 §3 rows 1–10b dispatch one action each', () => {
  it('mec-010 §3 row 1 — debugSimulatePurchase and a roundup.fired', async () => {
    const s = await setup(owing(content, 1, 300), 'street'); open(s);
    const events: string[] = []; s.context.store.subscribeAll(e => events.push(e.type));
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    click(buttons(s.root, 'Simulate a purchase')[0]);
    expect(dispatch.mock.calls).toEqual([[{ type: 'debugSimulatePurchase' }]]);
    expect(events).toContain('roundup.fired');
  });

  it('mec-010 §3 row 2 — custom 5000 + Apply, Frozen, Playtest; custom 100 rejected with the reason shown for 3 s', async () => {
    const s = await setup(); open(s);
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    const [playtest, frozen, apply] = buttons(s.root, 'Event interval');
    const input = rowOf(s.root, 'Event interval').querySelector('input')!;
    expect([input.min, input.step]).toEqual(['250', '250']);
    setInput(s.root, 'Event interval', '5000'); click(apply);
    click(frozen); click(playtest);
    expect(dispatch.mock.calls.map(c => c[0])).toEqual([
      { type: 'debugSetEventInterval', ms: 5000 }, { type: 'debugSetEventInterval', ms: null }, { type: 'debugSetEventInterval', ms: 20000 }]);
    expect(playtest.getAttribute('aria-pressed')).toBe('true');
    vi.useFakeTimers();
    setInput(s.root, 'Event interval', '100'); click(apply);
    expect(errorIn(s.root, 'Event interval')).toBe('Rejected: invalidInterval');
    vi.advanceTimersByTime(ERROR_MS);
    expect(errorIn(s.root, 'Event interval')).toBeUndefined();
  });

  it('mec-010 §3 rows 3–7 — seed, set current (caption, adjusted text), jump, complete, unlock all', async () => {
    const s = await setup(owing(content, 1, 300), 'street'); open(s);
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    setInput(s.root, 'Feed seed', '42'); click(buttons(s.root, 'Feed seed')[0]);
    expect(rowOf(s.root, 'Set current progress').querySelector('small')!.textContent).toBe('Pet House (acknowledged untouched)');
    setInput(s.root, 'Set current progress', '100'); click(buttons(s.root, 'Set current progress')[0]);
    expect(errorIn(s.root, 'Set current progress')).toMatch(/^Adjusted cents: requested 100, applied \d+$/);
    click(buttons(s.root, 'Jump to next phase')[0]);
    click(buttons(s.root, 'Complete project')[0]);
    click(buttons(s.root, 'Unlock all charm types')[0]);
    expect(dispatch.mock.calls.map(c => c[0])).toEqual([
      { type: 'debugSetSeed', seed: 42 }, { type: 'debugSetCurrent', projectId: 'pet-house', cents: 100 },
      { type: 'debugJumpPhase', projectId: 'pet-house' }, { type: 'debugCompleteProject', projectId: 'pet-house' }, { type: 'debugUnlockAllTypes' }]);
    expect(s.context.store.getState().session.seed).toBe(42);
  });

});

describe('mec-010 §3 rows 8–10b switches and the no-project state', () => {
  it('mec-010 §3 rows 8, 9, 10, 10b — switches follow session.*; 9 restores the last non-null interval', async () => {
    const s = await setup(); open(s);
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    const stars = switchIn(s.root, 'Stars display'), freeze = switchIn(s.root, 'Freeze donations'), mute = switchIn(s.root, 'Mute SFX');
    expect([stars, freeze, mute].map(b => b.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    setInput(s.root, 'Event interval', '5000'); click(buttons(s.root, 'Event interval')[2]);
    click(stars); click(freeze); click(mute);
    expect([stars, freeze, mute].map(b => b.getAttribute('aria-checked'))).toEqual(['false', 'true', 'true']);
    click(freeze);
    click(buttons(s.root, 'Feed presentation')[1]);
    expect(dispatch.mock.calls.map(c => c[0]).slice(1)).toEqual([
      { type: 'debugSetStarsVisible', on: false }, { type: 'debugSetEventInterval', ms: null }, { type: 'debugSetMuted', on: true },
      { type: 'debugSetEventInterval', ms: 5000 }, { type: 'debugSetFeedPresentation', mode: 'trickle' }]);
    expect(buttons(s.root, 'Feed presentation')[1].getAttribute('aria-pressed')).toBe('true');
  });

  it('mec-010 §3 rows 1, 4–6 — disabled with the "All projects complete" note once every project is complete', async () => {
    const s = await setup(owing(content, 1, 300), 'street'); open(s);
    const note = panelOf(s.root).querySelector<HTMLElement>('.tpp-debug-note')!;
    expect(note.hidden).toBe(true);
    for (let i = 0; i < 5 && !buttons(s.root, 'Complete project')[0].disabled; i++) click(buttons(s.root, 'Complete project')[0]);
    for (const label of ['Simulate a purchase', 'Set current progress', 'Jump to next phase', 'Complete project'])
      expect(buttons(s.root, label).every(b => b.disabled)).toBe(true);
    expect([note.hidden, note.textContent]).toEqual([false, 'All projects complete']);
    expect(panelOf(s.root).querySelector('pre')!.textContent).toContain('all projects complete');
  });
});

describe('VERIFY-MEC-010-013 row 12 reset', () => {
  it('VERIFY-MEC-010-013 partial: header half — Yes + start frozen + seed 42 → reset, frozen, fresh session.started (cadence null), panel closed', async () => {
    const s = await setup(); open(s);
    s.context.store.dispatch({ type: 'debugSetTesterLabel', text: 'desk' });
    const slot = () => rowOf(s.root, 'Reset save');
    click(slot().querySelector('[data-action=reset]'));
    click(slot().querySelector('[data-action=reset-no]'));
    expect(slot().querySelector('[data-action=reset-yes]')).toBeNull();
    click(slot().querySelector('[data-action=reset]'));
    slot().querySelector<HTMLInputElement>('[data-field=frozen]')!.checked = true;
    slot().querySelector<HTMLInputElement>('[data-field=seed]')!.value = '42';
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    const resets: string[] = []; s.context.store.subscribe('state.reset', () => resets.push('reset'));
    click(slot().querySelector('[data-action=reset-yes]'));
    expect(dispatch.mock.calls.map(c => c[0])).toEqual([{ type: 'reset', seed: 42 }, { type: 'debugSetEventInterval', ms: null }]);
    expect(resets).toEqual(['reset']);
    const lines = s.context.log.lines();
    expect(lines[0]).toMatchObject({ type: 'session.started', seed: 42, cadence: null, testerLabel: 'desk' });
    expect(lines.filter(l => l.type === 'session.started')).toHaveLength(1);
    expect(s.storage.getItem(STORAGE_KEYS.log)!.split('\n')).toHaveLength(1);
    expect(panelOf(s.root).hidden).toBe(true);
    s.context.persistence.flush();
    expect(JSON.parse(s.storage.getItem(STORAGE_KEYS.save)!).state.session).toMatchObject({ seed: 42, eventIntervalMs: null });
  });

  it('VERIFY-MEC-010-013 partial: header half — row 11 label typed through the panel, then row 12 Yes + Start frozen → session.started carries it', async () => {
    const s = await setup(); open(s);
    const label = rowOf(s.root, 'Tester label').querySelector('input')!;
    label.value = 'iphone-1'; label.dispatchEvent(new Event('change'));
    const slot = () => rowOf(s.root, 'Reset save');
    click(slot().querySelector('[data-action=reset]'));
    slot().querySelector<HTMLInputElement>('[data-field=frozen]')!.checked = true;
    click(slot().querySelector('[data-action=reset-yes]'));
    expect(s.context.log.lines()[0]).toMatchObject({ type: 'session.started', cadence: null, testerLabel: 'iphone-1' });
    expect(s.context.store.getState().session.testerLabel).toBe('iphone-1');
  });
});

describe('mec-010 §3 row 11 Tester label', () => {
  it('VERIFY-MEC-010-007 panel: row 11 change → debugSetTesterLabel (raw text; D3 trims), debug.applied logged, input reflects state on reopen', async () => {
    const s = await setup(); open(s);
    const input = () => rowOf(s.root, 'Tester label').querySelector('input')!;
    expect(input().disabled).toBe(false);
    expect(input().value).toBe(''); // the template's mock "desktop-review" is overwritten from state.session.testerLabel
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    input().value = '  desk A  '; input().dispatchEvent(new Event('change'));
    expect(dispatch.mock.calls.map(c => c[0])).toEqual([{ type: 'debugSetTesterLabel', text: '  desk A  ' }]);
    expect(s.context.store.getState().session.testerLabel).toBe('desk A');
    expect(input().value).toBe('desk A');
    expect(s.context.log.lines().at(-1)).toMatchObject({ type: 'debug.applied', action: { type: 'debugSetTesterLabel', text: '  desk A  ' } });
    s.panels.debugPanel.close(); input().value = 'stale'; open(s);
    expect(input().value).toBe('desk A');
  });

  it('VERIFY-MEC-010-007 panel: a label over 40 characters (maxlength bypassed) is rejected with the row error; state unchanged', async () => {
    const s = await setup(); open(s);
    const input = rowOf(s.root, 'Tester label').querySelector('input')!;
    input.value = 'x'.repeat(41); input.dispatchEvent(new Event('change'));
    expect(errorIn(s.root, 'Tester label')).toMatch(/^Rejected: /);
    expect([s.context.store.getState().session.testerLabel, input.value]).toEqual(['', '']);
  });
});

describe('mec-010 §3 row 13 Export log', () => {
  const stubs = () => {
    const calls: [ExportMethod, string, string][] = [];
    const make = (method: ExportMethod): Exporter => async (text, filename) => { calls.push([method, text, filename]); };
    return { calls, exporters: { download: make('download'), copy: make('copy'), share: make('share') } };
  };
  const flush = () => new Promise(resolve => setTimeout(resolve, 0));

  it('VERIFY-MEC-010-011 partial: jsdom — Download · Copy · Share each call their exporter, then log.exported {method, lines}', async () => {
    const { calls, exporters } = stubs();
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { canShare: () => true }));
    const s = await setup(designIn(content), 'interior', exporters); open(s);
    const [download, copy, share] = buttons(s.root, 'Export log');
    expect([download, copy, share].map(b => [b.textContent, b.disabled, b.hidden])).toEqual([
      ['Download', false, false], ['Copy', false, false], ['Share', false, false]]);
    for (const [i, method] of (['download', 'copy', 'share'] as const).entries()) {
      const before = s.context.log.lines().length;
      click([download, copy, share][i]); await flush();
      expect(calls.at(-1)![0]).toBe(method);
      expect(calls.at(-1)![1].split('\n')).toHaveLength(before);
      expect(calls.at(-1)![2]).toMatch(/^tpp-log-\d{4}-\d{2}-\d{2}T\d{4}\.jsonl$/);
      expect(s.context.log.lines().at(-1)).toMatchObject({ type: 'log.exported', method, lines: before });
    }
    vi.unstubAllGlobals();
  });

  it('VERIFY-MEC-010-011 partial: jsdom — Share hidden when navigator.canShare is absent, shown on the next open once it returns true for files', async () => {
    const s = await setup(designIn(content), 'interior', stubs().exporters); open(s);
    const share = () => buttons(s.root, 'Export log')[2];
    expect('canShare' in navigator).toBe(false);
    expect(share().hidden).toBe(true);
    s.panels.debugPanel.close();
    const canShare = vi.fn((data: ShareData) => (data.files?.[0]?.name ?? '').endsWith('.jsonl'));
    vi.stubGlobal('navigator', Object.assign(Object.create(navigator), { canShare }));
    open(s);
    expect(share().hidden).toBe(false);
    expect(canShare).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('VERIFY-MEC-010-011 partial: jsdom — a failing exporter shows the row error and records app.error, no log.exported, no unhandled rejection', async () => {
    const failing: Exporter = async () => { throw new Error('clipboard denied'); };
    const s = await setup(designIn(content), 'interior', { copy: failing }); open(s);
    click(buttons(s.root, 'Export log')[1]); await flush();
    expect(errorIn(s.root, 'Export log')).toBe('Export failed: clipboard denied');
    const last = s.context.log.lines().at(-1)!;
    expect(last).toMatchObject({ type: 'app.error' });
    expect(String(last.message)).toContain('log export (copy) failed');
    expect(s.context.log.lines().some(l => l.type === 'log.exported')).toBe(false);
  });
});

describe('mec-010 §3 row 14 info', () => {
  it('mec-010 §3 row 14 info — fields, live update after placeCharm while open; sample("idle") writes perf.sample', async () => {
    const s = await setup(); open(s);
    const pre = () => panelOf(s.root).querySelector('pre')!.textContent!;
    for (const part of ['scene interior dog-room', 'mode design', 'Pet House 0 / 1500 · acknowledged 0', 'Hearts dog 0', 'Stars 0 / 48',
      'eventIntervalMs 20000', 'feedPresentation events', 'seed 1', 'sound.locked n/a', 'fps n/a', 'build tpp-test'])
      expect(pre()).toContain(part);
    expect(pre()).toMatch(/log lines \d+ \/ 5000/);
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(pre()).toContain('Stars 4 / 48');
    s.context.fps = () => 59.94;
    s.panels.debugPanel.refresh();
    expect(pre()).toContain('fps 59.9');
    const reads = [60, 58, 61, 60, 60, 59, 60, 60, 57, 60]; let i = 0;
    const sample = await sampleFps(() => reads[i++], s.context.log.record, 'idle', async () => {});
    expect(sample).toEqual({ state: 'idle', windowMs: 10000, fpsMean: 59.5, fpsMin: 57 });
    expect(linesOf(s.context, 'perf.sample')).toEqual([{ type: 'perf.sample', state: 'idle', windowMs: 10000, fpsMean: 59.5, fpsMin: 57 }]);
  });

  it('mec-010 §3 row 14 info — street shows "Stars —"; the sample button calls context.sample("idle")', async () => {
    const s = await setup(owing(content, 1, 300), 'street');
    const sample = vi.fn(async () => ({ state: 'idle' as const, windowMs: 10000, fpsMean: 60, fpsMin: 60 }));
    s.context.sample = sample; open(s);
    expect(infoText(s.context, s.context.store.getState())).toContain('Stars —');
    click(panelOf(s.root).querySelector('[data-action=sample-fps]'));
    expect(sample).toHaveBeenCalledWith('idle');
  });
});

describe('tools TOOL-006 row 15 switch', () => {
  it('tools TOOL-006 row 15 switch — interior: records ui.roomEditor {open:true} once, sets roomEditorRequested, the editor opens (side panel visible; WORK-015-2 replaces "opens nothing")', async () => {
    const s = await setup(); open(s);
    click(switchIn(s.root, 'Room editor'));
    expect(s.context.roomEditorRequested).toBe(true);
    expect(switchIn(s.root, 'Room editor').getAttribute('aria-checked')).toBe('true');
    s.scene.update(0, 16);
    expect(s.context.roomEditor).toBeDefined();
    expect(s.root.querySelector<HTMLElement>('[data-panel=roomEditor]')!.hidden).toBe(false);
    expect(linesOf(s.context, 'ui.roomEditor')).toEqual([{ type: 'ui.roomEditor', open: true }]);
  });

  it('tools TOOL-006 row 15 caption — street: disabled with the literal caption "interiors only"; interior: caption hidden', async () => {
    const s = await setup(owing(content, 1, 300), 'street'); open(s);
    expect(switchIn(s.root, 'Room editor').disabled).toBe(true);
    const caption = rowOf(s.root, 'Room editor').querySelector('small')!;
    expect([caption.textContent, caption.hidden]).toEqual(['interiors only', false]);
    const t = await setup(); open(t);
    expect(rowOf(t.root, 'Room editor').querySelector('small')!.hidden).toBe(true);
  });
});

describe('VERIFY-TOOL-006 row 17 fixture', () => {
  const load = (s: Setup, text: string) => {
    rowOf(s.root, 'Fixture').querySelector('textarea')!.value = text;
    click(buttons(s.root, 'Fixture')[0]);
  };
  it.each([['parse-error', 'parse'], ['schema-0', 'schemaVersion'], ['unknown-id', 'unknownContentId'], ['invariant', 'invariantViolation']])(
    'VERIFY-TOOL-006 partial: fixture half — save-bad/%s refused with reason %s, tpp.save unchanged, no save.loaded', async (name, reason) => {
      const s = await setup(); open(s);
      s.context.persistence.flush();
      s.storage.setItem(STORAGE_KEYS.save, 'sentinel');
      load(s, fixtureText(`save-bad/${name}.json`));
      expect(errorIn(s.root, 'Fixture')).toBe(`Invalid fixture: ${reason}. No state was changed.`);
      expect(s.storage.getItem(STORAGE_KEYS.save)).toBe('sentinel');
      expect(linesOf(s.context, 'save.loaded')).toEqual([]);
      expect(s.reload).not.toHaveBeenCalled();
    });

  it('VERIFY-TOOL-006 partial: fixture half — a valid save writes tpp.save, logs save.loaded {fixture, bytes} and reloads once', async () => {
    const s = await setup(); open(s);
    const text = fixtureText('save-v1.json');
    load(s, text);
    const stored = s.storage.getItem(STORAGE_KEYS.save)!;
    const parsed = JSON.parse(stored);
    expect(parsed.schemaVersion).toBe(2);
    expect(typeof parsed.savedAt).toBe('string');
    expect(parsed.state).toEqual((parseSave(content, text) as { state: GameState }).state);
    expect(linesOf(s.context, 'save.loaded')).toEqual([{ type: 'save.loaded', source: 'fixture', bytes: new TextEncoder().encode(stored).length }]);
    expect(s.reload).toHaveBeenCalledTimes(1);
    s.context.store.dispatch({ type: 'tick', dtMs: 50, move: { x: 0, y: 0 } });
    window.dispatchEvent(new Event('pagehide'));
    expect(s.storage.getItem(STORAGE_KEYS.save)).toBe(stored);
  });

  it('tools TOOL-006 row 17 copy — flushes then copies the current tpp.save; a throwing clipboard records app.error and shows the text', async () => {
    const s = await setup(); open(s);
    const writeText = vi.fn(async () => {});
    s.context.clipboard = { writeText };
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    click(buttons(s.root, 'Fixture')[1]);
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(s.storage.getItem(STORAGE_KEYS.save));
    expect(JSON.parse(s.storage.getItem(STORAGE_KEYS.save)!).state.rooms['dog-room'].placements['floor-1']).toBe('lamp');
    s.context.clipboard = { writeText: async () => { throw new Error('denied'); } };
    click(buttons(s.root, 'Fixture')[1]);
    await new Promise(r => setTimeout(r, 0));
    expect(linesOf(s.context, 'app.error').map(l => l.message)).toEqual(['debug fixture Copy failed: denied']);
    expect(errorIn(s.root, 'Fixture')).toBe('Copy failed: denied');
  });
});

describe('verification GAP-2 alignment grid', () => {
  const gridOf = (scene: WorldScene) => scene.alignment as Phaser.GameObjects.Graphics | null;
  it('verification GAP-2 alignment grid — switch on: five overlay targets at 0/50/100 % and a scene Graphics (scrollFactor 0, depth 3000) at the five points; off removes both', async () => {
    const s = await setup(); open(s);
    click(switchIn(s.root, 'Alignment grid'));
    expect(s.context.alignmentGrid).toBe(true);
    const targets = [...s.root.querySelectorAll<HTMLElement>('#alignment-grid .alignment-target')];
    expect(targets.map(t => [t.dataset.corner, t.style.left, t.style.top])).toEqual([
      ['tl', '0%', '0%'], ['tr', '100%', '0%'], ['bl', '0%', '100%'], ['br', '100%', '100%'], ['centre', '50%', '50%']]);
    s.scene.syncAlignmentGrid();
    const grid = gridOf(s.scene)!;
    expect([grid.scrollFactorX, grid.scrollFactorY, grid.depth]).toEqual([0, 0, GRID_DEPTH]);
    expect(grid.getData('points')).toEqual([[0, 0], [1920, 0], [0, 1080], [1920, 1080], [960, 540]]);
    expect(linesOf(s.context, 'ui.debugPanel', 'ui.roomEditor', 'ui.preview')).toEqual([{ type: 'ui.debugPanel', open: true }]);
    click(switchIn(s.root, 'Alignment grid'));
    s.scene.syncAlignmentGrid();
    expect(gridOf(s.scene)).toBeNull();
    expect(s.root.querySelector<HTMLElement>('#alignment-grid')!.hidden).toBe(true);
  });

  it('verification GAP-2 alignment grid — context.alignmentGrid true at boot (the ?grid=1 path) draws the crosshairs at create', async () => {
    const storage = createMemoryStorage();
    const context = contextFor(content, designIn(content), storage);
    context.alignmentGrid = true;
    const scene = await bootScene(InteriorScene, context, { roomId: 'dog-room' }, ['charms/lamp', 'rooms/fixture']);
    expect(gridOf(scene)).not.toBeNull();
  });
});

describe('mec-010 §3 row 19 Grant copies (TEST-002 arm)', () => {
  const ROWS_1_18 = ['Simulate a purchase', 'Event interval', 'Feed seed', 'Set current progress', 'Jump to next phase', 'Complete project',
    'Unlock all charm types', 'Stars display', 'Freeze donations', 'Mute SFX', 'Feed presentation', 'Tester label', 'Reset save',
    'Export log', 'Room editor', 'Preview layers', 'Fixture', 'Alignment grid'];

  it('VERIFY-MEC-010-017 (new) — row 19 "Grant copies" follows rows 1–18 (labels and order unchanged); select in catalogue order by name, count 1..9 default 1; Grant dispatches debugGrantCopies', async () => {
    const s = await setup(); open(s);
    const labels = [...panelOf(s.root).querySelectorAll('.tpp-debug-row > label')].map(l => l.textContent);
    expect(labels).toEqual([...ROWS_1_18, 'Grant copies', 'Unlock garden', 'Fill garden', 'Fulfil active want', 'Pets outside', 'Greet now', 'Outfits']); // WORK-034-2 appends 20–22; WORK-035-1 row 23; WORK-036-1 row 24; WORK-037-2 row 25
    const select = rowOf(s.root, 'Grant copies').querySelector('select')!;
    expect([...select.options].map(o => [o.value, o.textContent])).toEqual(content.charms.types.map(t => [t.id, t.name]));
    const count = rowOf(s.root, 'Grant copies').querySelector<HTMLInputElement>('input')!;
    expect([count.type, count.min, count.max, count.value]).toEqual(['number', '1', '9', '1']);
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    select.value = 'vase'; count.value = '2';
    const before = s.context.store.getState().inventory.counts.vase ?? 0;
    click(buttons(s.root, 'Grant copies')[0]);
    expect(dispatch.mock.calls.map(c => c[0])).toEqual([{ type: 'debugGrantCopies', typeId: 'vase', count: 2 }]);
    expect(s.context.store.getState().inventory.counts.vase).toBe(before + 2);
    expect(linesOf(s.context, 'items.granted').at(-1)).toMatchObject({ typeId: 'vase', count: 2, source: 'debug' });
  });

  it('VERIFY-T2-SITE-010 panel half — rows 20–22 render after Grant copies; Fulfil dispatches debugFulfilActiveWant for the chosen pet; site rows dispatch nothing without a site', async () => {
    const s = await setup(); open(s);
    const select = rowOf(s.root, 'Fulfil active want').querySelector('select')!;
    expect([...select.options].map(o => o.value)).toEqual(Object.keys(content.pets));
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    click(buttons(s.root, 'Unlock garden')[0]); click(buttons(s.root, 'Fill garden')[0]);
    expect(dispatch).not.toHaveBeenCalled(); // content-min has no street site
    select.value = select.options[0].value;
    click(buttons(s.root, 'Fulfil active want')[0]);
    expect(dispatch.mock.calls.map(c => c[0])).toEqual([{ type: 'debugFulfilActiveWant', petId: select.options[0].value }]);
  });

  it('VERIFY-MEC-010-017 (new) — a count outside 1..9 is rejected by the sim and shown under the row', async () => {
    const s = await setup(); open(s);
    const row = rowOf(s.root, 'Grant copies');
    row.querySelector('input')!.value = '12';
    click(buttons(s.root, 'Grant copies')[0]);
    expect(errorIn(s.root, 'Grant copies')).toMatch(/^Rejected: /);
  });
});

describe('mec-010 §3 row 23 Pets outside (WORK-035-1)', () => {
  it('VERIFY-WORK-035-1-07 panel half — row 23 "Pets outside" after row 22: Roll / All out / All in dispatch debugSetPetsOutside and reflect session.petsOutside', async () => {
    const s = await setup(); open(s);
    const labels = [...panelOf(s.root).querySelectorAll('.tpp-debug-row > label')].map(l => l.textContent);
    expect(labels.indexOf('Pets outside')).toBe(labels.indexOf('Fulfil active want') + 1);
    const segment = () => buttons(s.root, 'Pets outside');
    expect(segment().map(b => b.textContent)).toEqual(['Roll', 'All out', 'All in']);
    expect(segment().map(b => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false']);
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    click(segment()[1]); click(segment()[2]); click(segment()[0]); click(segment()[1]);
    expect(dispatch.mock.calls.map(c => c[0])).toEqual(['all', 'none', 'roll', 'all'].map(mode => ({ type: 'debugSetPetsOutside', mode })));
    expect(s.context.store.getState().session.petsOutside).toBe('all');
    expect(segment().map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(linesOf(s.context, 'debug.applied').at(-1)).toMatchObject({ action: { type: 'debugSetPetsOutside', mode: 'all' } });
  });
});

describe('mec-010 §3 row 24 Greet now (WORK-036-1)', () => {
  it('VERIFY-WORK-036-1-10 panel half — row 24 "Greet now" after row 23: its one button dispatches debugGreetNow', async () => {
    const s = await setup(); open(s);
    const labels = [...panelOf(s.root).querySelectorAll('.tpp-debug-row > label')].map(l => l.textContent);
    expect(labels.indexOf('Greet now')).toBe(labels.indexOf('Pets outside') + 1);
    expect(buttons(s.root, 'Greet now').map(b => b.textContent)).toEqual(['Greet']);
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    click(buttons(s.root, 'Greet now')[0]);
    expect(dispatch.mock.calls.map(c => c[0])).toEqual([{ type: 'debugGreetNow' }]);
  });
});

describe('mec-010 §3 row 25 Outfits (WORK-037-2)', () => {
  it('WORK-037-2 row 25 "Outfits" — found by label; options are content.outfits in order; Wear dispatches debugSetOutfit and the state changes; an unknown id is rejected under the row', async () => {
    const s = await setup(); open(s);
    const select = rowOf(s.root, 'Outfits').querySelector('select')!;
    expect([...select.options].map(o => [o.value, o.textContent])).toEqual(content.outfits.map(o => [o.id, content.strings[o.nameKey]]));
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    select.value = 'default';
    click(buttons(s.root, 'Outfits')[0]);
    expect(dispatch.mock.calls.map(c => c[0])).toEqual([{ type: 'debugSetOutfit', outfitId: 'default' }]);
    expect(s.context.store.getState().avatar.outfitId).toBe('default');
    select.insertAdjacentHTML('beforeend', '<option value="tuxedo">Tuxedo</option>'); select.value = 'tuxedo';
    click(buttons(s.root, 'Outfits')[0]);
    expect(errorIn(s.root, 'Outfits')).toMatch(/^Rejected: /);
    expect(s.context.store.getState().avatar.outfitId).toBe('default');
  });
});

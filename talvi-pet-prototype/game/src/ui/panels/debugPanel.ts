import type { Action } from '@sim/actions';
import type { ExportMethod } from '@app/log';
import type { SimEvent } from '@sim/events';
import type { GameState } from '@sim/state';
import { activeProjectId, starsOf } from '@sim/select';
import { parseSave, STORAGE_KEYS } from '@app/persistence';
import type { ViewContext, FpsSample, FpsState } from '@view/context';
import { debugPanel } from './templates/debugPanel';
import { setAlignmentGrid } from '../overlay';
import { noPreview, PREVIEW_LAYERS } from '@view/preview/layer';

export type DebugPanel = { open(): void; close(): void; toggle(): void; refresh(): void; destroy(): void };

export const ERROR_MS = 3000;
const PROJECT_ROWS = ['Simulate a purchase', 'Set current progress', 'Jump to next phase', 'Complete project'];

/** Verification §5/§7 GAP-4 sampler: ten 1 s reads of the fps getter, then one `perf.sample` record. */
export async function sampleFps(fps: () => number, record: (type: 'perf.sample', payload: FpsSample) => void,
  state: FpsState, wait: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms))): Promise<FpsSample> {
  const reads: number[] = [];
  for (let i = 0; i < 10; i++) { await wait(1000); reads.push(fps()); }
  const round = (n: number) => Math.round(n * 10) / 10;
  const sample = { state, windowMs: 10000, fpsMean: round(reads.reduce((a, b) => a + b, 0) / reads.length), fpsMin: round(Math.min(...reads)) };
  record('perf.sample', sample);
  return sample;
}

/** Row 14: the info block text (mec-010 §3 row 14 + TOOL-006 `starsOf`, `sound.locked`, `fps`). */
export function infoText(context: ViewContext, state: GameState): string {
  const { content, log } = context;
  const lines = log.lines();
  const projectId = activeProjectId(content, state);
  const project = projectId ? content.projects.find(p => p.id === projectId) : undefined;
  const progress = project ? `${project.name} ${state.projects[project.id].currentCents} / ${project.goalCents} · acknowledged ${state.projects[project.id].acknowledgedPhase}` : 'all projects complete';
  const stars = state.scene.kind === 'interior' ? (({ points, max }) => `${points} / ${max}`)(starsOf(content, state, state.scene.roomId)) : '—';
  const locked = context.soundLocked?.();
  const fps = context.fps?.();
  return [
    `build ${context.headerFor?.(state).build ?? 'n/a'} · t ${Math.round(lines.at(-1)?.t ?? 0)} ms · log lines ${lines.length} / ${content.tuning.logRingLines}`,
    `scene ${state.scene.kind}${state.scene.kind === 'interior' ? ` ${state.scene.roomId}` : ''} · mode ${state.mode}`,
    progress,
    `Hearts ${Object.entries(state.pets).map(([id, pet]) => `${id} ${pet.hearts}`).join(' · ')}`,
    `Stars ${stars}`,
    `eventIntervalMs ${state.session.eventIntervalMs ?? 'null'} · feedPresentation ${state.session.feedPresentation} · seed ${state.session.seed}`,
    `sound.locked ${locked === undefined ? 'n/a' : locked} · fps ${fps === undefined || !Number.isFinite(fps) ? 'n/a' : fps.toFixed(1)}`,
  ].join('\n');
}

const integerOf = (input: HTMLInputElement): number | null => {
  const value = Number(input.value);
  return input.value.trim() !== '' && Number.isInteger(value) ? value : null;
};

/** Finds a template row by its label (the template carries no per-row hooks; WORK-014-3 FLAG). */
function rowsOf(section: HTMLElement): Map<string, HTMLElement> {
  return new Map([...section.querySelectorAll<HTMLElement>('.tpp-debug-row')].map(row => [row.querySelector('label')!.textContent!, row]));
}
const buttonsOf = (row: HTMLElement) => [...row.querySelectorAll<HTMLButtonElement>('button:not([role=switch])')];
const switchOf = (row: HTMLElement) => row.querySelector<HTMLButtonElement>('button[role=switch]')!;
const inputOf = (row: HTMLElement) => row.querySelector<HTMLInputElement>('input')!;
/** Row 16's four checkboxes, in template order: Fill every slot, Pets at anchors, Geometry, Segments. */
const previewBoxes = (row: (name: string) => HTMLElement) => [...row('Preview layers').querySelectorAll<HTMLInputElement>('input[type=checkbox]')];

/** mec-010 §7: the rejection or adjustment text under the row for 3 s (`role=alert`). */
function showRowError(target: HTMLElement, message: string): void {
  target.querySelector('.tpp-debug-error')?.remove();
  const p = document.createElement('p'); p.className = 'tpp-debug-error'; p.setAttribute('role', 'alert'); p.textContent = message;
  target.append(p);
  setTimeout(() => p.remove(), ERROR_MS);
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const stackOf = (error: unknown) => (error instanceof Error ? error.stack ?? '' : '');

/** Mounts WORK-011's `debugPanel` template once (hidden) and wires the build-side state, subscriptions and input (mec-010 §2–§3). */
export function createDebugPanel(root: HTMLElement, context: ViewContext): DebugPanel {
  const { content, store, log } = context;
  root.insertAdjacentHTML('beforeend', debugPanel({}));
  const section = root.lastElementChild as HTMLElement;
  section.hidden = true;
  section.querySelector('h2')!.textContent = 'Debug (hidden entry)';
  const rows = rowsOf(section);
  const row = (name: string) => rows.get(name)!;
  const pre = section.querySelector('pre')!;
  const view = { open: false, lastNonNull: content.tuning.eventIntervalMs as number, lastRow: '', lastAction: '' };
  let offAll: (() => void) | null = null;
  let ticker: ReturnType<typeof setInterval> | undefined;
  const cleanups: (() => void)[] = [];
  const listen = (el: Element, fn: () => void) => { el.addEventListener('click', fn); cleanups.push(() => el.removeEventListener('click', fn)); };

  const showError = (rowName: string, message: string) => showRowError(row(rowName), message);
  const dispatchFrom = (rowName: string, action: Action) => { view.lastRow = rowName; view.lastAction = action.type; store.dispatch(action); };
  const onEvent = (event: SimEvent) => {
    if (event.type === 'action.rejected' && view.lastRow && event.action.type === view.lastAction) showError(view.lastRow, `Rejected: ${event.reason}`);
    if (event.type === 'debug.applied' && event.adjusted && view.lastRow) {
      const { field, requested, applied } = event.adjusted;
      showError(view.lastRow, `Adjusted ${field}: requested ${requested}, applied ${applied}`);
    }
    refresh();
  };
  const extras = decorate(section, row);
  const refresh = () => renderRows(context, row, view, extras, pre);

  function open(): void {
    if (view.open) return;
    view.open = true; context.debugOpen = true; section.hidden = false;
    log.record('ui.debugPanel', { open: true });
    fillInputs(context, row, view.lastNonNull);
    refresh();
    offAll = store.subscribeAll(onEvent);
    ticker = setInterval(refresh, 1000);
  }
  function close(): void {
    if (!view.open) return;
    view.open = false; context.debugOpen = false; section.hidden = true;
    offAll?.(); offAll = null; clearInterval(ticker);
    extras.renderReset(false);
    log.record('ui.debugPanel', { open: false });
  }
  const toggle = () => (view.open ? close() : open());

  bindRows({ context, row, listen, dispatchFrom, showError, refresh, view, extras, overlayRoot: root.parentElement ?? root, close });
  for (const el of section.querySelectorAll('[data-action=close]')) listen(el, close);
  for (const entry of root.querySelectorAll('.tpp-debug-entry')) listen(entry, toggle);
  cleanups.push(context.keyboard.onDebugToggle(toggle));
  cleanups.push(store.subscribe('state.reset', () => close()));
  return { open, close, toggle, refresh, destroy() { close(); for (const off of cleanups.splice(0)) off(); section.remove(); } };
}

/** On open: the inputs start from the state (seed, interval, the active project's current cents). */
function fillInputs(context: ViewContext, row: (name: string) => HTMLElement, lastNonNull: number): void {
  const state = context.store.getState();
  const projectId = activeProjectId(context.content, state);
  inputOf(row('Feed seed')).value = String(state.session.seed);
  inputOf(row('Event interval')).value = String(state.session.eventIntervalMs ?? lastNonNull);
  if (projectId) inputOf(row('Set current progress')).value = String(state.projects[projectId].currentCents);
  inputOf(row('Tester label')).value = state.session.testerLabel;
  buttonsOf(row('Export log'))[2].hidden = !canShareFiles();
}

/** mec-010 §3 row 13: Share is shown only when the browser can share a `.jsonl` file (evaluated on every open). */
function canShareFiles(): boolean {
  const probe = [new File([''], 'x.jsonl', { type: 'application/x-ndjson' })];
  return typeof navigator.canShare === 'function' && navigator.canShare({ files: probe });
}

/** Row 14 text and every widget's reflected state (switches, segments, disabled project rows, row-4 caption). */
function renderRows(context: ViewContext, row: (name: string) => HTMLElement, view: { lastNonNull: number }, extras: Extras, pre: HTMLElement): void {
  const { content, store } = context;
  const state = store.getState();
  if (state.session.eventIntervalMs !== null) view.lastNonNull = state.session.eventIntervalMs;
  pre.textContent = infoText(context, state);
  const projectId = activeProjectId(content, state);
  for (const name of PROJECT_ROWS) for (const b of buttonsOf(row(name))) b.disabled = projectId === null;
  extras.noProject.hidden = projectId !== null;
  extras.caption.textContent = projectId ? `${content.projects.find(p => p.id === projectId)!.name} (acknowledged untouched)` : '';
  const check = (name: string, on: boolean) => switchOf(row(name)).setAttribute('aria-checked', String(on));
  check('Stars display', state.session.starsVisible);
  check('Freeze donations', state.session.eventIntervalMs === null);
  check('Mute SFX', state.session.muted);
  check('Room editor', context.roomEditorRequested === true);
  check('Alignment grid', context.alignmentGrid === true);
  const preview = context.preview ?? noPreview();
  previewBoxes(row).forEach((box, i) => { box.checked = preview[PREVIEW_LAYERS[i]]; });
  switchOf(row('Room editor')).disabled = state.scene.kind !== 'interior';
  const roomCaption = row('Room editor').querySelector('small')!; // mec-010 §3 row 15: the literal caption on the street only
  roomCaption.textContent = 'interiors only'; roomCaption.hidden = state.scene.kind === 'interior';
  const press = (b: HTMLButtonElement, on: boolean) => b.setAttribute('aria-pressed', String(on));
  const [playtest, frozen] = buttonsOf(row('Event interval'));
  press(playtest, state.session.eventIntervalMs === content.tuning.eventIntervalMs); press(frozen, state.session.eventIntervalMs === null);
  const [events, trickle] = buttonsOf(row('Feed presentation'));
  press(events, state.session.feedPresentation === 'events'); press(trickle, state.session.feedPresentation === 'trickle');
}

type Extras = { noProject: HTMLElement; caption: HTMLElement; sample: HTMLButtonElement; renderReset(confirm: boolean): void };

/** Runtime additions the static template lacks: title, row-2 limits, row-4 caption, the note, the sampler button, the reset confirm. */
function decorate(section: HTMLElement, row: (name: string) => HTMLElement): Extras {
  const interval = inputOf(row('Event interval'));
  Object.assign(interval, { min: '250', step: '250' }); interval.setAttribute('aria-label', 'Custom interval ms');
  inputOf(row('Feed seed')).setAttribute('aria-label', 'Feed seed');
  inputOf(row('Set current progress')).setAttribute('aria-label', 'Current cents');
  const caption = document.createElement('small'); row('Set current progress').querySelector('div')!.append(caption);
  section.querySelector('.tpp-debug-scroll > p:not(.tpp-debug-error)')?.remove();
  const noProject = document.createElement('p'); noProject.className = 'tpp-debug-note'; noProject.textContent = 'All projects complete'; noProject.hidden = true;
  row('Simulate a purchase').before(noProject);
  const sample = document.createElement('button'); sample.type = 'button'; sample.dataset.action = 'sample-fps'; sample.textContent = 'sample fps 10 s';
  section.querySelector('pre')!.after(sample);
  const resetSlot = row('Reset save').querySelector('div')!;
  const renderReset = (confirm: boolean) => {
    resetSlot.innerHTML = confirm
      ? 'Reset everything? <button type="button" data-action="reset-yes">Yes</button><button type="button" data-action="reset-no">No</button>'
        + '<label><input type="checkbox" data-field="frozen"> Start frozen (TEST-008)</label><input type="number" data-field="seed" aria-label="Reset seed (optional)" placeholder="seed (optional)">'
      : '<button type="button" data-action="reset">Reset</button>';
    row('Reset save').closest('section')!.dataset.state = confirm ? 'confirm' : 'open';
  };
  renderReset(false);
  return { noProject, caption, sample, renderReset };
}

type Binding = {
  context: ViewContext; row: (name: string) => HTMLElement; listen: (el: Element, fn: () => void) => void;
  dispatchFrom: (rowName: string, action: Action) => void; showError: (rowName: string, message: string) => void;
  refresh: () => void; view: { lastNonNull: number }; extras: Extras; overlayRoot: HTMLElement; close: () => void;
};

/** Rows 1–10b: one `store.dispatch` per control (mec-010 §3). */
function bindDispatchRows(b: Binding): void {
  const { context: { content, store }, row, listen, dispatchFrom } = b;
  const go = (name: string, index: number, action: () => Action | null) =>
    listen(buttonsOf(row(name))[index], () => { const a = action(); if (a) dispatchFrom(name, a); });
  const project = () => activeProjectId(content, store.getState());
  go('Simulate a purchase', 0, () => ({ type: 'debugSimulatePurchase' }));
  go('Event interval', 0, () => ({ type: 'debugSetEventInterval', ms: content.tuning.eventIntervalMs }));
  go('Event interval', 1, () => ({ type: 'debugSetEventInterval', ms: null }));
  go('Event interval', 2, () => ({ type: 'debugSetEventInterval', ms: Number(inputOf(row('Event interval')).value) }));
  go('Feed seed', 0, () => ({ type: 'debugSetSeed', seed: Number(inputOf(row('Feed seed')).value) }));
  go('Set current progress', 0, () => { const id = project(); return id ? { type: 'debugSetCurrent', projectId: id, cents: Number(inputOf(row('Set current progress')).value) } : null; });
  go('Jump to next phase', 0, () => { const id = project(); return id ? { type: 'debugJumpPhase', projectId: id } : null; });
  go('Complete project', 0, () => { const id = project(); return id ? { type: 'debugCompleteProject', projectId: id } : null; });
  go('Unlock all charm types', 0, () => ({ type: 'debugUnlockAllTypes' }));
  go('Feed presentation', 0, () => ({ type: 'debugSetFeedPresentation', mode: 'events' }));
  go('Feed presentation', 1, () => ({ type: 'debugSetFeedPresentation', mode: 'trickle' }));
  const flip = (name: string, action: () => Action) => listen(switchOf(row(name)), () => dispatchFrom(name, action()));
  flip('Stars display', () => ({ type: 'debugSetStarsVisible', on: !store.getState().session.starsVisible }));
  flip('Freeze donations', () => ({ type: 'debugSetEventInterval', ms: store.getState().session.eventIntervalMs === null ? b.view.lastNonNull : null }));
  flip('Mute SFX', () => ({ type: 'debugSetMuted', on: !store.getState().session.muted }));
}

/** Row 12: confirm → `reset {seed?}` → (frozen) `debugSetEventInterval {null}` → `log.reset(header)` → close (mec-010 §3, §5.3). */
function bindReset(b: Binding): void {
  const { context, row, extras } = b;
  const slot = row('Reset save').querySelector('div')!;
  slot.addEventListener('click', event => {
    const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
    if (action === 'reset') extras.renderReset(true);
    else if (action === 'reset-no') extras.renderReset(false);
    else if (action === 'reset-yes') {
      const frozen = slot.querySelector<HTMLInputElement>('[data-field=frozen]')!.checked;
      const seed = integerOf(slot.querySelector<HTMLInputElement>('[data-field=seed]')!);
      context.store.dispatch(seed === null ? { type: 'reset' } : { type: 'reset', seed });
      if (frozen) context.store.dispatch({ type: 'debugSetEventInterval', ms: null });
      if (context.headerFor) context.log.reset(context.headerFor(context.store.getState()));
      b.close();
    }
  });
}

/** Rows 15 and 18: view-only switches (no sim action). */
function bindViewSwitches(b: Binding): void {
  const { context, row, listen, refresh } = b;
  listen(switchOf(row('Room editor')), () => {
    if (context.store.getState().scene.kind !== 'interior') return;
    context.roomEditorRequested = !context.roomEditorRequested;
    context.log.record('ui.roomEditor', { open: context.roomEditorRequested });
    refresh();
  });
  listen(switchOf(row('Alignment grid')), () => {
    context.alignmentGrid = !context.alignmentGrid;
    setAlignmentGrid(b.overlayRoot, context.alignmentGrid);
    refresh();
  });
}

/** Row 16: TOOL-002 stage-1 layers; each change sets `context.preview[layer]` and records `ui.preview {layer, on}` once. */
function bindPreview(b: Binding): void {
  const { context, row, listen, refresh } = b;
  previewBoxes(row).forEach((box, i) => listen(box, () => {
    const layer = PREVIEW_LAYERS[i], flags = context.preview ?? noPreview();
    if (flags[layer] === box.checked) return;
    context.preview = { ...flags, [layer]: box.checked };
    context.log.record('ui.preview', { layer, on: box.checked });
    refresh();
  }));
}

/** Row 17: Load through `parseSave` (nothing written on a refusal), Copy the current `tpp.save` (TOOL-006, TOOL-008). */
function bindFixture(b: Binding): void {
  const { context, row, listen, showError } = b;
  const { content, log } = context;
  const [load, copy] = buttonsOf(row('Fixture'));
  const storage = () => context.storage ?? localStorage;
  const fail = (what: string, error: unknown) => {
    log.record('app.error', { message: `debug fixture ${what} failed: ${errorMessage(error)}`, stack: stackOf(error) });
    showError('Fixture', `${what} failed: ${errorMessage(error)}`);
  };
  listen(load, () => {
    const result = parseSave(content, row('Fixture').querySelector('textarea')!.value);
    if ('discarded' in result) { showError('Fixture', `Invalid fixture: ${result.discarded}. No state was changed.`); return; }
    const json = JSON.stringify({ schemaVersion: 1, savedAt: new Date().toISOString(), state: result.state });
    try {
      context.persistence.destroy(); // flush + detach first, so neither the debounce nor pagehide overwrites the fixture before the reload
      storage().setItem(STORAGE_KEYS.save, json);
    } catch (error) { fail('Load', error); return; }
    log.record('save.loaded', { source: 'fixture', bytes: new TextEncoder().encode(json).length });
    log.flush();
    (context.reload ?? (() => location.reload()))();
  });
  listen(copy, () => {
    void (async () => {
      try {
        context.persistence.flush();
        await (context.clipboard ?? navigator.clipboard).writeText(storage().getItem(STORAGE_KEYS.save) ?? '');
      } catch (error) { fail('Copy', error); }
    })();
  });
}

/** Row 11: the label applies on change (Enter or blur) through D3; the input then reflects the reduced (trimmed, capped) value. */
function bindTesterLabel(b: Binding): void {
  const input = inputOf(b.row('Tester label'));
  input.addEventListener('change', () => {
    b.dispatchFrom('Tester label', { type: 'debugSetTesterLabel', text: input.value });
    input.value = b.context.store.getState().session.testerLabel;
  });
}

/** Row 13: Download · Copy · Share → `log.exportLog(method)`; a failure shows the row error (the log records `app.error`). */
function bindExport(b: Binding): void {
  const methods: ExportMethod[] = ['download', 'copy', 'share'];
  buttonsOf(b.row('Export log')).forEach((button, i) => b.listen(button, () => {
    b.context.log.exportLog(methods[i]).catch(error => b.showError('Export log', `Export failed: ${errorMessage(error)}`));
  }));
}

function bindRows(b: Binding): void {
  bindDispatchRows(b);
  bindTesterLabel(b);
  bindExport(b);
  bindReset(b);
  bindViewSwitches(b);
  bindPreview(b);
  bindFixture(b);
  b.listen(b.extras.sample, () => {
    if (!b.context.sample) { b.showError('Alignment grid', 'fps sampler unavailable (dev build only)'); return; }
    b.context.sample('idle').then(b.refresh, error => {
      b.context.log.record('app.error', { message: `fps sample failed: ${errorMessage(error)}`, stack: stackOf(error) });
    });
  });
}

import type { Room } from '@content/schema/room';
import { RoomSchema } from '@content/schema/room';
import { runContentChecks, type Finding } from '@sim/checks';
import type { ViewContext } from '@view/context';
import { draftKey, setField } from '@view/editor/draft';
import { serializeRoom, type ChangeCause, type RoomEditor, type Selection } from '@view/editor';
import { noPreview, PREVIEW_LAYERS } from '@view/preview/layer';
import { roomEditor as roomEditorTemplate } from './templates/roomEditor';

export type CheckStats = { lastMs: number; meanMs: number; maxMs: number; runs: number };
export type RoomEditorPanel = { open(editor: RoomEditor): void; close(): void; refresh(): void; stats(): CheckStats; findings(): readonly Finding[]; destroy(): void };
type Row = { level: string; ids: string[]; file: string; path: string; message: string };

/** One animation frame at 60 Hz: a slower check run defers later runs to once per frame (package escalation condition). */
export const FRAME_BUDGET_MS = 16.7;
const LEVEL_COLOUR: Record<string, string> = { error: '#b5523f', warning: '#b07a12', info: 'inherit' };
const SELECTION_FIELDS: Record<string, string[]> = { slot: ['id', 'sizeClass', 'wall', 'depthOverride', 'anchor.facing', 'adjacent'], anchor: ['anchor.facing'], wander: ['id'] };
const FIELD_LABELS = ['id', 'sizeClass', 'wall', 'depthOverride', 'anchor.facing', 'adjacent'];
const fieldName = (label: HTMLLabelElement) => label.firstChild?.textContent?.trim() ?? '';
const control = (label: HTMLElement) => label.querySelector<HTMLInputElement | HTMLSelectElement | HTMLOutputElement>('input, select, output')!;
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** A finding's JSON pointer to the editor object it names (order fork 4: `null` = not clickable). */
export function selectionFor(room: Room, path: string): Selection {
  const [, head, index, sub] = path.split('/');
  const i = Number(index);
  if (head === 'slots' && room.slots[i]) return { kind: sub === 'anchor' ? 'anchor' : 'slot', id: room.slots[i].id };
  if (head === 'wanderPoints' && room.wanderPoints[i]) return { kind: 'wander', id: room.wanderPoints[i].id };
  if (head === 'doors' && room.doors[i]) return { kind: sub === 'spawn' ? 'doorSpawn' : 'door', id: room.doors[i].id };
  if (head === 'walkArea') return index === undefined ? { kind: 'vertex', id: '0' } : room.walkArea[i] ? { kind: 'vertex', id: String(i) } : null;
  if (head === 'petSpawn') return { kind: 'petSpawn', id: 'petSpawn' };
  return null;
}

/** Zod first; the checks run only on a schema-valid draft, with the draft standing in for the content room. */
export function draftFindings(context: ViewContext, draft: Room): Row[] {
  const parsed = RoomSchema.safeParse(draft);
  if (!parsed.success) return parsed.error.issues.map(issue => ({ level: 'error', ids: ['ZOD'], file: `rooms/${draft.id}.json`, path: `/${issue.path.join('/')}`, message: issue.message }));
  const content = { ...context.content, rooms: { ...context.content.rooms, [draft.id]: draft } };
  return runContentChecks(content, context.manifest, { room: draft.id });
}

/** TOOL-002 (a) side panel: WORK-011's `roomEditor` template plus runtime-built select, findings list, prompt and status line. */
export function createRoomEditorPanel(root: HTMLElement, context: ViewContext): RoomEditorPanel {
  root.insertAdjacentHTML('beforeend', roomEditorTemplate({}));
  const section = root.lastElementChild as HTMLElement;
  section.hidden = true;
  const ui = decorate(section, context);
  const view = { editor: null as RoomEditor | null, off: null as (() => void) | null, errorRecorded: false, hidden: [] as HTMLElement[], ticker: undefined as ReturnType<typeof setInterval> | undefined };
  const storage = () => context.storage ?? localStorage;
  const status = (message: string) => { ui.status.textContent = message; };
  const fail = (what: string, error: unknown) => {
    status(`${what} failed: ${errorText(error)}`);
    if (view.errorRecorded) return;
    view.errorRecorded = true;
    context.log.record('app.error', { message: `room editor ${what} failed: ${errorText(error)}`, stack: error instanceof Error ? error.stack ?? '' : '' });
  };

  const checks = createCheckRunner(section, context, ui, () => view.editor);
  const autosave = () => {
    const editor = view.editor; if (!editor) return;
    try { storage().setItem(draftKey(editor.draft().id), serializeRoom(editor.draft())); } catch (error) { fail('Autosave', error); }
  };
  const onChange = (cause: ChangeCause) => {
    if (cause === 'commit' || cause === 'undo' || cause === 'redo') autosave();
    if (cause === 'commit' || cause === 'undo' || cause === 'redo' || cause === 'load') checks.schedule();
    refresh();
  };
  const refresh = () => { if (view.editor) renderForms(ui, context, view.editor); };

  function open(editor: RoomEditor): void {
    if (view.editor === editor) return;
    if (view.editor) close();
    view.editor = editor; view.errorRecorded = false;
    view.off = editor.onChange(onChange);
    section.hidden = false; status('');
    hideOthers(root, section, view.hidden);
    offerRecovery(ui, context, editor, storage);
    checks.run(); refresh();
    view.ticker = setInterval(refresh, 500); // mirrors debug row 16 changes to `context.preview`
  }
  function close(): void {
    if (!view.editor) return;
    view.off?.(); view.off = null; view.editor = null;
    checks.cancel(); clearInterval(view.ticker);
    section.hidden = true; ui.prompt.hidden = true;
    for (const el of view.hidden.splice(0)) el.style.visibility = '';
  }

  bindForms(ui, context, () => view.editor, status);
  bindActions(ui, context, () => view.editor, { status, fail, storage });
  const previous = context.onRoomEditor;
  context.onRoomEditor = editor => { previous?.(editor); if (editor) open(editor); else close(); };
  if (context.roomEditor) open(context.roomEditor);
  return { open, close, refresh, stats: checks.stats, findings: checks.findings, destroy() { close(); context.onRoomEditor = previous; section.remove(); } };
}

/** The findings run with its latency (order row "check latency"): zod, then the shared checks, timed with `performance.now()`. */
function createCheckRunner(section: HTMLElement, context: ViewContext, ui: Ui, editor: () => RoomEditor | null) {
  const s: CheckStats = { lastMs: 0, meanMs: 0, maxMs: 0, runs: 0 };
  let findings: Row[] = [], pending = 0;
  const run = () => {
    pending = 0;
    const e = editor(); if (!e) return;
    const t0 = performance.now();
    findings = draftFindings(context, e.draft());
    const ms = performance.now() - t0;
    s.runs += 1; s.lastMs = ms; s.maxMs = Math.max(s.maxMs, ms); s.meanMs += (ms - s.meanMs) / s.runs;
    section.dataset.checkStats = JSON.stringify(s);
    renderFindings(ui, e, findings);
  };
  return {
    run,
    // Order escalation: once a run has exceeded one frame, later runs coalesce to one per animation frame after the commit.
    schedule() {
      if (s.maxMs <= FRAME_BUDGET_MS || typeof requestAnimationFrame !== 'function') { run(); return; }
      if (!pending) pending = requestAnimationFrame(run);
    },
    cancel() { if (pending && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(pending); pending = 0; },
    stats: (): CheckStats => ({ ...s }),
    findings: () => findings as Finding[],
  };
}

type Ui = { section: HTMLElement; fields: Map<string, HTMLLabelElement>; background: HTMLSelectElement; coords: HTMLElement; boxes: HTMLInputElement[];
  findings: HTMLElement; prompt: HTMLElement; status: HTMLElement; buttons: Map<string, HTMLButtonElement> };

/** Runtime additions inside the template's markup (precedent WORK-014-2 fork 3; templates and styles untouched). */
function decorate(section: HTMLElement, context: ViewContext): Ui {
  const fields = new Map([...section.querySelectorAll<HTMLLabelElement>(':scope > label')].map(l => [fieldName(l), l]));
  const coords = section.querySelector<HTMLElement>(':scope > p')!; coords.textContent = 'Nothing selected';
  const background = document.createElement('select'); background.setAttribute('aria-label', 'Background');
  for (const id of context.manifest.entries.filter(e => e.type === 'image').map(e => e.id).sort()) background.add(new Option(id, id));
  fields.get('Background')!.querySelector('input')!.replaceWith(background);
  const depth = control(fields.get('depthOverride')!) as HTMLInputElement; depth.type = 'text'; depth.inputMode = 'numeric'; depth.placeholder = 'none';
  const findings = document.createElement('div'); findings.className = 'tpp-editor-findings';
  section.querySelector('h3')!.nextElementSibling!.replaceWith(findings);
  const prompt = document.createElement('div'); prompt.className = 'tpp-editor-prompt'; prompt.hidden = true;
  prompt.innerHTML = '<p></p><button type="button" data-action="resume">Resume draft</button> <button type="button" data-action="discard">Discard</button>';
  section.querySelector('h2')!.after(prompt);
  const status = document.createElement('p'); status.className = 'tpp-editor-status'; status.setAttribute('role', 'status');
  section.querySelector('.tpp-editor-actions')!.after(status);
  const buttons = new Map([...section.querySelectorAll<HTMLButtonElement>('.tpp-editor-actions button')].map(b => [b.textContent!, b]));
  const boxes = [...section.querySelectorAll<HTMLInputElement>('fieldset input[type=checkbox]')];
  return { section, fields, background, coords, boxes, findings, prompt, status, buttons };
}

/** On open: no key → the content room; a key equal to it → removed silently; otherwise Resume / Discard (unparsable → Discard only). */
function offerRecovery(ui: Ui, context: ViewContext, editor: RoomEditor, storage: () => Storage): void {
  const roomId = editor.draft().id, key = draftKey(roomId), fileRoom = context.content.rooms[roomId];
  let raw: string | null = null;
  try { raw = storage().getItem(key); } catch (error) { ui.status.textContent = `Draft read failed: ${errorText(error)}`; return; }
  if (raw === null) return;
  let stored: unknown, reason = '';
  try { stored = JSON.parse(raw); } catch (error) { reason = errorText(error); }
  // Schema first: serializeRoom throws on a parsable non-room value (null, a number), which must reach the Discard-only prompt.
  const parsed = reason ? null : RoomSchema.safeParse(stored);
  if (parsed && !parsed.success) reason = parsed.error.issues.map(i => `/${i.path.join('/')} ${i.message}`).join('; ');
  if (!reason && serializeRoom(stored as Room) === serializeRoom(fileRoom)) { storage().removeItem(key); return; }
  ui.prompt.hidden = false;
  ui.prompt.querySelector('p')!.textContent = reason ? `Saved draft unreadable: ${reason}` : 'A saved draft differs from the file.';
  const resume = ui.prompt.querySelector<HTMLButtonElement>('[data-action=resume]')!, discard = ui.prompt.querySelector<HTMLButtonElement>('[data-action=discard]')!;
  resume.hidden = !!reason;
  resume.onclick = () => { ui.prompt.hidden = true; editor.load(parsed!.data as Room); };
  discard.onclick = () => {
    ui.prompt.hidden = true;
    try { storage().removeItem(key); } catch (error) { ui.status.textContent = `Discard failed: ${errorText(error)}`; }
    editor.load(fileRoom);
  };
}

/** Selection form per kind (slot: all six; anchor: facing; wander: id; door/spawn/vertex: read-only coordinates) and the room form. */
function renderForms(ui: Ui, context: ViewContext, editor: RoomEditor): void {
  const draft = editor.draft(), sel = editor.selection();
  const slot = sel && (sel.kind === 'slot' || sel.kind === 'anchor') ? draft.slots.find(s => s.id === sel.id) : undefined;
  const shown = new Set(sel ? SELECTION_FIELDS[sel.kind] ?? [] : []);
  const values: Record<string, string> = slot
    ? { id: slot.id, sizeClass: slot.sizeClass, wall: slot.wall ?? '', depthOverride: slot.depthOverride === undefined ? '' : String(slot.depthOverride), 'anchor.facing': slot.anchor.facing, adjacent: slot.adjacent.join(', ') }
    : { id: sel?.kind === 'wander' ? sel.id : '' };
  if (slot?.sizeClass !== 'wall') shown.delete('wall');
  for (const name of FIELD_LABELS) {
    const label = ui.fields.get(name)!, el = control(label);
    label.hidden = !shown.has(name);
    if (document.activeElement !== el) el.value = values[name] ?? '';
  }
  ui.coords.textContent = coordinatesLine(draft, sel);
  const set = (el: HTMLInputElement | HTMLSelectElement, value: string) => { if (document.activeElement !== el) el.value = value; };
  set(control(ui.fields.get('Room name')!) as HTMLInputElement, draft.name);
  if (![...ui.background.options].some(o => o.value === draft.background)) ui.background.add(new Option(`(missing) ${draft.background}`, draft.background));
  set(ui.background, draft.background);
  set(control(ui.fields.get('residentPetId')!) as HTMLInputElement, draft.residentPetId);
  const preview = context.preview ?? noPreview();
  ui.boxes.forEach((box, i) => { box.checked = preview[PREVIEW_LAYERS[i]]; });
  ui.buttons.get('Undo')!.disabled = !editor.canUndo();
  ui.buttons.get('Redo')!.disabled = !editor.canRedo();
}

function coordinatesLine(draft: Room, sel: Selection): string {
  if (!sel) return 'Nothing selected';
  const at = (p: { x: number; y: number } | undefined) => (p ? `(${p.x}, ${p.y})` : '(missing)');
  if (sel.kind === 'slot' || sel.kind === 'anchor') { const s = draft.slots.find(x => x.id === sel.id); return `${sel.kind} ${sel.id} · base ${at(s)} · anchor ${at(s?.anchor)}`; }
  if (sel.kind === 'door') { const d = draft.doors.find(x => x.id === sel.id); return d ? `door ${d.id} · (${d.rect.x}, ${d.rect.y}) ${d.rect.w}×${d.rect.h}` : `door ${sel.id}`; }
  if (sel.kind === 'doorSpawn') return `door ${sel.id} spawn · ${at(draft.doors.find(x => x.id === sel.id)?.spawn)}`;
  if (sel.kind === 'vertex') return `walkArea vertex ${sel.id} · ${at(draft.walkArea[Number(sel.id)])}`;
  if (sel.kind === 'petSpawn') return `petSpawn · ${at(draft.petSpawn)} facing ${draft.petSpawn.facing}`;
  return `wander ${sel.id} · ${at(draft.wanderPoints.find(w => w.id === sel.id))}`;
}

/** Each `change` (blur for text) commits one `setField`; blank depthOverride removes the key; a non-integer is refused inline. */
function bindForms(ui: Ui, context: ViewContext, editor: () => RoomEditor | null, status: (m: string) => void): void {
  const commitField = (name: string, raw: string) => {
    const e = editor(); const sel = e?.selection(); if (!e) return;
    if (['Room name', 'Background', 'residentPetId'].includes(name)) {
      const path = name === 'Room name' ? 'name' : name === 'Background' ? 'background' : 'residentPetId';
      if (!e.commit(setField(path, raw))) status(`Refused: ${path}`); return;
    }
    if (!sel) return;
    if (name === 'depthOverride' && raw.trim() !== '' && !/^-?\d+$/.test(raw.trim())) { status('depthOverride must be an integer (blank = none)'); renderForms(ui, context, e); return; }
    const path = sel.kind === 'wander' ? `wanderPoints.${sel.id}.id` : `slots.${sel.id}.${name}`;
    const ok = e.commit(setField(path, name === 'depthOverride' ? raw.trim() : raw));
    if (!ok) { status(`Refused: ${name} ${raw}`); return; }
    status('');
    if (name === 'id') e.select({ kind: sel.kind, id: raw });
  };
  for (const [name, label] of ui.fields) {
    const el = name === 'Background' ? ui.background : control(label);
    if (el instanceof HTMLOutputElement) continue;
    el.addEventListener('change', () => commitField(name, el.value));
  }
  ui.boxes.forEach((box, i) => box.addEventListener('change', () => {
    const layer = PREVIEW_LAYERS[i], flags = context.preview ?? noPreview();
    if (flags[layer] === box.checked) return;
    context.preview = { ...flags, [layer]: box.checked };
    context.log.record('ui.preview', { layer, on: box.checked });
  }));
}

type ActionDeps = { status(m: string): void; fail(what: string, error: unknown): void; storage(): Storage };
/** Undo / Redo / Revert to file / Copy JSON / Download (export allowed with errors; the browser writes no file). */
function bindActions(ui: Ui, context: ViewContext, editor: () => RoomEditor | null, deps: ActionDeps): void {
  const on = (name: string, fn: (e: RoomEditor) => void) => ui.buttons.get(name)!.addEventListener('click', () => { const e = editor(); if (e) fn(e); });
  on('Undo', e => e.undo());
  on('Redo', e => e.redo());
  on('Revert to file', e => {
    const roomId = e.draft().id;
    try { deps.storage().removeItem(draftKey(roomId)); } catch (error) { deps.fail('Revert', error); }
    ui.prompt.hidden = true;
    e.load(context.content.rooms[roomId]);
    deps.status('Reverted to file');
  });
  on('Copy JSON', e => {
    const text = serializeRoom(e.draft());
    void (async () => {
      try { await (context.clipboard ?? navigator.clipboard).writeText(text); deps.status('Copied'); } catch (error) { deps.fail('Copy', error); }
    })();
  });
  on('Download', e => {
    try {
      const url = URL.createObjectURL(new Blob([serializeRoom(e.draft())], { type: 'application/json' }));
      const a = document.createElement('a'); a.href = url; a.download = `${e.draft().id}.json`;
      a.click(); URL.revokeObjectURL(url);
      deps.status(`Downloaded ${a.download}`);
    } catch (error) { deps.fail('Download', error); }
  });
}

/** This room's file first, then the rest collapsed under "Other files (n)"; a row whose pointer names an editor object selects it. */
function renderFindings(ui: Ui, editor: RoomEditor, findings: readonly Row[]): void {
  const file = `rooms/${editor.draft().id}.json`;
  const own = findings.filter(f => f.file === file), rest = findings.filter(f => f.file !== file);
  const list = (rows: readonly Row[]) => {
    const ol = document.createElement('ol');
    for (const f of rows) {
      const li = document.createElement('li'); li.dataset.level = f.level; li.dataset.ids = f.ids.join(',');
      li.style.color = LEVEL_COLOUR[f.level] ?? 'inherit';
      li.textContent = `${f.ids.join(',')} · ${f.file === file ? '' : `${f.file}:`}${f.path} · ${f.message}`;
      const target = f.file === file ? selectionFor(editor.draft(), f.path) : null;
      if (target) { li.style.cursor = 'pointer'; li.dataset.select = `${target.kind}:${target.id}`; li.addEventListener('click', () => editor.select(target)); }
      ol.append(li);
    }
    return ol;
  };
  const empty = document.createElement('p'); empty.textContent = own.length ? '' : 'No findings for this room';
  const details = document.createElement('details');
  details.innerHTML = `<summary>Other files (${rest.length})</summary>`;
  details.append(list(rest));
  ui.findings.replaceChildren(...(own.length ? [list(own)] : [empty]), details);
}

/** While open, every other `#panels` child except the debug panel is hidden by `visibility` (their own `hidden` logic untouched). */
function hideOthers(root: HTMLElement, section: HTMLElement, hidden: HTMLElement[]): void {
  for (const el of root.children) {
    if (!(el instanceof HTMLElement) || el === section || el.dataset.panel === 'debugPanel' || el.style.visibility === 'hidden') continue;
    el.style.visibility = 'hidden'; hidden.push(el);
  }
}

// @vitest-environment jsdom
import './setup';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Room } from '../../src/content/schema/room';
import { runContentChecks } from '../../src/sim/checks';
import { STORAGE_KEYS } from '../../src/app/persistence';
import { serializeRoom, type EditorSession } from '../../src/view/editor';
import { draftKey, moveAnchor, moveSlot, setField } from '../../src/view/editor/draft';
import { draftFindings } from '../../src/ui/panels/roomEditor';
import { createMemoryStorage } from '../app/memoryStorage';
import { destroyScene } from './sceneHarness';
import { click, designSetup, linesOf, type DesignSetup } from './designHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const real = JSON.parse(readFileSync('src/content/rooms/dog-room.json', 'utf8')) as Room;
const KEY = draftKey('dog-room');
type S = DesignSetup & { storage: Storage & { writes: number }; clipboard: { writeText: ReturnType<typeof vi.fn> } };

/** FX-CONTENT-MIN with the real Dog room geometry, the overlay mounted, injected storage and clipboard. */
async function setup(stored?: string): Promise<S> {
  const s = await designSetup({ mode: 'play', patches: (['walkArea', 'slots', 'wanderPoints', 'petSpawn'] as const)
    .map(key => ({ file: 'rooms/dog-room.json', path: `/${key}`, value: real[key] })) });
  const storage = createMemoryStorage(), clipboard = { writeText: vi.fn(async () => undefined) };
  if (stored !== undefined) storage.setItem(KEY, stored);
  Object.assign(s.context, { storage, clipboard });
  return { ...s, storage, clipboard };
}
const frame = (s: DesignSetup) => s.scene.update(0, 16);
const open = (s: DesignSetup) => { s.context.roomEditorRequested = true; frame(s); return s.scene.editor!.session()!; };
const closeEditor = (s: DesignSetup) => { s.context.roomEditorRequested = false; frame(s); };
const panel = (s: DesignSetup) => s.root.querySelector<HTMLElement>('[data-panel=roomEditor]')!;
const field = (s: DesignSetup, name: string) =>
  [...panel(s).querySelectorAll<HTMLLabelElement>(':scope > label')].find(l => l.firstChild?.textContent?.trim() === name)!;
const input = (s: DesignSetup, name: string) => field(s, name).querySelector<HTMLInputElement & HTMLSelectElement>('input, select, output')!;
const change = (el: HTMLInputElement | HTMLSelectElement, value: string) => { el.value = value; el.dispatchEvent(new Event('change')); };
const button = (s: DesignSetup, text: string) => [...panel(s).querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent === text)!;
const rows = (s: DesignSetup) => [...panel(s).querySelectorAll<HTMLLIElement>('.tpp-editor-findings li')];
const rowText = (s: DesignSetup) => rows(s).map(r => r.textContent);
const status = (s: DesignSetup) => panel(s).querySelector('.tpp-editor-status')!.textContent;
const hud = (s: DesignSetup) => s.root.querySelector<HTMLElement>('[data-panel=hudInterior]')!;
const baseline = (s: DesignSetup, room: Room) => runContentChecks({ ...s.context.content, rooms: { ...s.context.content.rooms, 'dog-room': room } }, s.context.manifest, { room: 'dog-room' });

describe('tools TOOL-002 panel', () => {
  it('tools TOOL-002 panel — opening shows .tpp-roomEditor and hides the HUD, want panel and toast; closing hides it and restores them', async () => {
    const s = await setup();
    expect(panel(s).hidden).toBe(true);
    open(s);
    expect(panel(s).hidden).toBe(false);
    expect(panel(s).classList.contains('tpp-roomEditor')).toBe(true);
    for (const name of ['hudInterior', 'wantPanel', 'toast']) expect(s.root.querySelector<HTMLElement>(`[data-panel=${name}]`)!.style.visibility).toBe('hidden');
    expect(s.root.querySelector<HTMLElement>('[data-panel=debugPanel]')!.style.visibility).toBe('');
    closeEditor(s);
    expect(panel(s).hidden).toBe(true);
    expect(hud(s).style.visibility).toBe('');
  });
  it('tools TOOL-002 panel — Background is a <select> of every manifest image id (sorted) with the room background selected', async () => {
    const s = await setup(); open(s);
    const select = input(s, 'Background');
    expect(select.tagName).toBe('SELECT');
    const ids = s.context.manifest.entries.filter(e => e.type === 'image').map(e => e.id).sort();
    expect([...select.options].slice(0, ids.length).map(o => o.value)).toEqual(ids);
    expect(select.value).toBe(s.context.content.rooms['dog-room'].background);
  });
  it('tools TOOL-002 panel — layer checkboxes mirror context.preview and a toggle records exactly one ui.preview {layer, on}', async () => {
    const s = await setup(); open(s);
    const boxes = [...panel(s).querySelectorAll<HTMLInputElement>('fieldset input[type=checkbox]')];
    expect(boxes.map(b => b.checked)).toEqual([false, false, false, false]);
    boxes[2].checked = true; boxes[2].dispatchEvent(new Event('change'));
    expect(s.context.preview?.geometry).toBe(true);
    expect(linesOf(s.context, 'ui.preview')).toEqual([{ type: 'ui.preview', layer: 'geometry', on: true }]);
    s.context.preview = { ...s.context.preview!, fill: true };
    s.panels.roomEditor.refresh();
    expect(boxes[0].checked).toBe(true);
  });
});

describe('tools TOOL-002 panel form', () => {
  it('tools TOOL-002 panel form — wall-2 shows sizeClass wall, the wall field and depthOverride; blank depthOverride commits once with the key absent; a non-integer is refused', async () => {
    const s = await setup(); const session = open(s);
    session.select({ kind: 'slot', id: 'wall-2' });
    expect([input(s, 'sizeClass').value, field(s, 'wall').hidden, input(s, 'depthOverride').value]).toEqual(['wall', false, '1']);
    change(input(s, 'depthOverride'), '1.5');
    expect(session.history.past.length).toBe(0);
    expect(status(s)).toMatch(/integer/);
    change(input(s, 'depthOverride'), '');
    expect(session.history.past.length).toBe(1);
    expect('depthOverride' in session.draft().slots.find(x => x.id === 'wall-2')!).toBe(false);
  });
  it('tools TOOL-002 panel form — renaming floor-2 to floor-9 rewrites floor-1.adjacent; name change commits once; adjacent read-only', async () => {
    const s = await setup(); const session = open(s);
    session.select({ kind: 'slot', id: 'floor-2' });
    expect(input(s, 'adjacent').tagName).toBe('OUTPUT');
    expect(field(s, 'wall').hidden).toBe(true);
    change(input(s, 'id'), 'floor-9');
    const slot = (id: string) => session.draft().slots.find(x => x.id === id)!;
    expect([slot('floor-1').adjacent, slot('floor-9').adjacent]).toEqual([['floor-9'], ['floor-1']]);
    expect(session.selection()).toEqual({ kind: 'slot', id: 'floor-9' });
    change(input(s, 'Room name'), 'Dog den');
    expect([session.draft().name, session.history.past.length]).toEqual(['Dog den', 2]);
  });
  it('tools TOOL-002 panel form — anchor shows facing only; door shows a read-only coordinates line', async () => {
    const s = await setup(); const session = open(s);
    session.select({ kind: 'anchor', id: 'floor-3' });
    expect(['id', 'sizeClass', 'anchor.facing'].map(n => field(s, n).hidden)).toEqual([true, true, false]);
    session.select({ kind: 'door', id: session.draft().doors[0].id });
    expect(panel(s).querySelector(':scope > p')!.textContent).toMatch(/^door .* · \(\d+, \d+\) \d+×\d+$/);
  });
});

describe('tools TOOL-002 findings', () => {
  it('tools TOOL-002 findings — baseline at open, CHK-005-07 warning after the floor-3 drag (click selects floor-2), CHK-005-03/007-06/007-07 errors after the anchor move, undo x2 returns the baseline', async () => {
    const s = await setup(); const session = open(s);
    const base = baseline(s, session.draft());
    expect(s.panels.roomEditor.findings()).toEqual(base);
    const atOpen = rowText(s);
    session.commit(moveSlot('floor-3', -90, 0));
    const warning = rows(s).find(r => r.dataset.ids === 'CHK-005-07')!;
    expect(warning.dataset.level).toBe('warning');
    expect(warning.textContent).toMatch(/\/slots\/1 · .*floor-3/);
    expect(warning.style.color).not.toBe('inherit');
    click(warning);
    expect(session.selection()).toEqual({ kind: 'slot', id: 'floor-2' });
    session.commit(moveAnchor('floor-3', 816, 470));
    const errors = rows(s).filter(r => r.dataset.level === 'error').map(r => r.dataset.ids!);
    expect(errors.some(ids => ids.includes('CHK-005-03'))).toBe(true);
    expect(errors.some(ids => ids.includes('CHK-007-07'))).toBe(true);
    expect(rows(s).find(r => r.dataset.level === 'error')!.style.color).toBe('rgb(181, 82, 63)');
    session.undo(); session.undo();
    expect(rowText(s)).toEqual(atOpen);
  });
  it('tools TOOL-002 findings — a non-array walkArea fails safeParse: ZOD rows only (the checks are not run)', async () => {
    const s = await setup(); const session = open(s);
    const bad = { ...session.draft(), walkArea: 'x' } as unknown as Room;
    const found = draftFindings(s.context, bad);
    expect(found.length).toBeGreaterThan(0);
    expect(found.every(f => f.ids[0] === 'ZOD')).toBe(true);
    expect(found.some(f => f.path === '/walkArea')).toBe(true);
  });
  it('tools TOOL-002 findings — checks run on commits only: drag frames (stage) and selections trigger none; latency stats count runs', async () => {
    const s = await setup(); const session = open(s) as EditorSession;
    const runs = () => s.panels.roomEditor.stats().runs;
    const before = runs();
    session.history.stage(moveSlot('floor-3', 5, 0));
    session.select({ kind: 'slot', id: 'floor-3' });
    expect(runs()).toBe(before);
    session.commit(moveSlot('floor-3', 5, 0));
    expect(runs()).toBe(before + 1);
    expect(JSON.parse(panel(s).dataset.checkStats!).runs).toBe(before + 1);
  });
});

describe('tools TOOL-002 draft recovery', () => {
  it('tools TOOL-002 draft recovery — a commit autosaves serializeRoom(draft); re-open offers Resume draft / Discard; Resume restores it with empty history', async () => {
    const s = await setup(); let session = open(s);
    session.commit(moveSlot('floor-3', -90, 0));
    const saved = s.storage.getItem(KEY);
    expect(saved).toBe(serializeRoom(session.draft()));
    closeEditor(s); session = open(s);
    const prompt = panel(s).querySelector<HTMLElement>('.tpp-editor-prompt')!;
    expect(prompt.hidden).toBe(false);
    expect([...prompt.querySelectorAll('button')].filter(b => !b.hidden).map(b => b.textContent)).toEqual(['Resume draft', 'Discard']);
    click(prompt.querySelector('[data-action=resume]'));
    expect(serializeRoom(session.draft())).toBe(saved);
    expect(session.canUndo()).toBe(false);
  });
  it('tools TOOL-002 draft recovery — Discard removes the key and starts from the content room', async () => {
    const s = await setup(); let session = open(s);
    session.commit(moveSlot('floor-3', -90, 0));
    closeEditor(s); session = open(s);
    click(panel(s).querySelector('[data-action=discard]'));
    expect(s.storage.getItem(KEY)).toBeNull();
    expect(serializeRoom(session.draft())).toBe(serializeRoom(s.context.content.rooms['dog-room']));
  });
  it('tools TOOL-002 draft recovery — a key equal to the content room is removed with no prompt; an unparsable key offers Discard only with its reason', async () => {
    const s = await setup();
    s.storage.setItem(KEY, serializeRoom(s.context.content.rooms['dog-room'])); open(s);
    expect(s.storage.getItem(KEY)).toBeNull();
    expect(panel(s).querySelector<HTMLElement>('.tpp-editor-prompt')!.hidden).toBe(true);
    const bad = await setup('{not json'); open(bad);
    const prompt = panel(bad).querySelector<HTMLElement>('.tpp-editor-prompt')!;
    expect(prompt.hidden).toBe(false);
    expect(prompt.querySelector('p')!.textContent).toMatch(/^Saved draft unreadable: /);
    expect([...prompt.querySelectorAll('button')].filter(b => !b.hidden).map(b => b.textContent)).toEqual(['Discard']);
  });
  it('tools TOOL-002 draft recovery — Revert to file clears the key and history; a storage throw records one app.error and an inline line', async () => {
    const s = await setup(); const session = open(s);
    session.commit(moveSlot('floor-3', -90, 0));
    click(button(s, 'Revert to file'));
    expect([s.storage.getItem(KEY), session.canUndo(), session.canRedo()]).toEqual([null, false, false]);
    expect(serializeRoom(session.draft())).toBe(serializeRoom(s.context.content.rooms['dog-room']));
    s.storage.setItem = () => { throw new DOMException('The quota has been exceeded.', 'QuotaExceededError'); };
    session.commit(moveSlot('floor-3', 1, 0)); session.commit(moveSlot('floor-3', 1, 0));
    expect(linesOf(s.context, 'app.error')).toHaveLength(1);
    expect(status(s)).toMatch(/^Autosave failed: /);
  });
});

describe('tools TOOL-002 export', () => {
  it('tools TOOL-002 export — Copy JSON writes exactly serializeRoom(draft) with error findings present; Download makes one Blob named dog-room.json and revokes it; only the draft key is written', async () => {
    const s = await setup(); const session = open(s);
    session.commit(moveAnchor('floor-3', 816, 470));
    expect(rows(s).some(r => r.dataset.level === 'error')).toBe(true);
    const writesBefore = s.storage.writes;
    click(button(s, 'Copy JSON'));
    await Promise.resolve(); await Promise.resolve();
    expect(s.clipboard.writeText).toHaveBeenCalledWith(serializeRoom(session.draft()));
    expect(status(s)).toBe('Copied');
    const blobs: Blob[] = [];
    const create = vi.fn((b: Blob) => { blobs.push(b); return 'blob:x'; }), revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const anchors: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { anchors.push(this); });
    click(button(s, 'Download'));
    expect(blobs).toHaveLength(1);
    expect(await blobs[0].text()).toBe(serializeRoom(session.draft()));
    expect([anchors.length, anchors[0].download, revoke.mock.calls[0][0]]).toEqual([1, 'dog-room.json', 'blob:x']);
    expect(s.storage.writes).toBe(writesBefore);
    expect(s.storage.getItem(STORAGE_KEYS.save)).toBeNull();
    session.commit(setField('name', 'X'));
    expect([...Array(s.storage.length).keys()].map(i => s.storage.key(i))).toEqual([KEY]);
  });
});

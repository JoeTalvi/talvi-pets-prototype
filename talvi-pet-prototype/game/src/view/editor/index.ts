import type { Room, Slot } from '@content/schema/room';
import type { ViewContext } from '../context';
import type { InteriorScene } from '../scenes/InteriorScene';
import { createHistory, toggleAdjacent, insertVertex, type History, type Op } from './draft';
import { createHandles, type Handles, type Selection } from './handles';
import { bindDrag, editorKey, fieldFocused, parseKey, type ToolTarget } from './tools';

export type { Selection } from './handles';
export { serializeRoom } from './serialize';

/** The controller WORK-015-2's panel binds to (on `context.roomEditor` while open); it never dispatches or writes files. */
export type RoomEditor = {
  readonly open: boolean;
  draft(): Room;
  select(sel: Selection): void;
  selection(): Selection;
  commit(op: Op): boolean;
  undo(): boolean;
  redo(): boolean;
  canUndo(): boolean;
  canRedo(): boolean;
  /** Resume draft / Revert to file: the draft becomes `room` with an empty history. */
  load(room: Room): void;
  /** Every change with its cause; the panel's findings run on `commit` | `undo` | `redo` | `load` only (never a `stage` drag frame). */
  onChange(fn: (cause: ChangeCause) => void): () => void;
  /** Asks the scene to close the editor (as row 15 off / `E`). */
  close(): void;
};
export type ChangeCause = 'commit' | 'undo' | 'redo' | 'load' | 'stage' | 'select' | 'tool';
export type EditorSession = RoomEditor & { history: History; handles: Handles; adjacencyActive(): boolean; sync(): void; destroy(): void };

/** Debug row 15 / `E`: flips the request and records `ui.roomEditor {open}` (interiors only). */
export function toggleEditorRequest(context: ViewContext): void {
  if (context.store.getState().scene.kind !== 'interior') return;
  context.roomEditorRequested = !context.roomEditorRequested;
  context.log.record('ui.roomEditor', { open: context.roomEditorRequested });
}

const recordError = (context: ViewContext, message: string, error: unknown) =>
  context.log.record('app.error', { message: `${message}: ${String(error)}`, stack: (error as Error)?.stack ?? '' });

function hidePlay(scene: InteriorScene): void {
  scene.avatar.setVisible(false); scene.pet?.setVisible(false); scene.bubble?.setVisible(false);
  for (const outline of scene.outlines.values()) outline.setShown(false);
}
/** Close: the scene from state again — sprites shown, outlines per `mode`, placements at content positions. */
function restorePlay(scene: InteriorScene): void {
  scene.avatar.setVisible(true); scene.pet?.setVisible(true); scene.bubble?.setVisible(scene.bubble.current() !== null);
  const design = scene.context.store.getState().mode === 'design';
  for (const outline of scene.outlines.values()) outline.setShown(design);
  scene.syncOutlines();
  placeCharms(scene, scene.room, false);
}
/** The real placement sprites follow the draft's slot positions and depths (hidden when their slot is deleted). */
function placeCharms(scene: InteriorScene, room: Room, fillShown: boolean): void {
  for (const [slotId, sprite] of scene.charms) {
    const slot = room.slots.find(s => s.id === slotId);
    if (slot) sprite.setPosition(slot.x, slot.y).setDepth(slot.depthOverride ?? slot.y);
    sprite.setVisible(!!slot && !fillShown);
  }
}

function adjacencyTool(target: () => EditorSession) {
  let active = false, first: string | null = null;
  return {
    active: () => active, first: () => first,
    toggle() { active = !active; first = null; },
    click(slotId: string) {
      if (first === null) { first = slotId; return; }
      const a = first; first = null;
      target().commit(toggleAdjacent(a, slotId));
    },
  };
}

function pointerOf(scene: InteriorScene): { x: number; y: number } {
  const p = scene.input.activePointer;
  return p && Number.isFinite(p.worldX) && (p.worldX !== 0 || p.worldY !== 0) ? { x: p.worldX, y: p.worldY } : { x: 960, y: 700 };
}

/** TOOL-002 (a): a view-private draft of `scene.room` with handles, drag and keyboard tools; attached by the scene hook. */
export function createEditorSession(scene: InteriorScene): EditorSession {
  const { context } = scene;
  const history = createHistory(scene.room);
  const listeners = new Set<(cause: ChangeCause) => void>();
  let selection: Selection = null;
  const adjacency = adjacencyTool(() => session);
  const changed = (cause: ChangeCause, skipKey?: string) => {
    scene.preview.rebuild();
    session.handles.render(history.current(), skipKey);
    for (const fn of [...listeners]) { try { fn(cause); } catch (error) { recordError(context, 'room editor listener', error); } }
  };
  const down = (key: string) => {
    const { kind, id } = parseKey(key);
    if (adjacency.active() && (kind === 'slot' || kind === 'anchor')) { adjacency.click(id); changed('tool'); return; }
    if (kind === 'mid') { if (history.commit(insertVertex(Number(id)))) { selection = { kind: 'vertex', id: String(Number(id) + 1) }; changed('commit'); } return; }
    selection = { kind: kind === 'doorSize' ? 'door' : kind, id }; changed('select', key);
  };
  const session: EditorSession = {
    open: true, history, handles: null as unknown as Handles,
    draft: () => history.current(),
    select(sel) { selection = sel; changed('select'); },
    selection: () => selection,
    commit(op) { const ok = history.commit(op); changed('commit'); return ok; },
    undo() { const ok = history.undo(); changed('undo'); return ok; },
    redo() { const ok = history.redo(); changed('redo'); return ok; },
    canUndo: () => history.past.length > 0,
    canRedo: () => history.future.length > 0,
    load(room) { history.reset(room); selection = null; changed('load'); },
    onChange(fn) { listeners.add(fn); return () => { listeners.delete(fn); }; },
    close() { if (context.roomEditorRequested) toggleEditorRequest(context); },
    adjacencyActive: adjacency.active,
    sync() { hidePlay(scene); placeCharms(scene, history.current(), (scene.preview.layers.fill?.objects.length ?? 0) > 0); },
    destroy() { offDrag(); offKeys(); session.handles.destroy(); listeners.clear(); },
  };
  session.handles = createHandles(scene, { selection: () => selection, adjacencyFirst: adjacency.first, down });
  const target: ToolTarget = {
    draft: session.draft, selection: session.selection, select(sel: Selection, skipKey?: string) { selection = sel; changed('select', skipKey); }, commit: session.commit, undo: session.undo, redo: session.redo,
    stage(op: Op, skipKey: string) { history.stage(op); changed('stage', skipKey); },
    cancelStage() { history.cancelStage(); changed('stage'); },
    toggleAdjacencyTool() { adjacency.toggle(); changed('tool'); }, adjacencyActive: adjacency.active,
    pointer: () => pointerOf(scene), error: (message, error) => recordError(context, message, error),
  };
  const offDrag = bindDrag(scene.input, target);
  const mode = { armed: false, sizeClass: 'small' as Slot['sizeClass'] };
  const onKey = (e: KeyboardEvent) => {
    if (context.debugOpen || fieldFocused()) return;
    try { if (editorKey(e, target, mode)) e.preventDefault(); } catch (error) { recordError(context, 'room editor key', error); }
  };
  window.addEventListener('keydown', onKey);
  const offKeys = () => window.removeEventListener('keydown', onKey);
  return session;
}

export type EditorHook = { session(): EditorSession | null; draft(): Room | null; sync(): void; destroy(): void };

/**
 * The Interior's hook (order fork 3): follows `context.roomEditorRequested` each frame (as `preview.sync` does), attaches and
 * detaches the session, publishes it as `context.roomEditor`, and owns the `E` hotkey (debug panel closed, no field focused).
 */
export function createEditorHook(scene: InteriorScene): EditorHook {
  const { context } = scene;
  let session: EditorSession | null = null;
  const detach = () => {
    if (!session) return;
    session.destroy(); session = null;
    if (context.roomEditor) context.roomEditor = undefined;
    context.onRoomEditor?.(undefined);
    scene.preview.rebuild();
    restorePlay(scene);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.code !== 'KeyE' || e.repeat || e.metaKey || e.ctrlKey || e.altKey || context.debugOpen || fieldFocused()) return;
    try { toggleEditorRequest(context); } catch (error) { recordError(context, 'room editor hotkey', error); }
  };
  window.addEventListener('keydown', onKey);
  return {
    session: () => session,
    draft: () => session?.draft() ?? null,
    sync() {
      try {
        const wanted = context.roomEditorRequested === true;
        if (wanted && !session) { session = createEditorSession(scene); context.roomEditor = session; scene.preview.rebuild(); session.handles.render(session.draft()); context.onRoomEditor?.(session); }
        else if (!wanted && session) detach();
        session?.sync();
      } catch (error) { recordError(context, 'room editor sync', error); }
    },
    destroy() { window.removeEventListener('keydown', onKey); detach(); },
  };
}

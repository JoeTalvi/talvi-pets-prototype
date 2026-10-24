import type Phaser from 'phaser';
import type { Room, Slot } from '@content/schema/room';
import {
  addSlot, deleteSlot, deleteVertex, deleteWanderPoint, flipFacing, moveAnchor, moveDoor, movePoint, moveSlot, resizeDoor, type Op,
} from './draft';
import type { Selection } from './handles';

/** What the drag and key tools need from the session. */
export type ToolTarget = {
  draft(): Room;
  selection(): Selection;
  select(sel: Selection, skipKey?: string): void;
  stage(op: Op, skipKey: string): void;
  cancelStage(): void;
  commit(op: Op): boolean;
  undo(): boolean;
  redo(): boolean;
  toggleAdjacencyTool(): void;
  adjacencyActive(): boolean;
  pointer(): { x: number; y: number };
  error(message: string, error: unknown): void;
};

export const parseKey = (key: string): { kind: string; id: string } => { const i = key.indexOf(':'); return { kind: key.slice(0, i), id: key.slice(i + 1) }; };

type DragStart = { key: string; x: number; y: number; alt: boolean; room: Room };

/** The op a handle drag of (dx, dy) to (x, y) means (Alt on a slot handle moves its anchor alone). */
export function dragOp(start: DragStart, x: number, y: number): Op | null {
  const { kind, id } = parseKey(start.key), dx = x - start.x, dy = y - start.y;
  const slot = start.room.slots.find(s => s.id === id);
  const door = start.room.doors.find(d => d.id === id);
  if (kind === 'slot' && slot) return start.alt ? moveAnchor(id, slot.anchor.x + dx, slot.anchor.y + dy) : moveSlot(id, dx, dy);
  if (kind === 'anchor') return moveAnchor(id, x, y);
  if (kind === 'vertex') return movePoint('vertex', Number(id), x, y);
  if (kind === 'door') return moveDoor(id, dx, dy);
  if (kind === 'doorSize' && door) return resizeDoor(id, door.rect.w + dx, door.rect.h + dy);
  if (kind === 'doorSpawn' || kind === 'petSpawn' || kind === 'wander') return movePoint(kind, id, x, y);
  return null;
}

type DragObject = Phaser.GameObjects.GameObject & { x: number; y: number; setPosition(x: number, y: number): unknown };
const altOf = (p: Phaser.Input.Pointer) => (p.event as MouseEvent | undefined)?.altKey === true;

/** Phaser `dragstart`/`drag`/`dragend` (scene input events): the drag stages, the drop commits one history entry. */
export function bindDrag(input: Phaser.Input.InputPlugin, target: ToolTarget): () => void {
  let start: DragStart | null = null;
  const guard = (fn: () => void) => { try { fn(); } catch (error) { target.error('room editor drag', error); } };
  const onStart = (p: Phaser.Input.Pointer, o: DragObject) => guard(() => {
    const key = o.getData('key') as string | undefined;
    if (!key) return;
    start = { key, x: o.x, y: o.y, alt: altOf(p), room: target.draft() };
    target.select(parseKey(key.startsWith('doorSize') ? `door:${parseKey(key).id}` : key), key);
  });
  const onDrag = (_p: Phaser.Input.Pointer, o: DragObject, x: number, y: number) => guard(() => {
    if (!start || o.getData('key') !== start.key) return;
    o.setPosition(x, y);
    const op = dragOp(start, x, y);
    if (op) target.stage(op, start.key);
  });
  const onEnd = (_p: Phaser.Input.Pointer, o: DragObject) => guard(() => {
    if (!start || o.getData('key') !== start.key) return;
    const s = start; start = null;
    const moved = Math.round(o.x - s.x) !== 0 || Math.round(o.y - s.y) !== 0;
    const op = moved ? dragOp(s, o.x, o.y) : null;
    if (op) target.commit(op); else target.cancelStage();
  });
  input.on('dragstart', onStart); input.on('drag', onDrag); input.on('dragend', onEnd);
  return () => { input.off('dragstart', onStart); input.off('drag', onDrag); input.off('dragend', onEnd); };
}

/** Arrow nudge of the selection by (dx, dy), one commit per key-down. */
export function nudgeOp(room: Room, sel: Selection, dx: number, dy: number): Op | null {
  if (!sel) return null;
  const slot = room.slots.find(s => s.id === sel.id);
  const at = (p: { x: number; y: number } | undefined, kind: 'petSpawn' | 'wander' | 'doorSpawn' | 'vertex') => (p ? movePoint(kind, sel.id, p.x + dx, p.y + dy) : null);
  switch (sel.kind) {
    case 'slot': return moveSlot(sel.id, dx, dy);
    case 'anchor': return slot ? moveAnchor(sel.id, slot.anchor.x + dx, slot.anchor.y + dy) : null;
    case 'door': return moveDoor(sel.id, dx, dy);
    case 'vertex': return at(room.walkArea[Number(sel.id)], 'vertex');
    case 'petSpawn': return at(room.petSpawn, 'petSpawn');
    case 'wander': return at(room.wanderPoints.find(w => w.id === sel.id), 'wander');
    case 'doorSpawn': return at(room.doors.find(d => d.id === sel.id)?.spawn, 'doorSpawn');
    default: return null;
  }
}

function deleteOp(sel: Selection): Op | null {
  if (sel?.kind === 'slot' || sel?.kind === 'anchor') return deleteSlot(sel.id);
  if (sel?.kind === 'vertex') return deleteVertex(Number(sel.id));
  if (sel?.kind === 'wander') return deleteWanderPoint(sel.id);
  return null;
}
function flipOp(sel: Selection): Op | null {
  if (sel?.kind === 'slot' || sel?.kind === 'anchor') return flipFacing({ kind: 'anchor', id: sel.id });
  if (sel?.kind === 'petSpawn') return flipFacing({ kind: 'petSpawn' });
  if (sel?.kind === 'doorSpawn') return flipFacing({ kind: 'doorSpawn', id: sel.id });
  return null;
}

const ARROWS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const CLASSES: Record<string, Slot['sizeClass']> = { Digit1: 'small', Digit2: 'large', Digit3: 'wall' };
/** WORK-004-2-1 A-3: editor hotkeys ignore keys while any form field has focus (wider than the keyboard's selector). */
export const fieldFocused = () => document.activeElement?.matches('input, select, textarea, [contenteditable]') ?? false;

/** One key-down while the editor is open (debug panel closed, no field focused). Returns true when the key was the editor's. */
export function editorKey(e: KeyboardEvent, target: ToolTarget, mode: { armed: boolean; sizeClass: Slot['sizeClass'] }): boolean {
  const sel = target.selection();
  if ((e.metaKey || e.ctrlKey) && e.code === 'KeyZ') { if (e.shiftKey) target.redo(); else target.undo(); return true; }
  if (e.metaKey || e.ctrlKey) return false;
  const add = (sizeClass: Slot['sizeClass']) => { const p = target.pointer(), out = { id: '' }; mode.armed = false; if (target.commit(addSlot(sizeClass, p.x, p.y, out))) target.select({ kind: 'slot', id: out.id }); };
  if (e.code in CLASSES) { mode.sizeClass = CLASSES[e.code]; if (mode.armed) add(mode.sizeClass); return true; }
  if (e.code === 'KeyN') { if (mode.armed) add(mode.sizeClass); else mode.armed = true; return true; }
  mode.armed = false;
  const arrow = ARROWS[e.code];
  if (arrow) { const step = e.shiftKey ? 10 : 1; const op = nudgeOp(target.draft(), sel, arrow[0] * step, arrow[1] * step); if (op) target.commit(op); return true; }
  if (e.code === 'KeyF') { const op = flipOp(sel); if (op) target.commit(op); return true; }
  if (e.code === 'Delete' || e.code === 'Backspace') { const op = deleteOp(sel); if (op && target.commit(op)) target.select(null); return true; }
  if (e.code === 'KeyA') { target.toggleAdjacencyTool(); return true; }
  if (e.code === 'Escape') { if (target.adjacencyActive()) target.toggleAdjacencyTool(); else target.select(null); return true; }
  return false;
}

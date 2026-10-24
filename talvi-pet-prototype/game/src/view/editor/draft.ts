import type { Room, Slot } from '@content/schema/room';

/** TOOL-002 (a) "Draft": a view-private deep copy of the content room; the editor never writes content, state or files. */
export type RoomDraft = Room;
/** One edit: mutates the draft copy it is given; `false` refuses it (no history entry). */
export type Op = (draft: Room) => boolean | void;
export type PointKind = 'petSpawn' | 'wander' | 'doorSpawn' | 'vertex';
export type FacingTarget = { kind: 'anchor'; id: string } | { kind: 'petSpawn' } | { kind: 'doorSpawn'; id: string };

/** The draft key WORK-015-2's autosave uses (fork 6: kept in the view until `STORAGE_KEYS` gains it). */
export const draftKey = (roomId: string) => `tpp.roomDraft.${roomId}`;
export const HISTORY_LIMIT = 100;
export const cloneRoom = (room: Room): Room => structuredClone(room);
const r = Math.round;
const FLIP: Record<string, string> = { left: 'right', right: 'left', up: 'down', down: 'up' };

const slotOf = (d: Room, id: string) => d.slots.find(s => s.id === id);
const lowestFree = (taken: Set<string>, prefix: string) => { let n = 1; while (taken.has(`${prefix}${n}`)) n++; return `${prefix}${n}`; };

/** Slot drag: the base point and its anchor move together. */
export const moveSlot = (id: string, dx: number, dy: number): Op => d => {
  const s = slotOf(d, id); if (!s) return false;
  s.x = r(s.x + dx); s.y = r(s.y + dy); s.anchor.x = r(s.anchor.x + dx); s.anchor.y = r(s.anchor.y + dy);
};
/** Anchor-ghost drag (or Alt-drag on the slot): the anchor alone. */
export const moveAnchor = (id: string, x: number, y: number): Op => d => {
  const s = slotOf(d, id); if (!s) return false;
  s.anchor.x = r(x); s.anchor.y = r(y);
};
export const movePoint = (kind: PointKind, ref: string | number, x: number, y: number): Op => d => {
  const p = kind === 'petSpawn' ? d.petSpawn : kind === 'wander' ? d.wanderPoints.find(w => w.id === ref)
    : kind === 'doorSpawn' ? d.doors.find(o => o.id === ref)?.spawn : d.walkArea[Number(ref)];
  if (!p) return false;
  p.x = r(x); p.y = r(y);
};
/** Edge `i` runs from vertex i to i+1 (wrapping); the new vertex lands at its midpoint, index i+1. */
export const insertVertex = (edgeIndex: number): Op => d => {
  const n = d.walkArea.length, a = d.walkArea[edgeIndex], b = d.walkArea[(edgeIndex + 1) % n];
  if (!a || !b) return false;
  d.walkArea.splice(edgeIndex + 1, 0, { x: r((a.x + b.x) / 2), y: r((a.y + b.y) / 2) });
};
export const deleteVertex = (i: number): Op => d => {
  if (d.walkArea.length <= 3 || !d.walkArea[i]) return false;
  d.walkArea.splice(i, 1);
};
export const moveDoor = (id: string, dx: number, dy: number): Op => d => {
  const door = d.doors.find(o => o.id === id); if (!door) return false;
  door.rect.x = r(door.rect.x + dx); door.rect.y = r(door.rect.y + dy);
};
export const resizeDoor = (id: string, w: number, h: number): Op => d => {
  const door = d.doors.find(o => o.id === id); if (!door) return false;
  door.rect.w = Math.max(1, r(w)); door.rect.h = Math.max(1, r(h));
};
/** Order fork 1: ids `<sizeClass>-<n>` (lowest unused n ≥ 1), anchor at the base point facing right, wall slots on the left wall. */
export function addSlot(sizeClass: Slot['sizeClass'], x: number, y: number, out?: { id: string }): Op {
  return d => {
    const id = lowestFree(new Set(d.slots.map(s => s.id)), `${sizeClass}-`);
    const slot: Slot = { id, sizeClass, x: r(x), y: r(y), anchor: { x: r(x), y: r(y), facing: 'right' }, adjacent: [] };
    if (sizeClass === 'wall') slot.wall = 'left';
    d.slots.push(slot);
    if (out) out.id = id;
  };
}
export const deleteSlot = (id: string): Op => d => {
  const i = d.slots.findIndex(s => s.id === id); if (i < 0) return false;
  d.slots.splice(i, 1);
  for (const s of d.slots) s.adjacent = s.adjacent.filter(a => a !== id);
};
/** Adjacency is written (or removed) in both directions by construction (CHK-005-02 never fires from the tool). */
export const toggleAdjacent = (a: string, b: string): Op => d => {
  const sa = slotOf(d, a), sb = slotOf(d, b);
  if (a === b || !sa || !sb) return false;
  if (sa.adjacent.includes(b)) { sa.adjacent = sa.adjacent.filter(x => x !== b); sb.adjacent = sb.adjacent.filter(x => x !== a); }
  else { sa.adjacent.push(b); if (!sb.adjacent.includes(a)) sb.adjacent.push(a); }
};
export const addWanderPoint = (x: number, y: number): Op => d => {
  d.wanderPoints.push({ id: lowestFree(new Set(d.wanderPoints.map(w => w.id)), 'w'), x: r(x), y: r(y) });
};
export const deleteWanderPoint = (id: string): Op => d => {
  const i = d.wanderPoints.findIndex(w => w.id === id); if (i < 0) return false;
  d.wanderPoints.splice(i, 1);
};
export const flipFacing = (target: FacingTarget): Op => d => {
  const p = target.kind === 'petSpawn' ? d.petSpawn : target.kind === 'anchor' ? slotOf(d, target.id)?.anchor : d.doors.find(o => o.id === target.id)?.spawn;
  if (!p) return false;
  p.facing = FLIP[p.facing] as typeof p.facing;
};

const ROOM_FIELDS = new Set(['name', 'background', 'residentPetId']);
const blank = (v: unknown) => v === '' || v === null || v === undefined;
function setSlotField(d: Room, s: Slot, field: string, value: unknown): boolean | void {
  if (field === 'id') {
    const next = String(value);
    if (!next || slotOf(d, next)) return false;
    for (const o of d.slots) o.adjacent = o.adjacent.map(a => (a === s.id ? next : a));
    s.id = next; return;
  }
  if (field === 'sizeClass') { s.sizeClass = value as Slot['sizeClass']; return; }
  if (field === 'anchor.facing') { s.anchor.facing = value as Slot['anchor']['facing']; return; }
  if (field === 'wall') { if (blank(value)) delete s.wall; else s.wall = value as 'left' | 'right'; return; }
  if (field === 'depthOverride') { if (blank(value)) delete s.depthOverride; else s.depthOverride = r(Number(value)); return; }
  return false;
}
/**
 * The forms' edits (WORK-015-2): `name` | `background` | `residentPetId` | `slots.<id>.<field>` with field `id` (rename rewrites
 * every `adjacent` entry, order fork 2: nothing outside the room), `sizeClass`, `wall`, `depthOverride` (blank = key absent), `anchor.facing`.
 */
export const setField = (path: string, value: unknown): Op => d => {
  if (ROOM_FIELDS.has(path)) { (d as Record<string, unknown>)[path] = String(value); return; }
  const m = /^slots\.([^.]+)\.(.+)$/.exec(path);
  const s = m ? slotOf(d, m[1]) : undefined;
  if (!m || !s) return false;
  return setSlotField(d, s, m[2], value);
};

export type History = {
  readonly past: Room[];
  readonly future: Room[];
  current(): Room;
  /** A drag in progress: the op applied to the last committed room, no entry yet. */
  stage(op: Op): void;
  cancelStage(): void;
  /** One history entry (a drop, a key-down); clears `future`; the 101st entry drops the oldest. */
  commit(op: Op): boolean;
  undo(): boolean;
  redo(): boolean;
};

export function createHistory(initial: Room, limit = HISTORY_LIMIT): History {
  let current = cloneRoom(initial);
  let base: Room | null = null;
  const past: Room[] = [], future: Room[] = [];
  return {
    past, future, current: () => current,
    stage(op) { base ??= current; const next = cloneRoom(base); op(next); current = next; },
    cancelStage() { if (base) current = base; base = null; },
    commit(op) {
      const from = base ?? current; base = null;
      const next = cloneRoom(from);
      if (op(next) === false) { current = from; return false; }
      past.push(from); if (past.length > limit) past.shift();
      future.length = 0; current = next;
      return true;
    },
    undo() { this.cancelStage(); const prev = past.pop(); if (!prev) return false; future.push(current); current = prev; return true; },
    redo() { this.cancelStage(); const next = future.pop(); if (!next) return false; past.push(current); current = next; return true; },
  };
}

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Room } from '../../src/content/schema/room';
import { runContentChecks } from '../../src/sim/checks';
import { mulberry32 } from '../../src/sim/rng';
import {
  addSlot, addWanderPoint, cloneRoom, createHistory, deleteSlot, deleteVertex, deleteWanderPoint, flipFacing, insertVertex,
  moveAnchor, moveDoor, movePoint, moveSlot, resizeDoor, setField, toggleAdjacent, type Op,
} from '../../src/view/editor/draft';
import { serializeRoom } from '../../src/view/editor/serialize';

const FILE = 'src/content/rooms/dog-room.json';
const fileText = () => readFileSync(FILE, 'utf8');
const dogRoom = (): Room => JSON.parse(fileText()) as Room;
const apply = (room: Room, ...ops: Op[]) => { const d = cloneRoom(room); for (const op of ops) op(d); return d; };
const slot = (room: Room, id: string) => room.slots.find(s => s.id === id)!;

/** Every key of a plain object, recursively, in insertion order. */
const keysOf = (v: unknown): unknown => Array.isArray(v) ? v.map(keysOf)
  : v && typeof v === 'object' ? Object.entries(v).map(([k, x]) => [k, keysOf(x)]) : null;
const scramble = (v: unknown): unknown => Array.isArray(v) ? v.map(scramble)
  : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).reverse().map(([k, x]) => [k, scramble(x)])) : v;

describe('tools TOOL-002 serializer', () => {
  it('tools TOOL-002 serializer — the real dog-room.json re-serializes byte-identically', () => {
    expect(serializeRoom(dogRoom())).toBe(fileText());
  });
  it('tools TOOL-002 serializer — a scrambled-key draft serializes in RoomSchema/SlotSchema/DoorSchema/AnchorSchema order', () => {
    const scrambled = scramble(dogRoom()) as Room;
    expect(Object.keys(scrambled)[0]).toBe('residentPetId');
    expect(serializeRoom(scrambled)).toBe(fileText());
    expect(keysOf(JSON.parse(serializeRoom(scrambled)))).toEqual(keysOf(dogRoom()));
  });
  it('tools TOOL-002 serializer — optional wall/depthOverride omitted when absent; new slot and wander point appended last', () => {
    const d = apply(dogRoom(), addSlot('small', 900, 700), addWanderPoint(800, 700), setField('slots.wall-1.depthOverride', ''));
    const out = JSON.parse(serializeRoom(d)) as Room;
    expect(out.slots.at(-1)!.id).toBe('small-1');
    expect(Object.keys(out.slots.at(-1)!)).toEqual(['id', 'sizeClass', 'x', 'y', 'anchor', 'adjacent']);
    expect(Object.keys(slot(out, 'wall-1'))).toEqual(['id', 'sizeClass', 'x', 'y', 'wall', 'anchor', 'adjacent']);
    expect(out.wanderPoints.at(-1)).toEqual({ id: 'w1', x: 800, y: 700 });
    expect(serializeRoom(d).endsWith('}\n')).toBe(true);
  });
});

describe('tools TOOL-002 draft', () => {
  it('tools TOOL-002 draft — moveSlot moves base point and anchor together; moveAnchor alone; integers only', () => {
    const d = apply(dogRoom(), moveSlot('floor-3', -90.4, 0.6));
    expect([slot(d, 'floor-3').x, slot(d, 'floor-3').y, slot(d, 'floor-3').anchor.x, slot(d, 'floor-3').anchor.y]).toEqual([817, 619, 816, 650]);
    const e = apply(d, moveAnchor('floor-3', 816.2, 470.7));
    expect([slot(e, 'floor-3').x, slot(e, 'floor-3').anchor.x, slot(e, 'floor-3').anchor.y]).toEqual([817, 816, 471]);
    const f = apply(e, movePoint('petSpawn', '', 1.5, 2.4), movePoint('wander', 'centre', 3.3, 4.6), movePoint('doorSpawn', 'to-street', 5.5, 6.5), movePoint('vertex', 0, 7.2, 8.8));
    expect([f.petSpawn.x, f.petSpawn.y, f.wanderPoints[0].x, f.wanderPoints[0].y, f.doors[0].spawn.x, f.doors[0].spawn.y, f.walkArea[0].x, f.walkArea[0].y])
      .toEqual([2, 2, 3, 5, 6, 7, 7, 9]);
  });
  it('tools TOOL-002 draft — insertVertex at the edge midpoint; deleteVertex refused at 3 vertices', () => {
    const d = apply(dogRoom(), insertVertex(0));
    expect(d.walkArea).toHaveLength(7);
    expect(d.walkArea[1]).toEqual({ x: Math.round((688 + 965) / 2), y: Math.round((568 + 441) / 2) });
    const wrap = apply(dogRoom(), insertVertex(5));
    expect(wrap.walkArea[6]).toEqual({ x: Math.round((463 + 688) / 2), y: Math.round((711 + 568) / 2) });
    const three = apply(dogRoom(), deleteVertex(0), deleteVertex(0), deleteVertex(0));
    expect(three.walkArea).toHaveLength(3);
    expect(deleteVertex(0)(three)).toBe(false);
    expect(three.walkArea).toHaveLength(3);
  });
  it('tools TOOL-002 draft — door move and resize (min 1 px), integer values', () => {
    const d = apply(dogRoom(), moveDoor('to-street', 10.4, -5.6), resizeDoor('to-street', 0.2, 80.6));
    expect(d.doors[0].rect).toEqual({ x: 672, y: 545, w: 1, h: 81 });
  });
  it('tools TOOL-002 draft — addSlot ids small-1 then small-2, wall-1 taken → next free; wall slots get a wall side; wander ids w<n>', () => {
    const d = apply(dogRoom(), addSlot('small', 1, 1), addSlot('small', 2, 2), addSlot('large', 3, 3));
    expect(d.slots.slice(-3).map(s => s.id)).toEqual(['small-1', 'small-2', 'large-2']);
    expect(slot(d, 'small-1').anchor).toEqual({ x: 1, y: 1, facing: 'right' });
    const w = apply(dogRoom(), addSlot('wall', 5, 5));
    expect(w.slots.at(-1)).toMatchObject({ id: 'wall-5', sizeClass: 'wall', wall: 'left' });
    const p = apply(dogRoom(), addWanderPoint(1, 1), addWanderPoint(2, 2), deleteWanderPoint('w1'), addWanderPoint(3, 3));
    expect(p.wanderPoints.map(x => x.id)).toEqual(['centre', 'left-corner', 'right-corner', 'w2', 'w1']);
  });
});

describe('tools TOOL-002 draft (ids, facing, history)', () => {
  it('tools TOOL-002 draft — flipFacing left↔right (anchor, petSpawn) and up↔down (door spawn)', () => {
    const d = apply(dogRoom(), flipFacing({ kind: 'anchor', id: 'floor-3' }), flipFacing({ kind: 'petSpawn' }), flipFacing({ kind: 'doorSpawn', id: 'to-street' }));
    expect([slot(d, 'floor-3').anchor.facing, d.petSpawn.facing, d.doors[0].spawn.facing]).toEqual(['left', 'right', 'up']);
  });
  it('tools TOOL-002 draft — history: undo/redo order, commit clears redo, the ring holds 100 and drops the oldest', () => {
    const h = createHistory(dogRoom());
    h.commit(moveSlot('floor-3', -10, 0)); h.commit(moveSlot('floor-3', -10, 0));
    expect(slot(h.current(), 'floor-3').x).toBe(887);
    h.undo(); expect(slot(h.current(), 'floor-3').x).toBe(897);
    h.undo(); expect(slot(h.current(), 'floor-3').x).toBe(907);
    expect(h.undo()).toBe(false);
    h.redo(); expect(slot(h.current(), 'floor-3').x).toBe(897);
    h.commit(moveSlot('floor-3', 0, 1));
    expect(h.future).toHaveLength(0); expect(h.redo()).toBe(false);
    for (let i = 0; i < 120; i++) h.commit(moveSlot('floor-1', 1, 0));
    expect(h.past).toHaveLength(100);
    expect(slot(h.past[0], 'floor-1').x).toBe(567 + 20);
    expect(h.commit(deleteVertex(99))).toBe(false);
    expect(h.past).toHaveLength(100);
  });
  it('tools TOOL-002 draft — stage previews a drag without an entry; the drop commits once from the committed room', () => {
    const h = createHistory(dogRoom());
    h.stage(moveSlot('floor-3', -30, 0)); h.stage(moveSlot('floor-3', -90, 0));
    expect(slot(h.current(), 'floor-3').x).toBe(817); expect(h.past).toHaveLength(0);
    h.commit(moveSlot('floor-3', -90, 0));
    expect(slot(h.current(), 'floor-3').x).toBe(817); expect(h.past).toHaveLength(1);
    h.undo(); expect(h.current()).toEqual(dogRoom());
  });
});

const symmetric = (room: Room) => room.slots.every(s => !s.adjacent.includes(s.id)
  && s.adjacent.every(id => room.slots.find(t => t.id === id)?.adjacent.includes(s.id)));

describe('tools TOOL-002 adjacency', () => {
  const content = loadContent();
  const chk = (draft: Room) => runContentChecks({ ...content, rooms: { ...content.rooms, 'dog-room': draft } }, undefined, { room: 'dog-room', only: ['CHK-005-02'] });

  it('tools TOOL-002 adjacency — toggleAdjacent writes and removes both directions; a === b ignored; deleteSlot and id rename keep it symmetric', () => {
    const d = apply(dogRoom(), toggleAdjacent('floor-3', 'floor-2'));
    expect(slot(d, 'floor-3').adjacent).toContain('floor-2'); expect(slot(d, 'floor-2').adjacent).toContain('floor-3');
    const e = apply(d, toggleAdjacent('floor-2', 'floor-3'));
    expect(slot(e, 'floor-3').adjacent).not.toContain('floor-2'); expect(slot(e, 'floor-2').adjacent).not.toContain('floor-3');
    expect(toggleAdjacent('floor-1', 'floor-1')(cloneRoom(e))).toBe(false);
    const f = apply(d, setField('slots.floor-2.id', 'nook'), deleteSlot('floor-4'));
    expect(slot(f, 'floor-3').adjacent).toEqual(['nook']);
    expect(symmetric(f)).toBe(true);
    expect(chk(f)).toEqual([]);
  });
  it('tools TOOL-002 adjacency — 60 seeded sequences of 20 ops (toggle, add, delete, rename) stay symmetric and irreflexive; CHK-005-02 returns []', () => {
    for (let seq = 0; seq < 60; seq++) {
      let cursor = 1000 + seq;
      const draw = () => { const step = mulberry32(cursor); cursor = step.seed; return step.value; };
      const h = createHistory(dogRoom());
      for (let i = 0; i < 20; i++) {
        const ids = h.current().slots.map(s => s.id);
        const pick = () => ids[Math.floor(draw() * ids.length)];
        const k = draw();
        if (k < 0.5) h.commit(toggleAdjacent(pick(), pick()));
        else if (k < 0.7) h.commit(addSlot((['small', 'large', 'wall'] as const)[Math.floor(draw() * 3)], 900, 700));
        else if (k < 0.85) h.commit(deleteSlot(pick()));
        else h.commit(setField(`slots.${pick()}.id`, `r${seq}-${i}`));
        expect(symmetric(h.current())).toBe(true);
      }
      expect(chk(h.current())).toEqual([]);
    }
  });
});

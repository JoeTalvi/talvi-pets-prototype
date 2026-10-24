// @vitest-environment jsdom
import './setup';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import type { Room } from '../../src/content/schema/room';
import type { GameState } from '../../src/sim/state';
import { StreetScene } from '../../src/view/scenes/StreetScene';
import type { InteriorScene } from '../../src/view/scenes/InteriorScene';
import type { EditorSession } from '../../src/view/editor';
import { noPreview } from '../../src/view/preview';
import type { createSegmentsLayer } from '../../src/view/preview/segmentsLayer';
import { files, manifest } from '../content/helpers';
import { loadContent } from '../../src/content/load';
import { designIn } from '../sim/helpers';
import { bootScene, contextFor, destroyScene } from './sceneHarness';
import { designSetup, linesOf, pointer, type DesignSetup } from './designHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const real = JSON.parse(readFileSync('src/content/rooms/dog-room.json', 'utf8')) as Room;
/** FX-CONTENT-MIN with the real Dog room geometry (walk area, 12 slots, wander points, petSpawn) in play mode. */
const setup = (edit?: (state: GameState) => void) => designSetup({ mode: 'play', edit, patches: (['walkArea', 'slots', 'wanderPoints', 'petSpawn'] as const)
  .map(key => ({ file: 'rooms/dog-room.json', path: `/${key}`, value: real[key] })) });
const frame = (s: DesignSetup) => s.scene.update(0, 16);
const sessionOf = (s: DesignSetup) => s.scene.editor!.session()!;
const open = (s: DesignSetup) => { s.context.roomEditorRequested = true; frame(s); return sessionOf(s); };
const key = (code: string, extra: KeyboardEventInit = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true, ...extra }));
const keyUp = (code: string) => window.dispatchEvent(new KeyboardEvent('keyup', { code }));
const slotOf = (session: EditorSession, id: string) => session.draft().slots.find(x => x.id === id)!;
type Obj = Phaser.GameObjects.GameObject & { x: number; y: number };
const handle = (session: EditorSession, k: string) => session.handles.objects.get(k) as Obj;
function drag(s: DesignSetup, session: EditorSession, k: string, dx: number, dy: number, altKey = false): void {
  const o = handle(session, k), p = { event: { altKey } } as unknown as Phaser.Input.Pointer;
  const x0 = o.x, y0 = o.y;
  s.scene.input.emit('dragstart', p, o);
  s.scene.input.emit('drag', p, o, x0 + dx / 2, y0 + dy / 2);
  s.scene.input.emit('drag', p, o, x0 + dx, y0 + dy);
  s.scene.input.emit('dragend', p, o, false);
}
const joystickVisible = (scene: InteriorScene) => (scene.joystick as unknown as { base: { visible: boolean } }).base.visible;

describe('tools TOOL-006 row 15 / TOOL-002 entry', () => {
  it('tools TOOL-006 row 15 — roomEditorRequested opens the editor: avatar, pet, bubble, joystick and outlines hidden; context.roomEditor set', async () => {
    const s = await setup();
    frame(s);
    expect(joystickVisible(s.scene)).toBe(true);
    const session = open(s);
    frame(s);
    expect(s.context.roomEditor).toBe(session);
    expect([s.scene.avatar.visible, s.scene.pet!.visible, s.scene.bubble!.visible, joystickVisible(s.scene)]).toEqual([false, false, false, false]);
    expect([...s.scene.outlines.values()].every(o => !o.visible)).toBe(true);
    expect(session.handles.objects.get('slot:floor-3')).toBeDefined();
    expect((session.handles.objects.get('anchor:floor-3') as Phaser.GameObjects.Image).alpha).toBe(0.6);
  });
  it('tools TOOL-002 entry — E (debug closed) opens and records ui.roomEditor {open:true} once; E with the debug panel open does nothing', async () => {
    const s = await setup();
    s.context.debugOpen = true; key('KeyE'); frame(s);
    expect(s.scene.editor!.session()).toBeNull();
    s.context.debugOpen = false; key('KeyE'); frame(s);
    expect(s.scene.editor!.session()).not.toBeNull();
    expect(linesOf(s.context, 'ui.roomEditor')).toEqual([{ type: 'ui.roomEditor', open: true }]);
  });
  it('tools TOOL-002 entry — while open every tick carries move {0,0} with keys held, the store sees only tick, a tap on floor-3 records no input.tap and emits no slot.tapped', async () => {
    const s = await setup();
    open(s);
    const dispatch = vi.spyOn(s.context.store, 'dispatch');
    const emit = vi.spyOn(s.context.bus, 'emit');
    key('KeyD'); key('ArrowRight');
    for (let i = 0; i < 5; i++) frame(s);
    keyUp('KeyD'); keyUp('ArrowRight');
    const floor3 = slotOf(sessionOf(s), 'floor-3');
    pointer(s.scene, floor3.x, floor3.y - 5);
    expect(dispatch.mock.calls.map(([a]) => a.type)).toEqual(['tick', 'tick', 'tick', 'tick', 'tick']);
    expect(dispatch.mock.calls.every(([a]) => a.type === 'tick' && a.move.x === 0 && a.move.y === 0)).toBe(true);
    expect(linesOf(s.context, 'input.tap')).toEqual([]);
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('tools TOOL-002 entry (exit, street)', () => {
  it('tools TOOL-002 entry — close restores the sprites from state and the placements to content positions', async () => {
    const s = await setup(state => { state.rooms['dog-room'].placements['floor-3'] = 'lamp'; });
    const session = open(s);
    drag(s, session, 'slot:floor-3', -90, 0); frame(s);
    expect(s.scene.charms.get('floor-3')!.x).toBe(817);
    session.close(); frame(s);
    expect(s.scene.editor!.session()).toBeNull();
    expect(s.context.roomEditor).toBeUndefined();
    expect([s.scene.avatar.visible, s.scene.pet!.visible, s.scene.bubble!.visible]).toEqual([true, true, false]);
    expect([s.scene.charms.get('floor-3')!.x, s.scene.charms.get('floor-3')!.visible]).toEqual([907, true]);
    expect(linesOf(s.context, 'ui.roomEditor')).toEqual([{ type: 'ui.roomEditor', open: false }]);
    expect(s.scene.room.slots.find(x => x.id === 'floor-3')!.x).toBe(907);
  });
  it('tools TOOL-002 entry — the street ignores E and records nothing', async () => {
    const content = loadContent(manifest, files());
    const context = contextFor(content, designIn(content));
    context.store.dispatch({ type: 'reset', seed: 1 });
    await bootScene(StreetScene, context, {}, ['street/background']);
    key('KeyE');
    expect(context.roomEditorRequested).toBeUndefined();
    expect(linesOf(context, 'ui.roomEditor')).toEqual([]);
  });
});

describe('tools TOOL-002 drag', () => {
  it('tools TOOL-002 drag — floor-3 base handle by (−90, 0): x 907 → 817 and anchor.x 906 → 816 in one history entry', async () => {
    const s = await setup();
    const session = open(s);
    drag(s, session, 'slot:floor-3', -90, 0);
    expect([slotOf(session, 'floor-3').x, slotOf(session, 'floor-3').y, slotOf(session, 'floor-3').anchor.x, slotOf(session, 'floor-3').anchor.y]).toEqual([817, 618, 816, 649]);
    expect(session.history.past).toHaveLength(1);
    expect(s.scene.room.slots.find(x => x.id === 'floor-3')!.x).toBe(907);
  });
  it('tools TOOL-002 drag — Alt-drag on the slot and dragging the anchor ghost move only the anchor', async () => {
    const s = await setup();
    const session = open(s);
    drag(s, session, 'slot:floor-3', 0, -100, true);
    expect([slotOf(session, 'floor-3').x, slotOf(session, 'floor-3').y, slotOf(session, 'floor-3').anchor.y]).toEqual([907, 618, 549]);
    drag(s, session, 'anchor:floor-3', 10.4, 0);
    expect([slotOf(session, 'floor-3').x, slotOf(session, 'floor-3').anchor.x]).toEqual([907, 916]);
    expect(session.history.past).toHaveLength(2);
  });
  it('tools TOOL-002 drag — vertex drag, edge-midpoint insert and door move each commit once with integers', async () => {
    const s = await setup();
    const session = open(s);
    drag(s, session, 'vertex:0', 10.6, -4.2);
    expect(session.draft().walkArea[0]).toEqual({ x: 699, y: 564 });
    handle(session, 'mid:0').emit('pointerdown', {});
    expect(session.draft().walkArea).toHaveLength(7);
    expect(session.selection()).toEqual({ kind: 'vertex', id: '1' });
    const door = { ...session.draft().doors[0].rect }, doorId = session.draft().doors[0].id;
    drag(s, session, `door:${doorId}`, 5, 5);
    expect(session.draft().doors[0].rect).toMatchObject({ x: door.x + 5, y: door.y + 5 });
    drag(s, session, `doorSize:${doorId}`, 7, 0);
    expect(session.draft().doors[0].rect.w).toBe(door.w + 7);
    expect(session.history.past).toHaveLength(4);
  });
});

describe('tools TOOL-002 drag (keys)', () => {
  it('tools TOOL-002 drag — arrows nudge 1 px, Shift 10 px; F flips; A + two slot clicks toggles both directions; Esc clears; Cmd/Ctrl+Z and Shift walk the history; keys ignored in a text field', async () => {
    const s = await setup();
    const session = open(s);
    session.select({ kind: 'slot', id: 'floor-3' });
    key('ArrowLeft'); key('ArrowUp', { shiftKey: true });
    expect([slotOf(session, 'floor-3').x, slotOf(session, 'floor-3').y]).toEqual([906, 608]);
    key('KeyF'); expect(slotOf(session, 'floor-3').anchor.facing).toBe('left');
    key('KeyA');
    handle(session, 'slot:floor-3').emit('pointerdown', {}); handle(session, 'slot:floor-1').emit('pointerdown', {});
    expect(slotOf(session, 'floor-3').adjacent).toContain('floor-1'); expect(slotOf(session, 'floor-1').adjacent).toContain('floor-3');
    key('Escape'); expect(session.adjacencyActive()).toBe(false);
    key('Escape'); expect(session.selection()).toBeNull();
    expect(session.history.past).toHaveLength(4);
    key('KeyZ', { metaKey: true }); key('KeyZ', { ctrlKey: true });
    expect(slotOf(session, 'floor-3').anchor.facing).toBe('right');
    key('KeyZ', { metaKey: true, shiftKey: true });
    expect(slotOf(session, 'floor-3').anchor.facing).toBe('left');
    const input = document.createElement('input'); document.body.append(input); input.focus();
    key('KeyZ', { metaKey: true });
    expect(slotOf(session, 'floor-3').anchor.facing).toBe('left');
  });
  it('tools TOOL-002 drag — N then 1/2/3 adds a slot of that class (small-1, wall-5); Delete removes it', async () => {
    const s = await setup();
    const session = open(s);
    key('KeyN'); key('Digit1');
    expect(session.draft().slots.at(-1)!.id).toBe('small-1');
    key('KeyN'); key('Digit3');
    expect(session.draft().slots.at(-1)).toMatchObject({ id: 'wall-5', wall: 'left' });
    key('Delete');
    expect(session.draft().slots.map(x => x.id)).not.toContain('wall-5');
  });
});

describe('tools TOOL-002 layers', () => {
  it('tools TOOL-002 layers — segments redraw from the draft (outside count rises when floor-3 anchor leaves the walk area, back after undo); closed draws content', async () => {
    const s = await setup();
    s.context.preview = { ...noPreview(), segments: true, pets: true, fill: true }; frame(s);
    const segments = s.scene.preview.layers.segments as ReturnType<typeof createSegmentsLayer>;
    const atOpen = segments.label();
    const session = open(s);
    drag(s, session, 'slot:floor-3', -90, 0);
    drag(s, session, 'anchor:floor-3', 0, 470 - 649);
    expect(slotOf(session, 'floor-3').anchor).toMatchObject({ x: 816, y: 470 });
    const outside = (t: string) => Number(/(\d+) outside/.exec(t)![1]);
    expect(outside(segments.label())).toBeGreaterThan(outside(atOpen));
    const pets = s.scene.preview.layers.pets!.objects as Phaser.GameObjects.Image[];
    expect(pets.some(i => i.x === 816 && i.y === 470)).toBe(true);
    const fill = s.scene.preview.layers.fill as unknown as { sprites: Map<string, Obj> };
    expect(fill.sprites.get('floor-3')!.x).toBe(817);
    session.undo(); session.undo();
    expect(segments.label()).toBe(atOpen);
    drag(s, session, 'anchor:floor-3', 0, -179);
    session.close(); frame(s);
    expect(segments.label()).toBe(atOpen);
  });
});

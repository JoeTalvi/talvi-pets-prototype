// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destroyScene } from './sceneHarness';
import { designSetup, linesOf, pointer } from './designHarness';
import { outlinePoints } from '../../src/view/objects/SlotOutline';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const shown = (setup: Awaited<ReturnType<typeof designSetup>>) => [...setup.scene.outlines.values()].filter(o => o.visible).length;

describe('presentation §6.2 SlotOutline', () => {
  it('presentation §6.2 SlotOutline — 12 outlines, hidden in play, shown empty with class labels in design, depth = slot.y − 0.5', async () => {
    const setup = await designSetup({ mode: 'play' });
    const { scene, context } = setup;
    expect(scene.outlines.size).toBe(12);
    expect(shown(setup)).toBe(0);
    context.store.dispatch({ type: 'setDesignMode', on: true });
    expect(shown(setup)).toBe(12);
    const outlines = [...scene.outlines.values()];
    expect(outlines.every(o => o.outlineState === 'empty' && o.label.visible)).toBe(true);
    const labels = outlines.map(o => o.label.text);
    expect([labels.filter(l => l === 'floor').length, labels.filter(l => l === 'large').length, labels.filter(l => l === 'wall').length]).toEqual([7, 1, 4]);
    expect(scene.outlines.get('floor-3')!.depth).toBe(449.5);
    expect(scene.outlines.get('wall-1')!.depth).toBe(299.5);
    expect(scene.outlines.get('floor-3')!.input?.enabled).toBe(true);
    context.store.dispatch({ type: 'setDesignMode', on: false });
    expect(shown(setup)).toBe(0);
    expect(scene.outlines.get('floor-3')!.input?.enabled ?? false).toBe(false);
  });

  it('presentation §6.2 SlotOutline — depthOverride 1 gives depth 0.5', async () => {
    const { scene } = await designSetup({ patches: [{ file: 'rooms/dog-room.json', path: '/slots/8/depthOverride', value: 1 }] });
    expect(scene.outlines.get('wall-1')!.depth).toBe(0.5);
  });

  it('presentation §6.2 SlotOutline — placeCharm → filled (solid, no label), removeCharm → empty', async () => {
    const { scene, context } = await designSetup();
    context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    const outline = scene.outlines.get('floor-1')!;
    expect(outline.outlineState).toBe('filled');
    expect(outline.label.visible).toBe(false);
    context.store.dispatch({ type: 'removeCharm', slotId: 'floor-1' });
    expect(outline.outlineState).toBe('empty');
    expect(outline.label.visible).toBe(true);
  });

});

describe('presentation §6.2 SlotOutline geometry', () => {
  it('presentation §6.2 SlotOutline — geometry: floor diamonds 68×34 / 144×72 half-diagonals, wall 120×108 with the wall slope', () => {
    const pts = (s: Parameters<typeof outlinePoints>[0]) => outlinePoints(s).map(p => [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10]);
    expect(pts({ x: 460, y: 450, sizeClass: 'small' })).toEqual([[460, 416], [528, 450], [460, 484], [392, 450]]);
    expect(pts({ x: 1250, y: 550, sizeClass: 'large' })).toEqual([[1250, 478], [1394, 550], [1250, 622], [1106, 550]]);
    const left = outlinePoints({ x: 350, y: 300, sizeClass: 'wall', wall: 'left' });
    expect(left).toHaveLength(4);
    expect((left[1].y - left[0].y) / (left[1].x - left[0].x)).toBeCloseTo(-0.533, 3);
    expect(left[2].x - left[0].x).toBe(120);
    expect((left[2].y + left[3].y) / 2).toBeCloseTo(300, 6);
    const right = outlinePoints({ x: 350, y: 300, sizeClass: 'wall', wall: 'right' });
    expect((right[1].y - right[0].y) / (right[1].x - right[0].x)).toBeCloseTo(0.549, 3);
  });

  it('presentation §6.2 SlotOutline — selected while the chooser holds the slot (red), back to empty on close', async () => {
    const { scene, context } = await designSetup();
    pointer(scene, 460, 450);
    scene.syncOutlines();
    expect(scene.outlines.get('floor-3')!.outlineState).toBe('selected');
    context.store.dispatch({ type: 'setDesignMode', on: false });
    scene.syncOutlines();
    expect(scene.outlines.get('floor-3')!.outlineState).toBe('empty');
  });
});

describe('VERIFY-PRES-002 pointer rules', () => {
  it('VERIFY-PRES-002 partial: desktop half (jsdom, synthetic pointers through the scene handlers — GAP-5; Chrome half in design-report.json; iPhone half not-run (user, play session)) — tap on floor-3 → input.tap slot:floor-3 + slot.tapped', async () => {
    const { scene, context } = await designSetup();
    const emitted: unknown[] = [];
    context.bus.on('slot.tapped', e => emitted.push(e));
    pointer(scene, 470, 455, { ms: 200 });
    expect(linesOf(context, 'input.tap', 'input.drag')).toEqual([{ type: 'input.tap', x: 470, y: 455, target: 'slot:floor-3' }]);
    expect(emitted).toEqual([{ type: 'slot.tapped', slotId: 'floor-3', filled: false }]);
  });

  it('VERIFY-PRES-002 partial: desktop half — a 400 ms or 20 px pointer on floor-3 is input.drag and emits nothing (MEC-005 R14)', async () => {
    const { scene, context } = await designSetup();
    const emitted: unknown[] = [];
    context.bus.on('slot.tapped', e => emitted.push(e));
    pointer(scene, 460, 450, { ms: 400 });
    pointer(scene, 450, 450, { dx: 20 });
    expect(linesOf(context, 'input.tap', 'input.drag')).toEqual([
      { type: 'input.drag', target: 'slot:floor-3', dx: 0, dy: 0, ms: 400 },
      { type: 'input.drag', target: 'slot:floor-3', dx: 20, dy: 0, ms: 60 },
    ]);
    expect(emitted).toEqual([]);
    expect(linesOf(context, 'ui.chooserOpened', 'ui.sheetOpened')).toEqual([]);
  });

  it('VERIFY-PRES-002 partial: desktop half — in play mode the same tap is input.tap world and opens nothing (MEC-005 R13)', async () => {
    const { scene, context, root } = await designSetup({ mode: 'play' });
    pointer(scene, 460, 450);
    expect(linesOf(context, 'input.tap')).toEqual([{ type: 'input.tap', x: 460, y: 450, target: 'world' }]);
    expect(root.querySelector<HTMLElement>('.tpp-chooser')!.hidden).toBe(true);
    expect(linesOf(context, 'ui.chooserOpened', 'ui.sheetOpened')).toEqual([]);
  });

  it('VERIFY-PRES-002 partial: desktop half — a pointer the joystick captured produces no input.tap', async () => {
    const { scene, context } = await designSetup({ mode: 'play' });
    vi.spyOn(scene.joystick, 'active', 'get').mockReturnValue(true);
    pointer(scene, 120, 900, { id: 77 });
    expect(linesOf(context, 'input.tap', 'input.drag')).toEqual([]);
  });

  it('VERIFY-PRES-002 partial: desktop half — a tap on the Dog outside an outline targets pet:dog and dispatches only tapPet (WORK-019-1 hit area)', async () => {
    const { scene, context } = await designSetup({ mode: 'play' });
    const dispatch = vi.spyOn(context.store, 'dispatch');
    pointer(scene, scene.pet!.x, scene.pet!.y - 50);
    expect(linesOf(context, 'input.tap')[0]).toMatchObject({ target: 'pet:dog' });
    expect(dispatch.mock.calls).toEqual([[{ type: 'tapPet', petId: 'dog' }]]);
  });
});

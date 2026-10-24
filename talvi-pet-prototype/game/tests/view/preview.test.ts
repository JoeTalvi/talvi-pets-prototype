// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { loadContent } from '../../src/content/load';
import { check007 } from '../../src/sim/checks/chk-007';
import { StreetScene } from '../../src/view/scenes/StreetScene';
import type { InteriorScene } from '../../src/view/scenes/InteriorScene';
import { PREVIEW_DEPTH, previewFlagsFrom, noPreview, type PreviewFlags } from '../../src/view/preview';
import type { createFillLayer } from '../../src/view/preview/fillLayer';
import type { createGeometryLayer } from '../../src/view/preview/geometryLayer';
import { segmentsOf, type createSegmentsLayer } from '../../src/view/preview/segmentsLayer';
import { files, manifest, patchFiles } from '../content/helpers';
import { designIn } from '../sim/helpers';
import { addTexture, bootScene, contextFor, destroyScene } from './sceneHarness';
import { click, designSetup, linesOf, type DesignSetup } from './designHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

type Patch = { file: string; path: string; value: unknown };
const set = (s: { context: DesignSetup['context']; scene: { preview: { sync(): void } } }, flags: Partial<PreviewFlags>) => {
  s.context.preview = { ...noPreview(), ...flags }; s.scene.preview.sync();
};
const depthOf = (o: Phaser.GameObjects.GameObject) => (o as unknown as { depth: number }).depth;
const typesOf = (objects: readonly Phaser.GameObjects.GameObject[]) => objects.map(o => o.type);

/** FX-CONTENT-MIN Dog room in play mode with the order's charm textures (dog-bed 320×256, lamp 160×192, painting 128×128, stool 100×100). */
async function previewSetup(patches: Patch[] = []): Promise<DesignSetup> {
  const s = await designSetup({ images: ['rooms/fixture'], patches });
  addTexture(s.scene, 'charms/dog-bed', 320, 256); addTexture(s.scene, 'charms/lamp', 160, 192);
  addTexture(s.scene, 'charms/painting', 128, 128); addTexture(s.scene, 'charms/stool', 100, 100);
  return s;
}
const fillOf = (scene: InteriorScene) => scene.preview.layers.fill as ReturnType<typeof createFillLayer>;
const segmentsLayerOf = (scene: InteriorScene) => scene.preview.layers.segments as ReturnType<typeof createSegmentsLayer>;

describe('tools TOOL-002 stage 1 fill and pets layers', () => {
  it('tools TOOL-002 stage 1 fill — 12 CharmSprites at slot base points (largest loaded texture per class, depth rule kept), real placement hidden then restored', async () => {
    const s = await previewSetup();
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    const real = s.scene.charms.get('floor-1')!;
    set(s, { fill: true });
    const sprites = fillOf(s.scene).sprites;
    expect(sprites.size).toBe(12);
    for (const slot of s.scene.room.slots) {
      const sprite = sprites.get(slot.id)!;
      expect([sprite.x, sprite.y, sprite.depth]).toEqual([slot.x, slot.y, slot.depthOverride ?? slot.y]);
      expect(sprite.texture.key).toBe({ large: 'charms/dog-bed', small: 'charms/lamp', wall: 'charms/painting' }[slot.sizeClass]);
    }
    expect(real.visible).toBe(false);
    set(s, { fill: false });
    expect(sprites.size).toBe(0);
    expect(fillOf(s.scene).objects).toHaveLength(0);
    expect(real.visible).toBe(true);
  });

  it('tools TOOL-002 stage 1 fill — a class with no loaded texture draws `missing`', async () => {
    const s = await designSetup({ images: ['rooms/fixture', 'charms/lamp'] });
    set(s, { fill: true });
    expect(fillOf(s.scene).sprites.get('large-1')!.texture.key).toBe('missing');
    expect(fillOf(s.scene).sprites.get('floor-1')!.texture.key).toBe('charms/lamp');
  });

  it('tools TOOL-002 stage 1 pets — 13 α .6 idle frames (12 anchors + petSpawn), origin (0.5, 1), flipX per facing, depth = anchor y; live PetSprite unchanged', async () => {
    const s = await previewSetup([{ file: 'rooms/dog-room.json', path: '/slots/2/anchor/facing', value: 'right' }]);
    const live = s.scene.pet!; const before = [live.x, live.y, live.alpha, live.visible];
    set(s, { pets: true });
    const images = s.scene.preview.layers.pets!.objects as Phaser.GameObjects.Image[];
    const points = [...s.scene.room.slots.map(sl => sl.anchor), s.scene.room.petSpawn];
    expect(images).toHaveLength(13);
    images.forEach((image, i) => {
      expect(image.texture.key).toBe('pets/dog-sheet');
      expect(image.frame.name).toBe(live.idleFrameTexture().frame);
      expect([image.x, image.y, image.originX, image.originY, image.alpha, image.depth]).toEqual([points[i].x, points[i].y, 0.5, 1, 0.6, points[i].y]);
      expect(image.flipX).toBe(points[i].facing === 'left');
    });
    expect(images[2].flipX).toBe(false);
    expect([live.x, live.y, live.alpha, live.visible]).toEqual(before);
    set(s, { pets: false });
    expect(s.scene.preview.layers.pets!.objects).toHaveLength(0);
  });

});

describe('tools TOOL-002 stage 1 geometry layer', () => {
  it('tools TOOL-002 stage 1 geometry — interior: band, walk area, door + spawn, petSpawn, wander labels, joystick rect (scrollFactor 0), all at depth >= 10000', async () => {
    const s = await previewSetup();
    set(s, { geometry: true });
    const layer = s.scene.preview.layers.geometry as ReturnType<typeof createGeometryLayer>;
    for (const o of layer.objects) expect(depthOf(o)).toBeGreaterThanOrEqual(PREVIEW_DEPTH);
    const labels = layer.objects.filter(o => o.type === 'Text').map(o => (o as Phaser.GameObjects.Text).text);
    expect(labels).toEqual(['to-street', 'petSpawn', 'w0', 'w1', 'w2']);
    const joystick = layer.joystick()!;
    expect(joystick.scrollFactorX).toBe(0);
    expect(joystick.getData('rect')).toEqual({ x: 220 - 140, y: 1080 - 300 - 140, w: 280, h: 280 });
    expect(typesOf(layer.objects).filter(t => t === 'Graphics')).toHaveLength(2);
    set(s, { geometry: false });
    expect(layer.objects).toHaveLength(0);
  });

  it('tools TOOL-002 stage 1 geometry — play-mode slot strokes at α .5 while fill/pets/geometry is on; hidden in design mode (SlotOutline owns them)', async () => {
    const s = await designSetup({ mode: 'play', images: ['rooms/fixture'] });
    const stroke = s.scene.preview.outlineStroke!;
    expect(stroke.visible).toBe(false);
    set(s, { geometry: true });
    expect(stroke.visible).toBe(true);
    expect(stroke.depth).toBe(PREVIEW_DEPTH);
    s.context.store.dispatch({ type: 'setDesignMode', on: true });
    s.scene.preview.sync();
    expect(stroke.visible).toBe(false);
  });

  it('tools TOOL-002 stage 1 geometry — street: walk area, 2 door rects + spawns, playerSpawn, attention anchors, arrival paths, band; no segments layer', async () => {
    const content = loadContent(manifest, files());
    const context = contextFor(content, { ...designIn(content), scene: { kind: 'street' }, mode: 'play' });
    const scene = await bootScene(StreetScene, context);
    expect(Object.keys(scene.preview.layers)).toEqual(['geometry']);
    context.preview = { ...noPreview(), geometry: true, segments: true }; scene.preview.sync();
    const layer = scene.preview.layers.geometry!;
    const labels = layer.objects.filter(o => o.type === 'Text').map(o => (o as Phaser.GameObjects.Text).text);
    expect(labels).toEqual(['playerSpawn', ...content.street.houses.map(h => h.door.id)]);
    expect(content.street.houses).toHaveLength(2);
    for (const o of layer.objects) expect(depthOf(o)).toBeGreaterThanOrEqual(PREVIEW_DEPTH);
    expect(scene.preview.outlineStroke).toBeNull();
  });

});

describe('tools TOOL-002 stage 1 segments layer', () => {
  it('tools TOOL-002 stage 1 segments — CHK-007-07 set: 17 points → 136 green segments on content-min', async () => {
    const s = await previewSetup();
    set(s, { segments: true });
    const layer = segmentsLayerOf(s.scene);
    expect(layer.segments).toHaveLength(136);
    expect(layer.segments.every(seg => seg.inside)).toBe(true);
    expect(layer.label()).toBe('136 segments · 0 outside');
    for (const o of layer.objects) expect(depthOf(o)).toBeGreaterThanOrEqual(PREVIEW_DEPTH);
  });

  it('tools TOOL-002 stage 1 segments — floor-1 anchor moved to (50, 480): exactly 16 red, label "136 segments · 16 outside", equal to the checker\'s CHK-007-07 count', async () => {
    const patches = [{ file: 'rooms/dog-room.json', path: '/slots/0/anchor/x', value: 50 }];
    const s = await previewSetup(patches);
    set(s, { segments: true });
    const layer = segmentsLayerOf(s.scene);
    expect(layer.segments.filter(seg => !seg.inside)).toHaveLength(16);
    expect(layer.label()).toBe('136 segments · 16 outside');
    const content = loadContent(manifest, patchFiles(files(), patches));
    const findings = check007(content).filter(f => f.ids.includes('CHK-007-07') && f.file === 'rooms/dog-room.json');
    expect(findings).toHaveLength(16);
    expect(findings).toHaveLength(segmentsOf(content.rooms['dog-room']).filter(seg => !seg.inside).length);
  });
});

describe('mec-010 §3 row 16 preview layers', () => {
  const boxes = (s: DesignSetup) => {
    const row = [...s.root.querySelectorAll<HTMLElement>('.tpp-debug-row')].find(r => r.querySelector('label')!.textContent === 'Preview layers')!;
    return [...row.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
  };
  it('mec-010 §3 row 16 — checkboxes reflect context.preview on open; each toggle sets the flag and records ui.preview {layer, on} once', async () => {
    const s = await previewSetup();
    s.context.preview = { ...noPreview(), segments: true };
    s.panels.debugPanel.open();
    const [fill, pets, geometry, segments] = boxes(s);
    expect([fill, pets, geometry, segments].map(b => [b.disabled, b.checked])).toEqual([[false, false], [false, false], [false, false], [false, true]]);
    for (const box of [fill, pets, geometry, segments]) click(box);
    for (const box of [fill, pets, geometry, segments]) click(box);
    expect(linesOf(s.context, 'ui.preview')).toEqual([
      { type: 'ui.preview', layer: 'fill', on: true }, { type: 'ui.preview', layer: 'pets', on: true },
      { type: 'ui.preview', layer: 'geometry', on: true }, { type: 'ui.preview', layer: 'segments', on: false },
      { type: 'ui.preview', layer: 'fill', on: false }, { type: 'ui.preview', layer: 'pets', on: false },
      { type: 'ui.preview', layer: 'geometry', on: false }, { type: 'ui.preview', layer: 'segments', on: true },
    ]);
    expect(s.context.preview).toEqual({ fill: false, pets: false, geometry: false, segments: true });
    s.scene.preview.sync();
    expect(segmentsLayerOf(s.scene).segments).toHaveLength(136);
  });

  it('mec-010 §3 row 16 — ?preview=geometry,segments sets two flags at boot and records nothing; absent → null', () => {
    expect(previewFlagsFrom('?lenient=1&preview=geometry,segments,bogus')).toEqual({ fill: false, pets: false, geometry: true, segments: true });
    expect(previewFlagsFrom('?grid=1')).toBeNull();
  });
});

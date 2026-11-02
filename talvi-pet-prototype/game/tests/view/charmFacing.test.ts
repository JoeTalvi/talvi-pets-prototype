// @vitest-environment jsdom
import './setup';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { CharmTypeSchema } from '../../src/content/schema/charms';
import type { Slot } from '../../src/content/schema/room';
import type { InteriorScene } from '../../src/view/scenes/InteriorScene';
import type { createFillLayer } from '../../src/view/preview/fillLayer';
import { noPreview } from '../../src/view/preview';
import { destroyScene } from './sceneHarness';
import { designSetup } from './designHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); });

/** FX-CONTENT-MIN `picture` (index 13) is a non-painting wall type; patched to stand in for a right-facing type such as the hanging plant. */
const RIGHT_FACING = [{ file: 'charms.json', path: '/types/13/wallArtFacing', value: 'right' }];
const wallSlot = (scene: InteriorScene, wall: 'left' | 'right'): Slot => ({ ...scene.room.slots.find(s => s.id === 'wall-2')!, wall });
const flips = (scene: InteriorScene, key: string) => (['left', 'right'] as const).map(wall => scene.charmSprite(wallSlot(scene, wall), key).flipX);

describe('VERIFY-WORK-032-2-04 wall-art facing (WORK-032-2 fix 5)', () => {
  it('VERIFY-WORK-032-2-04: src/content/charms.json sets wallArtFacing "right" on hanging-plant only; the schema accepts left/right and rejects anything else', () => {
    const real = JSON.parse(readFileSync('src/content/charms.json', 'utf8')) as { types: { id: string; wallArtFacing?: string }[] };
    expect(real.types.filter(t => t.wallArtFacing !== undefined).map(t => [t.id, t.wallArtFacing])).toEqual([['hanging-plant', 'right']]);
    const base = { id: 'x', name: 'X', description: 'X.', sizeClass: 'wall', tags: [], sprite: 'charms/x' };
    expect(CharmTypeSchema.safeParse({ ...base, wallArtFacing: 'left' }).success).toBe(true);
    expect(CharmTypeSchema.safeParse({ ...base, wallArtFacing: 'right' }).success).toBe(true);
    expect(CharmTypeSchema.safeParse({ ...base, wallArtFacing: 'up' }).success).toBe(false);
  });

  it('VERIFY-WORK-032-2-04: a type drawn for the right wall is mirrored on the left wall and drawn as-is on the right', async () => {
    const { scene } = await designSetup({ patches: RIGHT_FACING, images: ['charms/picture', 'rooms/fixture'] });
    expect(flips(scene, 'charms/picture')).toEqual([true, false]);
  });

  it('VERIFY-WORK-032-2-04: a type without the field keeps the default rule flipX === (wall === "right"); floor slots never flip', async () => {
    const { scene } = await designSetup({ images: ['charms/picture', 'charms/lamp', 'rooms/fixture'] });
    expect(flips(scene, 'charms/picture')).toEqual([false, true]);
    expect(scene.charmSprite(scene.room.slots.find(s => s.id === 'floor-1')!, 'charms/lamp').flipX).toBe(false);
  });

  it('VERIFY-WORK-032-2-04: the painting keeps its projection path (no flip; projected side from the slot wall)', async () => {
    const { scene } = await designSetup({ patches: RIGHT_FACING, images: ['charms/painting', 'rooms/fixture'] });
    for (const wall of ['left', 'right'] as const) expect(scene.charmSprite(wallSlot(scene, wall), 'charms/painting').flipX).toBe(false);
  });

  it('VERIFY-WORK-032-2-04: placeCharm and the TOOL-002 fill layer reuse charmSprite, so they agree with the rule', async () => {
    const s = await designSetup({ patches: RIGHT_FACING, images: ['charms/picture', 'rooms/fixture'] });
    expect(s.scene.placeCharm('wall-2', 'picture')!.flipX).toBe(true);
    s.context.preview = { ...noPreview(), fill: true };
    s.scene.preview.sync();
    const fill = (s.scene.preview.layers.fill as ReturnType<typeof createFillLayer>).sprites;
    const wallSprites = [...fill.entries()].filter(([id]) => id.startsWith('wall-'));
    expect(wallSprites.length).toBe(4);
    expect(wallSprites.every(([, sprite]) => sprite.texture.key === 'charms/picture' && sprite.flipX === true)).toBe(true);
  });
});

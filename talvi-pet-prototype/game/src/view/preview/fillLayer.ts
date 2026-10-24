import type Phaser from 'phaser';
import type { Slot } from '@content/schema/room';
import type { ViewContext } from '../context';
import type { CharmSprite } from '../objects/CharmSprite';
import type { InteriorScene } from '../scenes/InteriorScene';
import { objectBag, roomOf, type PreviewLayer } from './layer';

/** The largest loaded charm texture of a size class by frame area (first in content order on a tie); `missing` when none is loaded. */
export function fillTextureFor(scene: Phaser.Scene, context: ViewContext, sizeClass: Slot['sizeClass']): string {
  let best = 'missing', bestArea = -1;
  for (const type of context.content.charms.types) {
    if (type.sizeClass !== sizeClass || !scene.textures.exists(type.sprite)) continue;
    const frame = scene.textures.getFrame(type.sprite);
    const area = frame.realWidth * frame.realHeight;
    if (area > bestArea) { best = type.sprite; bestArea = area; }
  }
  return best;
}

/** TOOL-002 "fill every slot" (MEC-005 Authoring needs): one CharmSprite per slot, depth rule kept; real placements hidden meanwhile. */
export function createFillLayer(): PreviewLayer & { sprites: Map<string, CharmSprite>; rehide(): void } {
  const bag = objectBag();
  const sprites = new Map<string, CharmSprite>();
  let scene: InteriorScene | null = null;
  const rehide = () => { if (scene) for (const charm of scene.charms.values()) charm.setVisible(false); };
  const hide = () => {
    bag.clear(); sprites.clear();
    if (scene) for (const charm of scene.charms.values()) charm.setVisible(true);
    scene = null;
  };
  return {
    objects: bag.objects, sprites, rehide, hide, destroy: hide,
    show(target, context) {
      scene = target as InteriorScene;
      for (const slot of roomOf(scene).slots) {
        const sprite = bag.add(scene.charmSprite(slot, fillTextureFor(scene, context, slot.sizeClass)));
        sprite.setDepth(slot.depthOverride ?? slot.y);
        sprites.set(slot.id, sprite);
      }
      rehide();
    },
  };
}

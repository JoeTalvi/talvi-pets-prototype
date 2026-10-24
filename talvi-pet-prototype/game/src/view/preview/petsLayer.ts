import type Phaser from 'phaser';
import type { InteriorScene } from '../scenes/InteriorScene';
import { objectBag, type PreviewLayer } from './layer';

export const PETS_ALPHA = 0.6;

/** TOOL-002 "pets at anchors": the resident pet's idle frame at every slot anchor (as authored) and at `petSpawn`, α .6, depth = anchor y. */
export function createPetsLayer(): PreviewLayer {
  const bag = objectBag();
  return {
    objects: bag.objects, hide: bag.clear, destroy: bag.clear,
    show(target) {
      const scene = target as InteriorScene;
      const sheet = `pets/${scene.room.residentPetId}-sheet`;
      const { key, frame } = scene.pet?.idleFrameTexture() ?? (scene.textures.exists(sheet) ? { key: sheet, frame: 0 } : { key: 'missing', frame: undefined });
      const points = [...scene.room.slots.map(s => s.anchor), scene.room.petSpawn];
      for (const anchor of points) {
        const image: Phaser.GameObjects.Image = bag.add(scene.add.image(anchor.x, anchor.y, key, frame));
        image.setOrigin(0.5, 1).setFlipX(anchor.facing === 'left').setAlpha(PETS_ALPHA).setDepth(anchor.y);
      }
    },
  };
}

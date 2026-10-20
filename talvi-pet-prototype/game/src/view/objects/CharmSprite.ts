import Phaser from 'phaser';
import { depthAtBase } from '../depth';
import { wallPictureTexture, type WallSide } from './wallPicture';
export class CharmSprite extends Phaser.GameObjects.Image {
  readonly wallProjection?: ReturnType<typeof wallPictureTexture>['evidence'];
  constructor(scene: Phaser.Scene, x: number, y: number, key: string, wall?: { side: WallSide; sourceHash: string }) {
    const projection = wall ? wallPictureTexture(scene, key, wall.sourceHash, wall.side) : undefined;
    super(scene, x, y, projection?.key ?? key);
    this.wallProjection = projection?.evidence;
    scene.add.existing(this); this.setOrigin(0.5, 1).setDepth(depthAtBase(y));
  }
}

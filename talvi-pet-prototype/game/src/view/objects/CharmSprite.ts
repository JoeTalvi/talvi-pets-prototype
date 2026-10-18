import Phaser from 'phaser';
import { depthAtBase } from '../depth';
export class CharmSprite extends Phaser.GameObjects.Image {
  constructor(scene: Phaser.Scene, x: number, y: number, key: string) { super(scene, x, y, key); scene.add.existing(this); this.setOrigin(0.5, 1).setDepth(depthAtBase(y)); }
}

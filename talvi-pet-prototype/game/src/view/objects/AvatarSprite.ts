import Phaser from 'phaser';
import { depthAtBase } from '../depth';
export class AvatarSprite extends Phaser.GameObjects.Sprite {
  constructor(scene: Phaser.Scene, x: number, y: number) { super(scene, x, y, 'player/avatar-sheet', 0); scene.add.existing(this); this.setOrigin(0.5, 1); this.sync({ x, y }); }
  sync(position: { x: number; y: number }): void { this.setPosition(position.x, position.y).setDepth(depthAtBase(position.y)); }
}

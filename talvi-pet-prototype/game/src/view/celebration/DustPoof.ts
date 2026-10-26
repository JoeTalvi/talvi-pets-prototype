import Phaser from 'phaser';
import { MISSING_TEXTURE } from '../scenes/BootScene';
import { DUST_FADE, DUST_PAD } from './timings';

/** ASSET-011 sheet and its `dust` clip (frames 0–8, 18 fps, repeat 0: 9 frames = 500 ms). */
export const DUST_SHEET = 'world/dust-poof';
export const DUST_ANIM = 'dust';

/** Presentation §7.4 `DustPoof`: covers `bounds` + 24 px per side at `depth`, plays `dust`, fades over 300 from 500 ms. */
export class DustPoof extends Phaser.GameObjects.Sprite {
  constructor(scene: Phaser.Scene, bounds: Phaser.Geom.Rectangle, depth: number) {
    const sheet = scene.textures.exists(DUST_SHEET);
    super(scene, bounds.centerX, bounds.centerY, sheet ? DUST_SHEET : MISSING_TEXTURE);
    scene.add.existing(this);
    this.setOrigin(0.5).setDepth(depth).setDisplaySize(bounds.width + 2 * DUST_PAD, bounds.height + 2 * DUST_PAD);
    if (sheet && scene.anims.exists(DUST_ANIM)) this.play(DUST_ANIM);
  }
  /** The 300 ms alpha fade that follows the 500 ms clip (the caller schedules it at DUST_CLIP and destroys at DUST_LIFETIME). */
  fade(): Phaser.Tweens.Tween { return this.scene.tweens.add({ targets: this, alpha: 0, duration: DUST_FADE }); }
}

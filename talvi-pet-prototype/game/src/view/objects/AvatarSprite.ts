import Phaser from 'phaser';
import type { Facing } from '@sim/state';
import { depthAtBase } from '../depth';

/** Presentation §6.2 / DEC-012: the sheet's side rows face right; left plays the side row flipped. */
export function avatarRow(facing: Facing): 'down' | 'up' | 'side' {
  return facing === 'left' || facing === 'right' ? 'side' : facing;
}

/** The avatar record the view reads; `facing` optional so `{ x, y }` callers keep the last known facing. */
export type AvatarPose = { x: number; y: number; facing?: Facing };

export class AvatarSprite extends Phaser.GameObjects.Sprite {
  private last: { x: number; y: number } | null = null;
  private facing: Facing = 'down';

  constructor(scene: Phaser.Scene, x: number, y: number, facing: Facing = 'down') {
    super(scene, x, y, 'player/avatar-sheet', 0);
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.sync({ x, y, facing });
  }

  /** Walk while the sim moved the avatar since the last sync, idle otherwise (presentation §6.2); facing comes from the sim. */
  sync(pose: AvatarPose): void {
    const moved = this.last !== null && (pose.x !== this.last.x || pose.y !== this.last.y);
    this.last = { x: pose.x, y: pose.y };
    this.facing = pose.facing ?? this.facing;
    this.setPosition(pose.x, pose.y).setDepth(depthAtBase(pose.y)).setFlipX(this.facing === 'left');
    const key = `avatar-${moved ? 'walk' : 'idle'}-${avatarRow(this.facing)}`;
    // Lenient boots may lack the sheet's clips: keep frame 0 rather than play a missing key.
    if (this.anims.currentAnim?.key !== key && this.scene.anims.exists(key)) this.play(key, true);
  }
}

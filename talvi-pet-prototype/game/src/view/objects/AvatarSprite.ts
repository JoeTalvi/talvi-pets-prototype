import Phaser from 'phaser';
import type { Facing } from '@sim/state';
import { depthAtBase } from '../depth';
import { BASE_AVATAR_SHEET, DEFAULT_OUTFIT_ID } from '@sim/checks/chk-010-outfits';
import { outfitClipKey } from '../anims';

/** Presentation §6.2 / DEC-012: the sheet's side rows face right; left plays the side row flipped. */
export function avatarRow(facing: Facing): 'down' | 'up' | 'side' {
  return facing === 'left' || facing === 'right' ? 'side' : facing;
}

/** The avatar record the view reads; `facing` and `outfitId` optional so `{ x, y }` callers keep the last known values. */
export type AvatarPose = { x: number; y: number; facing?: Facing; outfitId?: string };

export class AvatarSprite extends Phaser.GameObjects.Sprite {
  private last: { x: number; y: number } | null = null;
  private facing: Facing = 'down';
  private outfitId: string = DEFAULT_OUTFIT_ID;
  /** WORK-037-3 makeover (spec §10): while set, the sprite keeps showing this outfit until the swap frame. */
  private heldOutfitId: string | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, facing: Facing = 'down') {
    super(scene, x, y, BASE_AVATAR_SHEET, 0);
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    this.sync({ x, y, facing });
  }

  /** Walk while the sim moved the avatar since the last sync, idle otherwise (presentation §6.2); facing comes from the sim. */
  sync(pose: AvatarPose): void {
    const moved = this.last !== null && (pose.x !== this.last.x || pose.y !== this.last.y);
    this.last = { x: pose.x, y: pose.y };
    this.facing = pose.facing ?? this.facing;
    this.outfitId = pose.outfitId ?? this.outfitId;
    this.setPosition(pose.x, pose.y).setDepth(depthAtBase(pose.y)).setFlipX(this.facing === 'left');
    // Gate Q11: the worn outfit's key, else the default's (lenient boot without that sheet); playing it swaps the texture.
    const key = outfitClipKey(this.scene.anims, this.shownOutfitId, `${moved ? 'walk' : 'idle'}-${avatarRow(this.facing)}`);
    // Lenient boots may lack the sheet's clips: keep frame 0 rather than play a missing key.
    if (this.anims.currentAnim?.key !== key && this.scene.anims.exists(key)) this.play(key, true);
  }

  /** The outfit the sprite shows: the held one during a makeover, else the state's. */
  get shownOutfitId(): string { return this.heldOutfitId ?? this.outfitId; }

  /** WORK-037-3 makeover: hold `outfitId` on screen (the sim already wears the new one) until `hold(null)` at the swap frame. */
  hold(outfitId: string | null): void { this.heldOutfitId = outfitId; }
}

import Phaser from 'phaser';
import type { Verb } from '@content/schema/verbs';
import type { AssetEntry } from '@content/schema/assets';
import type { PetBehaviour } from '@sim/state';
import { clipKey, useClipKey } from '../anims';
import { depthAtBase } from '../depth';

/** Presentation 2026-10-21 bubble amendment: the Dog's measured offset; used when the sheet has no readable pixels. */
export const FALLBACK_BUBBLE_OFFSET = 125;
const BUBBLE_MARGIN = 14;

type Pose = Pick<PetBehaviour, 'x' | 'y' | 'facing'>;
export type ClipInput = { phase: PetBehaviour['phase']; verb: string | null };

/** First row of a frame with any non-zero alpha, or null when the pixels cannot be read (HEADLESS). */
function opaqueTop(source: CanvasImageSource, sx: number, sy: number, w: number, h: number): number | null {
  try {
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(source, sx, sy, w, h, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return Math.floor((i - 3) / 4 / w);
    return null;
  } catch { return null; }
}

/** CN-11: bubble offset = (frame height − opaque top of idle frame 0) + 14, measured from the sheet image. */
export function measureBubbleOffset(scene: Phaser.Scene, entry: AssetEntry | undefined): { offset: number; measured: boolean } {
  if (!entry?.frame || !entry.clips?.idle || !scene.textures.exists(entry.id)) return { offset: FALLBACK_BUBBLE_OFFSET, measured: false };
  const source = scene.textures.get(entry.id).getSourceImage() as CanvasImageSource & { width: number };
  const { w, h } = entry.frame, index = entry.clips.idle.start, columns = Math.max(1, Math.floor(source.width / w));
  const top = opaqueTop(source, (index % columns) * w, Math.floor(index / columns) * h, w, h);
  return top === null ? { offset: FALLBACK_BUBBLE_OFFSET, measured: false } : { offset: h - top + BUBBLE_MARGIN, measured: true };
}

/** MEC-007 view row: copies `behaviour.x/y/facing`, maps phase → clip, `depth = y`; clips switch on `pet.phaseChanged`. */
export class PetSprite extends Phaser.GameObjects.Sprite {
  readonly bubbleOffset: number;
  readonly bubbleOffsetMeasured: boolean;
  constructor(scene: Phaser.Scene, readonly petId: string, private verbs: readonly Verb[], entry: AssetEntry | undefined, behaviour: PetBehaviour) {
    const key = `pets/${petId}-sheet`;
    super(scene, behaviour.x, behaviour.y, scene.textures.exists(key) ? key : 'missing', 0);
    scene.add.existing(this);
    this.setOrigin(0.5, 1);
    const measure = measureBubbleOffset(scene, entry);
    this.bubbleOffset = measure.offset; this.bubbleOffsetMeasured = measure.measured;
    this.sync(behaviour);
    this.setClip(this.clipFor(behaviour));
  }
  sync(pose: Pose): void {
    this.setPosition(pose.x, pose.y).setFlipX(pose.facing === 'left').setDepth(depthAtBase(pose.y));
  }
  clipFor(input: ClipInput): string {
    const sheet = `pets/${this.petId}-sheet`;
    if (input.phase === 'walking') return clipKey(sheet, 'walk')!;
    const verb = input.phase === 'using' ? this.verbs.find(v => v.id === input.verb) : undefined;
    if (verb) return useClipKey(this.scene.anims, this.petId, verb);
    return clipKey(sheet, 'idle')!;
  }
  setClip(key: string): void {
    if (this.scene.anims.exists(key)) this.play(key, true);
  }
  bubbleAnchor(): { x: number; y: number } { return { x: this.x, y: this.y - this.bubbleOffset }; }
  /** Frame 0 of the idle clip for still previews (WORK-014-4 pets-at-anchors, WORK-019). */
  idleFrameTexture(): { key: string; frame: string | number } {
    const idle = this.scene.anims.get(this.clipFor({ phase: 'idle', verb: null }));
    const first = idle?.frames[0]?.frame;
    return { key: this.texture.key, frame: first?.name ?? 0 };
  }
}

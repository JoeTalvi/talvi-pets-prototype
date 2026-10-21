import type Phaser from 'phaser';
import type { Clip } from '@content/schema/assets';
import type { Verb } from '@content/schema/verbs';
export type SheetEntry = { id: string; clips?: Record<string, Clip> };
/** Animation key per assets.md §1.4: `pet-<petId>-<clip>`, `avatar-<clip>`, and the dust sheet's bare `dust`. */
export function clipKey(sheetId: string, clip: string): string | undefined {
  const pet = /^pets\/(.+)-sheet$/.exec(sheetId);
  if (pet) return `pet-${pet[1]}-${clip}`;
  if (sheetId === 'player/avatar-sheet') return `avatar-${clip}`;
  if (sheetId === 'world/dust-poof') return clip;
  return undefined;
}
/** Creates each clip's animation once; explicit frameDurationsMs (CN-07) become per-frame durations, else frameRate applies. */
export function registerClips(scene: Phaser.Scene, entry: SheetEntry): string[] {
  const created: string[] = [];
  for (const [name, clip] of Object.entries(entry.clips ?? {})) {
    const key = clipKey(entry.id, name);
    if (!key || scene.anims.exists(key)) continue;
    const frames = scene.anims.generateFrameNumbers(entry.id, { start: clip.start, end: clip.end });
    if (frames.length !== clip.end - clip.start + 1) throw new Error(`${entry.id}: clip ${name} frames ${clip.start}–${clip.end} missing from loaded texture`);
    clip.frameDurationsMs?.forEach((duration, i) => { frames[i].duration = duration; });
    scene.anims.create({ key, frames, frameRate: clip.frameRate, repeat: clip.repeat });
    created.push(key);
  }
  return created;
}
/** CN-12: the `using` phase plays `pet-<petId>-<verb.clip>`; a pet whose sheet lacks that row falls back to `pet-<petId>-use-sit`. */
export function useClipKey(anims: { exists(key: string): boolean }, petId: string, verb: Pick<Verb, 'clip'>): string {
  const key = clipKey(`pets/${petId}-sheet`, verb.clip)!;
  return anims.exists(key) ? key : clipKey(`pets/${petId}-sheet`, 'use-sit')!;
}

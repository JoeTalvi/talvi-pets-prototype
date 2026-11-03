import type Phaser from 'phaser';
import type { Clip } from '@content/schema/assets';
import type { Verb } from '@content/schema/verbs';
import { BASE_AVATAR_SHEET, DEFAULT_OUTFIT_ID as DEFAULT_OUTFIT } from '@sim/checks/chk-010-outfits';
export type SheetEntry = { id: string; clips?: Record<string, Clip> };
/** WORK-037-3 (gate Q11): avatar sheet id → outfit id, from `content.outfits`; the base sheet is always `default`. */
export type AvatarSheets = Readonly<Record<string, string>>;
export function avatarSheetsOf(outfits: readonly { id: string; sheet: string }[] | undefined): AvatarSheets {
  const sheets: Record<string, string> = { [BASE_AVATAR_SHEET]: DEFAULT_OUTFIT };
  for (const outfit of outfits ?? []) sheets[outfit.sheet] = outfit.id;
  return sheets;
}
/** Per-outfit avatar key (gate Q11): `avatar-<outfitId>-<clip>`. */
export const avatarKey = (outfitId: string, clip: string): string => `avatar-${outfitId}-${clip}`;
/**
 * Animation key per assets.md §1.4: `pet-<petId>-<clip>`, `avatar-<outfitId>-<clip>` (WORK-037-3; the base sheet is
 * `avatar-default-<clip>`), and the dust sheet's bare `dust`.
 */
export function clipKey(sheetId: string, clip: string, avatarSheets: AvatarSheets = avatarSheetsOf(undefined)): string | undefined {
  const pet = /^pets\/(.+)-sheet$/.exec(sheetId);
  if (pet) return `pet-${pet[1]}-${clip}`;
  const outfitId = avatarSheets[sheetId];
  if (outfitId !== undefined) return avatarKey(outfitId, clip);
  if (sheetId === 'world/dust-poof') return clip;
  return undefined;
}
/** The worn outfit's key, or the default outfit's when that outfit's clips are absent (lenient boot, gate Q11). */
export function outfitClipKey(anims: { exists(key: string): boolean }, outfitId: string, clip: string): string {
  const key = avatarKey(outfitId, clip);
  return anims.exists(key) ? key : avatarKey(DEFAULT_OUTFIT, clip);
}
/** Creates each clip's animation once; explicit frameDurationsMs (CN-07) become per-frame durations, else frameRate applies. */
export function registerClips(scene: Phaser.Scene, entry: SheetEntry, avatarSheets?: AvatarSheets): string[] {
  const created: string[] = [];
  for (const [name, clip] of Object.entries(entry.clips ?? {})) {
    const key = clipKey(entry.id, name, avatarSheets);
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

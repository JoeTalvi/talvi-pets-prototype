// @vitest-environment jsdom
import './setup';
import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AssetManifest } from '../../src/content/schema/assets';
import { avatarSheetsOf, clipKey, outfitClipKey, registerClips, useClipKey } from '@view/anims';
import { VerbsSchema } from '../../src/content/schema/verbs';
import { createGame, destroyGame } from './helper';
const manifest = AssetManifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
afterEach(() => destroyGame());
function addSheet(scene: Phaser.Scene, id: string) {
  const e = manifest.entries.find(x => x.id === id)!, canvas = document.createElement('canvas');
  canvas.width = e.px!.w; canvas.height = e.px!.h;
  scene.textures.addSpriteSheet(id, canvas as unknown as HTMLImageElement, { frameWidth: e.frame!.w, frameHeight: e.frame!.h });
  return e;
}
it('derives §1.4 animation keys', () => {
  expect(clipKey('pets/dog-sheet', 'idle')).toBe('pet-dog-idle');
  expect(clipKey('player/avatar-sheet', 'walk-side')).toBe('avatar-default-walk-side');
  // WORK-037-3 (Q11): outfit sheets are keyed by the outfit id from content.outfits
  const sheets = avatarSheetsOf([{ id: 'default', sheet: 'player/avatar-sheet' }, { id: 'cosy', sheet: 'player/avatar-cosy-sheet' }]);
  expect(clipKey('player/avatar-cosy-sheet', 'idle-down', sheets)).toBe('avatar-cosy-idle-down');
  expect(clipKey('player/avatar-cosy-sheet', 'idle-down')).toBeUndefined();
  expect(clipKey('world/dust-poof', 'dust')).toBe('dust');
  expect(clipKey('charms/lamp', 'idle')).toBeUndefined();
});
it('VERIFY-ASSET-005 HEADLESS: dog clips register once with explicit idle durations', async () => {
  const scene = await createGame(), dog = addSheet(scene, 'pets/dog-sheet');
  const keys = ['pet-dog-idle', 'pet-dog-walk', 'pet-dog-use-sit', 'pet-dog-react', 'pet-dog-use-lie', 'pet-dog-use-look'];
  expect(registerClips(scene, dog)).toEqual(keys);
  for (const key of keys) expect(scene.anims.exists(key)).toBe(true);
  expect(scene.anims.exists('pet-dog-use')).toBe(false);
  const idle = scene.anims.get('pet-dog-idle')!;
  expect(idle.frames.map(f => f.duration)).toEqual([2600, 80, 120, 80]);
  expect(idle.frames.map(f => f.frame.name)).toEqual([0, 1, 2, 3]);
  expect(idle.repeat).toBe(-1);
  const walk = scene.anims.get('pet-dog-walk')!;
  expect(walk.frameRate).toBe(10);
  expect(walk.frames.map(f => f.duration)).toEqual([0, 0, 0, 0, 0, 0]);
  for (const [key, first] of [['pet-dog-use-sit', 12], ['pet-dog-use-lie', 24], ['pet-dog-use-look', 30]] as const) {
    const use = scene.anims.get(key)!;
    expect(use.frames.map(f => f.frame.name)).toEqual([first, first + 1, first + 2, first + 3]);
    expect([use.frameRate, use.repeat]).toEqual([4, -1]);
  }
  expect(registerClips(scene, dog)).toEqual([]);
});
const verbs = VerbsSchema.parse(JSON.parse(readFileSync('src/content/verbs.json', 'utf8'))).verbs;
it('CN-12: the using clip follows the verb (nap → lie, sit-on → sit, look-at → look; perch → use-perch, which the Dog sheet lacks → use-sit)', async () => {
  const scene = await createGame();
  registerClips(scene, addSheet(scene, 'pets/dog-sheet'));
  expect(Object.fromEntries(verbs.map(v => [v.id, useClipKey(scene.anims, 'dog', v)]))).toEqual({
    nap: 'pet-dog-use-lie', 'sit-on': 'pet-dog-use-sit', 'look-at': 'pet-dog-use-look', perch: 'pet-dog-use-sit' });
});
it('CN-12: a pet whose sheet lacks the verb clip falls back to use-sit', async () => {
  const scene = await createGame(), dog = addSheet(scene, 'pets/dog-sheet'), canvas = document.createElement('canvas');
  canvas.width = dog.px!.w; canvas.height = dog.px!.h;
  scene.textures.addSpriteSheet('pets/owl-sheet', canvas as unknown as HTMLImageElement, { frameWidth: 256, frameHeight: 256 });
  expect(registerClips(scene, { id: 'pets/owl-sheet', clips: { 'use-sit': dog.clips!['use-sit'] } })).toEqual(['pet-owl-use-sit']);
  const nap = verbs.find(v => v.id === 'nap')!;
  expect(useClipKey(scene.anims, 'owl', nap)).toBe('pet-owl-use-sit');
  expect(useClipKey(scene.anims, 'owl', { clip: 'use-look' })).toBe('pet-owl-use-sit');
});
it('VERIFY-ASSET-005 / gate fork Q-A HEADLESS: owl perch maps to pet-owl-use-perch (frames 36–39) when the ledgered sheet declares the row, else pet-owl-use-sit', async () => {
  const perch = verbs.find(v => v.id === 'perch')!;
  expect(perch.clip).toBe('use-perch');
  const scene = await createGame(), owl = addSheet(scene, 'pets/owl-sheet');
  expect(useClipKey(scene.anims, 'owl', perch)).toBe('pet-owl-use-sit');
  expect(registerClips(scene, owl)).toContain('pet-owl-use-perch');
  expect(scene.anims.get('pet-owl-use-perch')!.frames.map(f => f.frame.name)).toEqual([36, 37, 38, 39]);
  expect(useClipKey(scene.anims, 'owl', perch)).toBe('pet-owl-use-perch');
});
it('registers avatar and dust keys with frameRate timing', async () => {
  const scene = await createGame();
  expect(registerClips(scene, addSheet(scene, 'player/avatar-sheet'))).toEqual(['avatar-default-idle-down', 'avatar-default-idle-up', 'avatar-default-idle-side', 'avatar-default-walk-down', 'avatar-default-walk-up', 'avatar-default-walk-side']);
  expect(scene.anims.get('avatar-default-walk-side')!.frameRate).toBe(10);
  expect(scene.anims.get('avatar-default-idle-down')!.frames.map(f => f.duration)).toEqual([2600, 80, 120, 80]);
  expect(registerClips(scene, addSheet(scene, 'world/dust-poof'))).toEqual(['dust']);
  expect(scene.anims.get('dust')!.frameRate).toBe(18);
});

it('WORK-037-3 (Q11): every outfit sheet registers avatar-<outfitId>-<clip>; a missing outfit falls back to the default keys', async () => {
  const scene = await createGame();
  const sheets = avatarSheetsOf(JSON.parse(readFileSync('src/content/outfits.json', 'utf8')).outfits);
  for (const id of ['player/avatar-sheet', 'player/avatar-cosy-sheet', 'player/avatar-garden-sheet']) registerClips(scene, addSheet(scene, id), sheets);
  for (const outfit of ['default', 'cosy', 'garden']) for (const clip of ['idle', 'walk']) for (const row of ['down', 'up', 'side'])
    expect(scene.anims.exists(`avatar-${outfit}-${clip}-${row}`)).toBe(true);
  expect(outfitClipKey(scene.anims, 'cosy', 'walk-up')).toBe('avatar-cosy-walk-up');
  expect(outfitClipKey(scene.anims, 'unknown', 'walk-up')).toBe('avatar-default-walk-up');
});

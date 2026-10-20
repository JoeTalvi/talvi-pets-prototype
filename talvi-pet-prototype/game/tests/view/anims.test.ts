// @vitest-environment jsdom
import './setup';
import { afterEach, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { AssetManifest } from '../../src/content/schema/assets';
import { clipKey, registerClips } from '@view/anims';
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
  expect(clipKey('player/avatar-sheet', 'walk-side')).toBe('avatar-walk-side');
  expect(clipKey('world/dust-poof', 'dust')).toBe('dust');
  expect(clipKey('charms/lamp', 'idle')).toBeUndefined();
});
it('VERIFY-ASSET-005 HEADLESS: dog clips register once with explicit idle durations', async () => {
  const scene = await createGame(), dog = addSheet(scene, 'pets/dog-sheet');
  expect(registerClips(scene, dog)).toEqual(['pet-dog-idle', 'pet-dog-walk', 'pet-dog-use', 'pet-dog-react']);
  for (const key of ['pet-dog-idle', 'pet-dog-walk', 'pet-dog-use', 'pet-dog-react']) expect(scene.anims.exists(key)).toBe(true);
  const idle = scene.anims.get('pet-dog-idle')!;
  expect(idle.frames.map(f => f.duration)).toEqual([2600, 80, 120, 80]);
  expect(idle.frames.map(f => f.frame.name)).toEqual([0, 1, 2, 3]);
  expect(idle.repeat).toBe(-1);
  const walk = scene.anims.get('pet-dog-walk')!;
  expect(walk.frameRate).toBe(10);
  expect(walk.frames.map(f => f.duration)).toEqual([0, 0, 0, 0, 0, 0]);
  expect(registerClips(scene, dog)).toEqual([]);
});
it('registers avatar and dust keys with frameRate timing', async () => {
  const scene = await createGame();
  expect(registerClips(scene, addSheet(scene, 'player/avatar-sheet'))).toEqual(['avatar-idle']);
  expect(registerClips(scene, addSheet(scene, 'world/dust-poof'))).toEqual(['dust']);
  expect(scene.anims.get('dust')!.frameRate).toBe(18);
});

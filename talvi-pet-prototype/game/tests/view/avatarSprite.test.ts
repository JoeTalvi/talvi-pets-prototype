// @vitest-environment jsdom
import './setup';
import Phaser from 'phaser';
import { afterEach, describe, expect, it } from 'vitest';
import { registerClips, type SheetEntry } from '../../src/view/anims';
import { AvatarSprite, avatarRow } from '../../src/view/objects/AvatarSprite';
import { StreetScene } from '../../src/view/scenes/StreetScene';
import type { GameState } from '../../src/sim/state';
import { parseSaveValue } from '../../src/sim/state.schema';
import type { Content } from '../../src/content/types';
import { validContent } from '../content/helpers';
import { fixtureText } from '../app/helpers';
import { createGame, destroyGame } from './helper';
import { addTexture, bootScene, contextFor, destroyScene, realManifest } from './sceneHarness';

afterEach(() => { destroyGame(); destroyScene(); document.body.replaceChildren(); });

const sheet = realManifest.entries.find(e => e.id === 'player/avatar-sheet')!;
/** The real ASSET-016 sheet geometry and clips, registered as BootScene.create does. */
function withAvatarClips(scene: Phaser.Scene): void {
  addTexture(scene, sheet.id, sheet.px!.w, sheet.px!.h, sheet.frame);
  registerClips(scene, sheet as SheetEntry);
}
const playing = (a: AvatarSprite) => [a.anims.currentAnim?.key, a.flipX];

describe('presentation §6.2 avatar clips (ASSET-016; DEC-012 left = side flipped)', () => {
  it('maps the sim facing to the sheet rows', () => {
    expect(['down', 'up', 'left', 'right'].map(f => avatarRow(f as 'down'))).toEqual(['down', 'up', 'side', 'side']);
  });

  it('idles when the position is unchanged, walks while it moved, flips only for left, and returns to the matching idle', async () => {
    const scene = await createGame(); withAvatarClips(scene);
    const avatar = new AvatarSprite(scene, 700, 910);
    expect(playing(avatar)).toEqual(['avatar-idle-down', false]);
    avatar.sync({ x: 700, y: 905, facing: 'up' });
    expect(playing(avatar)).toEqual(['avatar-walk-up', false]);
    avatar.sync({ x: 695, y: 905, facing: 'left' });
    expect(playing(avatar)).toEqual(['avatar-walk-side', true]);
    avatar.sync({ x: 700, y: 905, facing: 'right' });
    expect(playing(avatar)).toEqual(['avatar-walk-side', false]);
    avatar.sync({ x: 700, y: 905, facing: 'right' });
    expect(playing(avatar)).toEqual(['avatar-idle-side', false]);
    avatar.sync({ x: 700, y: 910, facing: 'down' });
    expect(playing(avatar)).toEqual(['avatar-walk-down', false]);
    expect([avatar.x, avatar.y, avatar.depth]).toEqual([700, 910, 910]);
  });

  it('does not restart a clip that is already playing, and keeps the last facing for a { x, y } caller', async () => {
    const scene = await createGame(); withAvatarClips(scene);
    const avatar = new AvatarSprite(scene, 100, 900);
    avatar.sync({ x: 110, y: 900, facing: 'left' });
    const progress = (avatar.anims.nextTick = 12345);
    avatar.sync({ x: 120, y: 900 });
    expect(playing(avatar)).toEqual(['avatar-walk-side', true]);
    expect(avatar.anims.nextTick).toBe(progress);
  });

  it('lenient boot: with no avatar clips registered the sprite keeps frame 0 and plays nothing', async () => {
    const scene = await createGame();
    addTexture(scene, sheet.id, sheet.px!.w, sheet.px!.h, sheet.frame);
    const avatar = new AvatarSprite(scene, 100, 900);
    avatar.sync({ x: 130, y: 900, facing: 'right' });
    expect(avatar.anims.currentAnim).toBeNull();
    expect(avatar.frame.name).toBe(0);
  });
});

describe('presentation §6.2 avatar clips in-scene', () => {
  it('in-scene: StreetScene.update ticks the sim from the keyboard and the avatar walks with the sim facing, then idles', async () => {
    const content: Content = validContent();
    const saved = (parseSaveValue(content, JSON.parse(fixtureText('save-v1.milestone.json'))) as { state: GameState }).state;
    // Unfrozen street (inputFrozen: no dialogue, celebration or arrival) so the keyboard reaches the tick.
    const context = contextFor(content, { ...saved, dialogue: { ...saved.dialogue, current: null }, celebration: null, arrival: null, mode: 'play' } as GameState);
    const scene = await bootScene(StreetScene, context, {}, ['houses/fixture']);
    withAvatarClips(scene);
    scene.cameras.main.emit('camerafadeincomplete');
    const x0 = context.store.getState().avatar.x;
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyA' }));
    for (let i = 0; i < 10; i++) scene.update(0, 16);
    expect(context.store.getState().avatar.facing).toBe('left');
    expect(scene.avatar.x).toBeLessThan(x0);
    expect(playing(scene.avatar)).toEqual(['avatar-walk-side', true]);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyA' }));
    scene.update(0, 16); scene.update(0, 16);
    expect(playing(scene.avatar)).toEqual(['avatar-idle-side', true]);
    context.keyboard.destroy();
  });
});

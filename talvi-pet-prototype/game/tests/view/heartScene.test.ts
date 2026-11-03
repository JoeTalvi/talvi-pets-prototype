// @vitest-environment jsdom
import './setup';
import Phaser from 'phaser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../src/content/load';
import { initialState } from '../../src/sim/state';
import { StreetScene } from '../../src/view/scenes/StreetScene';
import { directorClock, phaserClock } from '../../src/view/celebration/CelebrationDirector';
import { CONFETTI_DEPTH } from '../../src/view/celebration/Confetti';
import { HEART_MOMENT_END } from '../../src/view/celebration/heartMoment';
import { HEART_MOMENT, HEART_PET_DEPTH } from '../../src/view/celebration/timings';
import { addTexture, bootScene, contextFor, destroyScene, realManifest } from './sceneHarness';
import { designSetup, linesOf } from './designHarness';

beforeEach(() => { directorClock.create = () => ({ now: () => 0, after: () => () => {} }); });
afterEach(() => { vi.useRealTimers(); destroyScene(); document.body.replaceChildren(); directorClock.create = phaserClock; });

const emitters = (scene: Phaser.Scene) => scene.children.list.filter(c => c instanceof Phaser.GameObjects.Particles.ParticleEmitter);
const bigPet = (pet: Phaser.GameObjects.Sprite | null) => pet && [pet.anims.currentAnim?.key, pet.depth, pet.scrollFactorX, pet.scale];

describe('VERIFY-WORK-038-1-09 Heart scene seam (fork (a): scene-generic scene half)', () => {
  it('Interior: heart.earned mounts the ×2 react pet and the confetti exactly as before; charmAt exposes the room charm; the overlay end removes the pet', async () => {
    const s = await designSetup();
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    expect(linesOf(s.context, 'heart.earned')).toHaveLength(1);
    expect(bigPet(s.scene.heartPet)).toEqual(['pet-dog-react', HEART_PET_DEPTH, 0, HEART_MOMENT.petScale]);
    expect(emitters(s.scene).map(e => (e as Phaser.GameObjects.Particles.ParticleEmitter).depth)).toEqual([CONFETTI_DEPTH]);
    expect(s.scene.charmAt('large-1')?.texture.key).toBe(s.scene.charms.get('large-1')!.texture.key);
    expect(s.scene.charmAt('no-such-slot')).toBeUndefined();
    window.dispatchEvent(new Event(HEART_MOMENT_END));
    expect(s.scene.heartPet).toBeNull();
  });

  it('Interior: with no moment end the scene half removes its pet at HEART_MOMENT.totalMs', async () => {
    const s = await designSetup();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    // The overlay half ends at the same total; either way the big pet is gone.
    vi.advanceTimersByTime(HEART_MOMENT.totalMs - 1);
    expect(s.scene.heartPet).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(s.scene.heartPet).toBeNull();
  });

  it('Street: the mate (arrived at the garden) earning a Heart mounts the mate ×2 react pet and the confetti; teardown removes it', async () => {
    const content = loadContent();
    const context = contextFor(content, initialState(content, 1));
    context.manifest = realManifest;
    const scene = await bootScene(StreetScene, context, {}, ['world/site-garden-empty', 'world/site-garden-base']);
    const mate = realManifest.entries.find(e => e.id === 'pets/owl-mate-sheet')!;
    addTexture(scene, mate.id, mate.px!.w, mate.px!.h, mate.frame);
    scene.cameras.main.emit('camerafadeincomplete');
    context.store.dispatch({ type: 'debugUnlockSpace', siteId: 'garden' });
    context.store.dispatch({ type: 'debugFillSpace', siteId: 'garden' });
    const sync = scene as unknown as { syncScene(ms: number): void };
    for (let t = 0; t < 20000 && context.store.getState().siteArrival !== null; t += 10) sync.syncScene(10);
    expect(scene.pet?.petId).toBe('owl-mate');
    expect(scene.heartPet).toBeNull();
    context.store.dispatch({ type: 'debugFulfilActiveWant', petId: 'owl-mate' });
    expect(linesOf(context, 'heart.earned').at(-1)).toEqual(expect.objectContaining({ petId: 'owl-mate', hearts: 1 }));
    expect(bigPet(scene.heartPet)).toEqual(['pet-owl-mate-react', HEART_PET_DEPTH, 0, HEART_MOMENT.petScale]);
    expect(emitters(scene).some(e => (e as Phaser.GameObjects.Particles.ParticleEmitter).depth === CONFETTI_DEPTH)).toBe(true);
    window.dispatchEvent(new Event(HEART_MOMENT_END));
    expect(scene.heartPet).toBeNull();
  });
});

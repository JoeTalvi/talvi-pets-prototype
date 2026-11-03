// @vitest-environment jsdom
import './setup';
import Phaser from 'phaser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerClips, type SheetEntry } from '../../src/view/anims';
import { AvatarSprite } from '../../src/view/objects/AvatarSprite';
import { directorClock, phaserClock } from '../../src/view/celebration/CelebrationDirector';
import { DustPoof } from '../../src/view/celebration/DustPoof';
import { playMakeover, SPARKLE_COUNT } from '../../src/view/celebration/makeover';
import { OUTFIT, SFX_VOLUMES } from '../../src/view/celebration/timings';
import { createGame, destroyGame } from './helper';
import { addTexture, realManifest } from './sceneHarness';

/** A manual scene clock (the WORK-038 test pattern): `advance(ms)` runs every due timer in time order, nested ones included. */
function manualClock() {
  let now = 0, seq = 0;
  const timers: { at: number; seq: number; fn: () => void; live: boolean }[] = [];
  directorClock.create = () => ({
    now: () => now,
    after: (ms, fn) => { const t = { at: now + ms, seq: seq++, fn, live: true }; timers.push(t); return () => { t.live = false; }; },
  });
  return {
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = timers.filter(t => t.live && t.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
        if (!due) break;
        due.live = false; now = due.at; due.fn();
      }
      now = end;
    },
  };
}
const sheets = { 'player/avatar-sheet': 'default', 'player/avatar-cosy-sheet': 'cosy', 'player/avatar-garden-sheet': 'garden' };
async function setup() {
  const scene = await createGame();
  for (const id of Object.keys(sheets)) {
    const entry = realManifest.entries.find(e => e.id === id)!;
    addTexture(scene, entry.id, entry.px!.w, entry.px!.h, entry.frame);
    registerClips(scene, entry as SheetEntry, sheets);
  }
  const avatar = new AvatarSprite(scene, 700, 900);
  const plays: [string, unknown][] = [];
  const audio = { play: (id: string, opts?: unknown) => { plays.push([id, opts]); } };
  return { scene, avatar, plays, audio: () => audio };
}
const emitters = (scene: Phaser.Scene) => scene.children.list.filter(c => c instanceof Phaser.GameObjects.Particles.ParticleEmitter) as Phaser.GameObjects.Particles.ParticleEmitter[];
const poofs = (scene: Phaser.Scene) => scene.children.list.filter(c => c instanceof DustPoof);

let clock: ReturnType<typeof manualClock>;
beforeEach(() => { clock = manualClock(); });
afterEach(() => { destroyGame(); directorClock.create = phaserClock; vi.unstubAllGlobals(); });

describe('VERIFY-WORK-037-3 makeover on the avatar (gate Q12; spec §10; §C OUTFIT 300 / 300 / 470)', () => {
  it('riser at 0, shiver over 0–300, dust at 300, the swap + phasePop + 12 sparkles at 470, no sound before its frame', async () => {
    const { scene, avatar, plays, audio } = await setup();
    playMakeover(scene, avatar, 'default', audio);
    avatar.sync({ x: 700, y: 900, outfitId: 'cosy' });   // the sim already wears cosy
    expect(plays).toEqual([['riser', { volume: SFX_VOLUMES.riser }]]);
    expect(avatar.shownOutfitId).toBe('default');
    expect(scene.tweens.getTweensOf(avatar)).toHaveLength(1);
    expect((scene.tweens.getTweensOf(avatar)[0].data[0] as Phaser.Tweens.TweenData).key).toBe('offsetX');
    clock.advance(OUTFIT.dustAt - 1);
    expect(poofs(scene)).toHaveLength(0);
    clock.advance(1);
    expect(poofs(scene)).toHaveLength(1);
    clock.advance(OUTFIT.swapAt - OUTFIT.dustAt - 1);
    expect([avatar.shownOutfitId, plays.length]).toEqual(['default', 1]);
    clock.advance(1);
    avatar.sync({ x: 700, y: 900 });
    expect([avatar.shownOutfitId, avatar.anims.currentAnim?.key, avatar.texture.key]).toEqual(['cosy', 'avatar-cosy-idle-down', 'player/avatar-cosy-sheet']);
    expect(plays.map(p => p[0])).toEqual(['riser', 'phasePop']);
    expect(emitters(scene)).toHaveLength(1);
    expect(emitters(scene)[0].getParticleCount()).toBe(SPARKLE_COUNT);
  });

  it('reduced motion: no shiver and no sparkles; the dust, the swap and both sounds keep their frames', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('reduce') }));
    const { scene, avatar, plays, audio } = await setup();
    playMakeover(scene, avatar, 'default', audio);
    avatar.sync({ x: 700, y: 900, outfitId: 'garden' });
    expect(scene.tweens.getTweensOf(avatar)).toHaveLength(0);
    clock.advance(OUTFIT.swapAt);
    expect([poofs(scene).length, emitters(scene).length, avatar.shownOutfitId]).toEqual([1, 0, 'garden']);
    expect(plays.map(p => p[0])).toEqual(['riser', 'phasePop']);
  });

  it('cancel removes the dust and sparkles, releases the hold and resets the shiver offset', async () => {
    const { scene, avatar, audio } = await setup();
    const makeover = playMakeover(scene, avatar, 'default', audio);
    clock.advance(OUTFIT.dustAt);
    makeover.cancel();
    expect([poofs(scene).length, avatar.offsetX, avatar.shownOutfitId]).toEqual([0, 0, 'default']);
    clock.advance(1000);
    expect(emitters(scene)).toHaveLength(0);
  });
});

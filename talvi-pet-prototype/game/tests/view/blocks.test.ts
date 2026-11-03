// @vitest-environment jsdom
import './setup';
import Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { burstConfetti, CONFETTI_TINTS, screenFlash, shake } from '../../src/view/celebration/Confetti';
import { hitstop } from '../../src/view/celebration/hitstop';
import { reducedMotion } from '../../src/view/celebration/motion';
import { destroyScene } from './sceneHarness';
import { designSetup, linesOf } from './designHarness';

const original = globalThis.matchMedia;
function setReduced(reduce: boolean): void {
  globalThis.matchMedia = ((query: string) => ({ matches: reduce && query === '(prefers-reduced-motion: reduce)', media: query })) as unknown as typeof matchMedia;
}
afterEach(() => { vi.useRealTimers(); destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); globalThis.matchMedia = original; });

const rect = new Phaser.Geom.Rectangle(0, 0, 100, 100);

describe('VERIFY-WORK-038-1-06 shared blocks: hitstop, flash peak, confetti params, shake, reduced motion', () => {
  it('reducedMotion() reads prefers-reduced-motion and is false without matchMedia (jsdom)', () => {
    (globalThis as { matchMedia?: unknown }).matchMedia = undefined;
    expect(reducedMotion()).toBe(false);
    setReduced(true); expect(reducedMotion()).toBe(true);
    setReduced(false); expect(reducedMotion()).toBe(false);
  });

  it('hitstop(scene, 90) pauses tweens and anims and resumes at 90 ms, while a store dispatch in between still applies', async () => {
    const s = await designSetup();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const calls: string[] = [];
    vi.spyOn(s.scene.tweens, 'pauseAll').mockImplementation(() => { calls.push('tweens.pause'); return s.scene.tweens; });
    vi.spyOn(s.scene.tweens, 'resumeAll').mockImplementation(() => { calls.push('tweens.resume'); return s.scene.tweens; });
    vi.spyOn(s.scene.anims, 'pauseAll').mockImplementation(() => { calls.push('anims.pause'); return s.scene.anims; });
    vi.spyOn(s.scene.anims, 'resumeAll').mockImplementation(() => { calls.push('anims.resume'); return s.scene.anims; });
    hitstop(s.scene, 90);
    expect(calls).toEqual(['tweens.pause', 'anims.pause']);
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(linesOf(s.context, 'charm.placed').map(l => l.typeId)).toEqual(['lamp']);
    vi.advanceTimersByTime(89);
    expect(calls).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['tweens.pause', 'anims.pause', 'tweens.resume', 'anims.resume']);
    const early = hitstop(s.scene, 120);
    early.cancel(); early.cancel();
    vi.advanceTimersByTime(200);
    expect(calls.filter(c => c === 'tweens.resume')).toHaveLength(2);
  });

  it('under reduced motion hitstop, flash and shake are no-ops (confetti is kept)', async () => {
    const s = await designSetup();
    setReduced(true);
    const pause = vi.spyOn(s.scene.tweens, 'pauseAll');
    const camShake = vi.spyOn(s.scene.cameras.main, 'shake');
    hitstop(s.scene, 90);
    shake(s.scene, 200, 0.004);
    const flash = screenFlash(s.scene, { peak: 0.5, ms: 200 });
    expect([pause.mock.calls.length, camShake.mock.calls.length, flash.active, s.scene.tweens.getTweensOf(flash).length]).toEqual([0, 0, false, 0]);
    const explode = vi.spyOn(Phaser.GameObjects.Particles.ParticleEmitter.prototype, 'explode');
    burstConfetti(s.scene, rect, { count: 120 });
    expect(explode.mock.calls[0][0]).toBe(120);
  });

});

describe('VERIFY-WORK-038-1-06 shared blocks (cont.)', () => {
  it('burstConfetti with no options = 60 over 200–340° in CONFETTI_TINTS; with { count: 120, angle: 0–360 } emits 120 over 0–360', async () => {
    const s = await designSetup();
    const explode = vi.spyOn(Phaser.GameObjects.Particles.ParticleEmitter.prototype, 'explode');
    const plain = burstConfetti(s.scene, rect);
    const custom = burstConfetti(s.scene, rect, { count: 120, angle: { min: 0, max: 360 }, tints: [0xffffff] });
    expect(explode.mock.calls.map(c => c[0])).toEqual([60, 120]);
    const angle = (e: Phaser.GameObjects.Particles.ParticleEmitter) => [e.ops.angle.start, e.ops.angle.end];
    expect([angle(plain), angle(custom)]).toEqual([[200, 340], [0, 360]]);
    expect(CONFETTI_TINTS).toHaveLength(5);
  });

  it('screenFlash() keeps α 0.75 → 0 over 350; screenFlash(scene, { peak: 0.5, ms: 200 }) peaks at 0.5 over 200; shake drives the main camera', async () => {
    const s = await designSetup();
    const td = (r: Phaser.GameObjects.Rectangle) => s.scene.tweens.getTweensOf(r).map(t => (t.data[0] as Phaser.Tweens.TweenData).duration);
    const plain = screenFlash(s.scene), big = screenFlash(s.scene, { peak: 0.5, ms: 200 });
    expect([plain.alpha, td(plain), big.alpha, td(big)]).toEqual([0.75, [350], 0.5, [200]]);
    const camShake = vi.spyOn(s.scene.cameras.main, 'shake');
    shake(s.scene, 200, 0.004);
    expect(camShake).toHaveBeenCalledWith(200, 0.004);
  });
});

// @vitest-environment jsdom
import '../view/setup';
import Phaser from 'phaser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAudio } from '../../src/app/audio';
import { CONFETTI_DEPTH } from '../../src/view/celebration/Confetti';
import { HEART_ARRIVED, HEART_MOMENT_END } from '../../src/view/celebration/heartMoment';
import { HEART_MOMENT, HEART_PET_DEPTH } from '../../src/view/celebration/timings';
import { destroyScene } from '../view/sceneHarness';
import { designSetup, type DesignSetup } from '../view/designHarness';

afterEach(() => { vi.useRealTimers(); destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

/** Short walk-over bounds so the existing fulfil hold (walkOverMs + fulfilmentUseHoldMs) would release at 400 ms, inside the moment. */
const SHORT_HOLD = [{ file: 'tuning.json', path: '/walkOverMs', value: 300 }, { file: 'tuning.json', path: '/fulfilmentUseHoldMs', value: 100 }];
const fake = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
const box = (s: DesignSetup) => s.root.querySelector<HTMLElement>('.tpp-dialogue')!;
const moment = (s: DesignSetup) => s.root.querySelector<HTMLElement>('.tpp-heart-moment');
const line = (s: DesignSetup) => box(s).querySelector('.tpp-dialogue-line')!.textContent;
const fulfil = (s: DesignSetup) => s.context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
const emitters = (s: DesignSetup) => s.scene.children.list.filter(c => c instanceof Phaser.GameObjects.Particles.ParticleEmitter);

describe('VERIFY-WORK-032-2-08 Heart moment then the vignette (WORK-032-2 fix 6b)', () => {
  it('VERIFY-WORK-032-2-08: heart.earned shows the moment (dim, heart, confetti, the big react); the vignette box stays hidden until 2200 ms, then shows its first line', async () => {
    const s = await designSetup({ patches: SHORT_HOLD });
    fake();
    fulfil(s);
    expect(s.state().dialogue.current?.source).toBe('vignette');
    const layer = moment(s)!;
    expect(layer).not.toBeNull();
    expect([layer.style.pointerEvents, layer.style.background.includes(`rgba(40, 28, 18, ${HEART_MOMENT.dimAlpha})`), layer.querySelector('.tpp-heart-moment-heart')?.textContent]).toEqual(['auto', true, '♥']);
    expect(emitters(s).map(e => (e as Phaser.GameObjects.Particles.ParticleEmitter).depth)).toEqual([CONFETTI_DEPTH]);
    const pet = s.scene.heartPet!;
    expect([pet.anims.currentAnim?.key, pet.depth, pet.scrollFactorX, pet.scale]).toEqual(['pet-dog-react', HEART_PET_DEPTH, 0, HEART_MOMENT.petScale]);
    // The room's own pet still follows the simulation (walk-over), untouched by the moment.
    expect(s.state().pets.dog.behaviour.phase).toBe('walking');
    vi.advanceTimersByTime(HEART_MOMENT.totalMs - 1);
    expect([box(s).hidden, moment(s) !== null]).toEqual([true, true]);
    vi.advanceTimersByTime(1);
    expect([box(s).hidden, moment(s), line(s), s.scene.heartPet]).toEqual([false, null, s.state().dialogue.current!.lines[0], null]);
  });

  it('VERIFY-WORK-032-2-08: a skip at 300 ms is ignored (and consumed); a click or key at 700 ms ends the moment and the held box shows', async () => {
    for (const skip of ['click', 'key'] as const) {
      const s = await designSetup({ patches: SHORT_HOLD });
      fake();
      const dispatch = vi.spyOn(s.context.store, 'dispatch');
      fulfil(s);
      dispatch.mockClear();
      const press = () => skip === 'click' ? moment(s)!.click() : window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', cancelable: true }));
      vi.advanceTimersByTime(300);
      press();
      expect([moment(s) !== null, box(s).hidden]).toEqual([true, true]);
      vi.advanceTimersByTime(400);
      press();
      expect([moment(s), box(s).hidden, s.scene.heartPet]).toEqual([null, false, null]);
      expect(dispatch).not.toHaveBeenCalled();
      destroyScene(); document.body.replaceChildren(); vi.useRealTimers();
    }
  });

});

describe('VERIFY-WORK-032-2-08 Heart moment (cont.)', () => {
  it('VERIFY-WORK-032-2-08: keys during the moment never reach the game keyboard; keyup passes', async () => {
    const s = await designSetup({ patches: SHORT_HOLD });
    fake();
    fulfil(s);
    const seen: string[] = [];
    window.addEventListener('keydown', () => seen.push('down'));
    window.addEventListener('keyup', () => seen.push('up'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'a' }));
    expect(seen).toEqual(['up']);
    vi.advanceTimersByTime(HEART_MOMENT.totalMs);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    expect(seen).toEqual(['up', 'down']);
  });

  it('VERIFY-WORK-038-1-10: sfx/heart plays exactly once, view-timed at the moment start (audio.ts no longer plays it on heart.earned)', async () => {
    const s = await designSetup({ patches: SHORT_HOLD });
    fake();
    const played: [string, number][] = [];
    let t = 0;
    const audio = createAudio({ play: id => { played.push([id, t]); }, setMute: () => {}, locked: () => false }, { available: new Set(['sfx/heart']), record: () => {} });
    audio.attach(s.context.store);
    s.context.audio = audio;
    fulfil(s);
    expect([played, moment(s) !== null]).toEqual([[['sfx/heart', 0]], true]);
    t = 1;
    vi.advanceTimersByTime(HEART_MOMENT.totalMs + 100);
    expect(played).toEqual([['sfx/heart', 0]]);
  });

  it('VERIFY-WORK-038-1-09: tpp:heartArrived fires once at the moment finish (interim) and before tpp:heartMomentEnd', async () => {
    const s = await designSetup({ patches: SHORT_HOLD });
    fake();
    const seen: string[] = [];
    const onArrived = () => seen.push(HEART_ARRIVED), onEnd = () => seen.push(HEART_MOMENT_END);
    window.addEventListener(HEART_ARRIVED, onArrived); window.addEventListener(HEART_MOMENT_END, onEnd);
    fulfil(s);
    vi.advanceTimersByTime(HEART_MOMENT.totalMs - 1);
    expect(seen).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(seen).toEqual([HEART_ARRIVED, HEART_MOMENT_END]);
    window.removeEventListener(HEART_ARRIVED, onArrived); window.removeEventListener(HEART_MOMENT_END, onEnd);
  });

});

describe('VERIFY-WORK-032-2-08 Heart moment (cont.)', () => {
  it('VERIFY-WORK-032-2-08: the store advancing the dialogue during the moment — at the end the box shows the line the state holds', async () => {
    const s = await designSetup({ patches: SHORT_HOLD });
    fake();
    fulfil(s);
    s.context.store.dispatch({ type: 'advanceDialogue' });
    vi.advanceTimersByTime(HEART_MOMENT.totalMs);
    const current = s.state().dialogue.current;
    if (current) expect([box(s).hidden, line(s)]).toEqual([false, current.lines[current.index]]);
    else expect(box(s).hidden).toBe(true);
  });

  it('VERIFY-WORK-032-2-08: a dialogue closed through the store during the moment cancels it; nothing shows later', async () => {
    const s = await designSetup({ patches: SHORT_HOLD });
    fake();
    fulfil(s);
    const source = s.state().dialogue.current!.source;
    for (let i = 0; i < 20 && s.state().dialogue.current?.source === source; i++) s.context.store.dispatch({ type: 'advanceDialogue' });
    if (s.state().dialogue.current === null) {
      expect([moment(s), box(s).hidden]).toEqual([null, true]);
      vi.advanceTimersByTime(HEART_MOMENT.totalMs);
      expect(box(s).hidden).toBe(true);
    } else {
      // A next script swapped in (same dispatch): the moment keeps running and that script's box shows at its end.
      vi.advanceTimersByTime(HEART_MOMENT.totalMs);
      expect([moment(s), box(s).hidden]).toEqual([null, false]);
    }
  });

});

describe('VERIFY-WORK-032-2-08 Heart moment (cont.)', () => {
  it('VERIFY-WORK-032-2-08: state.reset mid-moment cancels it cleanly (no layer, no key capture, box hidden, no late show)', async () => {
    const s = await designSetup({ patches: SHORT_HOLD });
    fake();
    fulfil(s);
    vi.advanceTimersByTime(500);
    s.context.store.dispatch({ type: 'reset' });
    expect([moment(s), box(s).hidden]).toEqual([null, true]);
    const seen: string[] = [];
    window.addEventListener('keydown', () => seen.push('down'));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    vi.advanceTimersByTime(HEART_MOMENT.totalMs);
    expect([seen, box(s).hidden]).toEqual([['down'], true]);
  });

  it('VERIFY-WORK-032-2-08: with Stars hidden the moment still plays (Hearts are not Stars); the Hearts pulse is kept (WORK-038-1: at the moment heartArrived)', async () => {
    const s = await designSetup({ patches: SHORT_HOLD });
    fake();
    s.context.store.dispatch({ type: 'debugSetStarsVisible', on: false });
    fulfil(s);
    expect(moment(s)).not.toBeNull();
    vi.advanceTimersByTime(HEART_MOMENT.totalMs);
    expect(s.root.querySelector<HTMLElement>('.tpp-hearts')!.dataset.pulses).toBe('1');
  });
});

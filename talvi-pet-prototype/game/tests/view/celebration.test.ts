// @vitest-environment jsdom
import './setup';
import Phaser from 'phaser';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Content } from '../../src/content/types';
import type { GameState } from '../../src/sim/state';
import { parseSaveValue } from '../../src/sim/state.schema';
import { registerClips } from '../../src/view/anims';
import { StreetScene } from '../../src/view/scenes/StreetScene';
import { CelebrationDirector, directorClock, phaserClock, type DirectorClock } from '../../src/view/celebration/CelebrationDirector';
import { DustPoof } from '../../src/view/celebration/DustPoof';
import { WORLD_BAR_DEPTH, WorldProgressBar, chunkFill } from '../../src/view/celebration/WorldProgressBar';
import { CONFETTI_DEPTH, FLASH_DEPTH } from '../../src/view/celebration/Confetti';
import * as T from '../../src/view/celebration/timings';
import { planCelebration, type CelebrationCue } from '../../src/view/celebration/timings';
import { files, patchFiles } from '../content/helpers';
import { fixtureText } from '../app/helpers';
import { owing } from '../sim/helpers';
import { addTexture, bootScene, contextFor, destroyScene, realManifest } from './sceneHarness';
import { linesOf, REAL_STRINGS } from './designHarness';
import { mountOverlay } from '../../src/ui/overlay';

/** A manual DirectorClock: `advance(ms)` runs due callbacks in time order (HEADLESS jsdom does not advance Phaser's clock or camera effects). */
function manualClock(): DirectorClock & { advance(ms: number): void; t: number } {
  const queue: { at: number; seq: number; fn: () => void; dead: boolean }[] = [];
  let seq = 0;
  const clock = {
    t: 0,
    now: () => clock.t,
    after(ms: number, fn: () => void) { const e = { at: clock.t + ms, seq: seq++, fn, dead: false }; queue.push(e); return () => { e.dead = true; }; },
    advance(ms: number) {
      const end = clock.t + ms;
      for (;;) {
        const due = queue.filter(e => !e.dead && e.at <= end).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
        if (!due) break;
        due.dead = true; clock.t = due.at; due.fn();
      }
      clock.t = end;
    },
  };
  return clock;
}

let clock: ReturnType<typeof manualClock>;
beforeEach(() => { clock = manualClock(); directorClock.create = () => clock; });
afterEach(() => { destroyScene(); document.body.replaceChildren(); directorClock.create = phaserClock; vi.restoreAllMocks(); });

const FX = ['houses/fx-1', 'houses/fx-2', 'houses/fx-3', 'houses/fx-4', 'houses/fx-5', 'houses/fx-6'];
const IMAGES = [...FX, 'houses/fixture', 'ui/Panel_ModalDialog', 'ui/Bar_ChunkBackground_No_Fill', 'ui/Bar_ChunkFill'];
/** FX-CONTENT-MIN with distinct Pet House stage ids, as WORK-020-1's streetScene.test.ts. */
const fxContent = () => loadContent(undefined, patchFiles(files(), [{ file: 'street.json', path: '/houses/1/stageSprites', value: FX }]));
const fixtureState = (content: Content, name: string) => (parseSaveValue(content, JSON.parse(fixtureText(name))) as { state: GameState }).state;

async function street(state: GameState, { fadeIn = true } = {}) {
  const content = fxContent();
  const context = contextFor(content, state);
  const play = vi.fn();
  context.audio = { play, attach: () => () => {}, start: () => {}, detach: () => {} } as unknown as typeof context.audio;
  const scene = await bootScene(StreetScene, context, {}, IMAGES);
  const dust = realManifest.entries.find(e => e.id === 'world/dust-poof')!;
  addTexture(scene, dust.id, dust.px!.w, dust.px!.h, dust.frame);
  registerClips(scene, dust);
  if (fadeIn) scene.cameras.main.emit('camerafadeincomplete');
  const house = scene.houses.get('pet-house')!;
  return { content, context, scene, play, house, director: scene.director as CelebrationDirector };
}
/** A tween's first property (Phaser expands `scale` into scaleX/scaleY). */
const td = (t: Phaser.Tweens.Tween) => t.data[0] as Phaser.Tweens.TweenData;
/** The configured end value (a plain number value ignores the getter's arguments). */
const endOf = (t: Phaser.Tweens.Tween) => (td(t).getEndValue as unknown as () => number)();
const step = (s: StreetScene) => s.context.store.getState().celebration?.step ?? null;
const finished = (s: StreetScene) => linesOf(s.context, 'celebration.stepped').filter(l => l.step === 'milestone').length;
const tap = (s: StreetScene) => s.context.store.dispatch({ type: 'acknowledgeProject', projectId: 'pet-house' });
const cue = (from: number, to: number, pctEnd: number): CelebrationCue =>
  ({ projectId: 'pet-house', fromPhase: from, toPhase: to, completes: to === 5, pct0: from * 20, pctEnd, resumeFrom: 'cutscene' });

describe('presentation §7.2 planCelebration', () => {
  it('presentation §7.2 planCelebration sums — 1 → 4 at 1260/1500 = 6660 (the §13 formula), 0 → 1 at 300 = 2920, at 310 = 3320, 4 → 5 completing = 4620; every term a timings.ts constant', () => {
    expect(planCelebration(cue(1, 4, 84)).totalMs).toBe(T.BAR_FADE_IN + T.PAN_IN + 3 * T.BAR_TO_MILESTONE + T.POP + T.LEFTOVER
      + 2 * T.MULTI_GAP + 3 * (T.DUST_LEAD + (T.SWAP_AT - T.DUST_LEAD) + T.MULTI_HOLD));
    expect(planCelebration(cue(1, 4, 84)).totalMs).toBe(6660);
    expect(planCelebration(cue(0, 1, 20)).totalMs).toBe(T.BAR_FADE_IN + T.PAN_IN + T.BAR_TO_MILESTONE + T.POP + T.SWAP_AT + T.SINGLE_HOLD);
    expect(planCelebration(cue(0, 1, 20)).totalMs).toBe(2920);
    expect(planCelebration(cue(0, 1, 21)).totalMs).toBe(3320);
    expect(planCelebration(cue(4, 5, 100)).totalMs).toBe(T.BAR_FADE_IN + T.PAN_IN + T.BAR_TO_MILESTONE + 4 * T.FINAL_STAGGER + T.POP
      + T.COMPLETION_SWAP_AT + T.BLOOM + T.CONFETTI_HOLD);
    expect(planCelebration(cue(4, 5, 100)).totalMs).toBe(4620);
  });

  it('presentation §7.2 planCelebration sums — beat order: bar fade-in, pan, fill/pop per phase (only the last pop awaited), leftover, stage swaps (anticipation, dust +450, swap +620), completion, finish', () => {
    const plan = planCelebration(cue(1, 4, 84));
    expect(plan.beats.map(b => [b.beat, b.startMs, b.phase ?? b.pct ?? null])).toEqual([
      ['barFadeIn', 0, 20], ['pan', 200, null],
      ['fill', 800, 2], ['pop', 1300, 2], ['fill', 1300, 3], ['pop', 1800, 3], ['fill', 1800, 4], ['pop', 2300, 4],
      ['leftover', 2900, 84],
      ['anticipation', 3300, 2], ['dust', 3750, 2], ['swap', 3920, 2],
      ['anticipation', 4520, 3], ['dust', 4970, 3], ['swap', 5140, 3],
      ['anticipation', 5740, 4], ['dust', 6190, 4], ['swap', 6360, 4],
      ['finish', 6660, null]]);
    const done = planCelebration(cue(4, 5, 100));
    expect(done.beats.map(b => [b.beat, b.startMs])).toEqual([['barFadeIn', 0], ['pan', 200], ['fill', 800], ['popAll', 1300],
      ['completionDust', 2400], ['completionSwap', 2570], ['confetti', 2870], ['finish', 4620]]);
    expect(planCelebration(cue(1, 5, 100)).beats.filter(b => b.beat === 'swap').map(b => b.phase)).toEqual([2, 3, 4]);
  });
});

describe('mec-002 §3.3 CelebrationDirector', () => {
  const title = 'mec-002 §3.3 CelebrationDirector dispatches cutsceneFinished exactly once (HEADLESS: manual director clock, object fields, not pixels) — ';

  it(`${title}tap path 1 → 4: nothing before 6660 ms, one cutsceneFinished at 6660; world bar at depth 6500 above the anchor filling 20 → 40 → 60 → 80 → 84; textures fx-2 → fx-3 → fx-4 → fx-5 at each +620; phasePop once per pop`, async () => {
    const { scene, house, director, play, content } = await street(owing(fxContent(), 1, 1260));
    tap(scene);
    const bar = director.bar as WorldProgressBar;
    const anchor = content.street.houses[1].attentionAnchor;
    expect([bar.x, bar.y, bar.depth]).toEqual([anchor.x, anchor.y - 40, WORLD_BAR_DEPTH]);
    expect(bar.pct).toBe(20);
    const pcts: number[] = [], textures: string[] = [house.texture.key];
    for (const at of [1300, 1800, 2300, 3300]) { clock.advance(at - clock.t); pcts.push(bar.pct); }
    expect(pcts).toEqual([40, 60, 80, 84]);
    expect(bar.chunks.map((_, i) => +chunkFill(bar.pct, i).toFixed(6))).toEqual([1, 1, 1, 1, 0.2]);
    for (const at of [3920, 5140, 6360]) { clock.advance(at - clock.t); textures.push(house.texture.key); }
    expect(textures).toEqual(['houses/fx-2', 'houses/fx-3', 'houses/fx-4', 'houses/fx-5']);
    expect(play.mock.calls).toEqual([['phasePop'], ['phasePop'], ['phasePop']]);
    clock.advance(6659 - clock.t);
    expect([step(scene), finished(scene), director.running]).toEqual(['cutscene', 0, true]);
    clock.advance(1);
    expect([step(scene), finished(scene), director.running]).toEqual(['milestone', 1, false]);
    expect(director.timeline.at(-1)).toEqual({ beat: 'finish', atMs: 6660 });
  });

  it(`${title}each DustPoof sits at house.depth + 1 playing anim dust and is destroyed by +1000; a replay event or more time dispatches nothing more`, async () => {
    const { scene, house, director } = await street(owing(fxContent(), 1, 1260));
    tap(scene);
    clock.advance(3750);
    const poof = scene.children.list.find(c => c instanceof DustPoof) as DustPoof;
    expect([poof.depth, poof.anims.currentAnim?.key, poof.texture.key]).toEqual([house.depth + 1, 'dust', 'world/dust-poof']);
    clock.advance(999);
    expect(poof.active).toBe(true);
    clock.advance(1);
    expect(poof.active).toBe(false);
    clock.advance(10_000);
    scene.context.store.start();
    clock.advance(10_000);
    expect(finished(scene)).toBe(1);
    expect(linesOf(scene.context, 'action.rejected')).toEqual([]);
    expect(director.cue?.toPhase).toBe(4);
  });

  it(`${title}with the real (absent) sfx/phase-pop the chain is silent and records no app.error`, async () => {
    const content = fxContent();
    const context = contextFor(content, owing(content, 1, 1260));
    const scene = await bootScene(StreetScene, context, {}, IMAGES);
    scene.cameras.main.emit('camerafadeincomplete');
    tap(scene);
    clock.advance(7000);
    expect([finished(scene), linesOf(context, 'app.error')]).toEqual([1, []]);
  });
});

describe('VERIFY-PRES-008 replay snap', () => {
  const title = 'VERIFY-PRES-008 partial: director half — camera framed, house at toPhase (jsdom; Chrome in work-020-2.mjs; popup half WORK-020-3) — ';
  for (const name of ['save-v1.milestone.json', 'save-v1.reveal.json']) {
    it(`${title}${name}: centred on the house at zoom 1 with no camera tween, house fx-5, world bar at 84 %; store.start() and time dispatch nothing`, async () => {
      const { scene, house, director } = await street(fixtureState(fxContent(), name), { fadeIn: false });
      const cam = scene.cameras.main, b = house.getBounds();
      expect(Math.abs(cam.midPoint.x - b.centerX)).toBeLessThanOrEqual(1);
      expect(Math.abs(cam.midPoint.y - b.centerY)).toBeLessThanOrEqual(1);
      expect([cam.zoom, cam.panEffect.isRunning, cam.zoomEffect.isRunning]).toEqual([1, false, false]);
      expect([house.texture.key, director.bar?.pct, director.bar?.alpha, director.running]).toEqual(['houses/fx-5', 84, 1, false]);
      const before = scene.context.log.lines().length;
      const stepBefore = step(scene);
      scene.context.store.start();
      clock.advance(10_000);
      expect(linesOf(scene.context, 'action.rejected')).toEqual([]);
      expect(finished(scene)).toBe(0);
      expect(step(scene)).toBe(stepBefore);
      expect(scene.context.log.lines().slice(before).filter(l => l.type === 'celebration.stepped')).toEqual([]);
    });
  }
  it(`${title}FX-SAVE-V1-CEL-cutscene: the chain starts only after FADE_IN_COMPLETE, then dispatches once at 6660`, async () => {
    const { scene, director } = await street(fixtureState(fxContent(), 'save-v1.cutscene.json'), { fadeIn: false });
    clock.advance(10_000);
    expect([director.running, director.timeline, step(scene)]).toEqual([false, [], 'cutscene']);
    scene.cameras.main.emit('camerafadeincomplete');
    expect(director.running).toBe(true);
    clock.advance(6659);
    expect(finished(scene)).toBe(0);
    clock.advance(1);
    expect([finished(scene), step(scene)]).toEqual([1, 'milestone']);
  });
});

describe('presentation §5.3 celebration pan', () => {
  const title = 'presentation §5.3 celebration pan (HEADLESS: effect call arguments, camera effects do not advance) — ';
  it(`${title}pan to the house getBounds() centre over 600 Quad.easeOut within the tile bounds; each swap zoomTo(zoom / 0.85, 450) then zoomTo(panZoom, 200)`, async () => {
    const { scene, house } = await street(owing(fxContent(), 1, 1260));
    const cam = scene.cameras.main;
    const pan = vi.spyOn(cam, 'pan'), zoomTo = vi.spyOn(cam, 'zoomTo');
    tap(scene);
    clock.advance(200);
    const b = house.getBounds();
    expect(pan.mock.calls).toEqual([[b.centerX, b.centerY, 600, 'Quad.easeOut']]);
    expect(cam.useBounds).toBe(true);
    clock.advance(6460);
    expect(zoomTo.mock.calls).toEqual([[1 / 0.85, 450], [1, 200], [1 / 0.85, 450], [1, 200], [1 / 0.85, 450], [1, 200]]);
  });

  it(`${title}celebration.ended pans back pan(960, 540, 500) and fades the world bar out over 200`, async () => {
    const { scene, director } = await street(owing(fxContent(), 1, 1260));
    tap(scene);
    clock.advance(6660);
    const bar = director.bar!;
    const pan = vi.spyOn(scene.cameras.main, 'pan');
    scene.context.store.dispatch({ type: 'collectRewards' });
    scene.context.store.dispatch({ type: 'closeReveal' });
    expect(linesOf(scene.context, 'celebration.ended')).toHaveLength(1);
    await Promise.resolve();
    expect(pan.mock.calls).toEqual([[960, 540, 500]]);
    expect(scene.tweens.getTweensOf(bar).map(t => [td(t).key, endOf(t), td(t).duration])).toEqual([['alpha', 1, 200], ['alpha', 0, 200]]);
    expect(director.cue).toBeNull();
  });

  it(`${title}skip chain: closeReveal publishing celebration.ended and celebration.started {replay:false} issues no pan back and starts the new cue (4 → 5) from the current framing`, async () => {
    const { scene, director } = await street(owing(fxContent(), 1, 1260));
    tap(scene);
    clock.advance(6660);
    scene.context.store.dispatch({ type: 'skipWait' });
    const pan = vi.spyOn(scene.cameras.main, 'pan');
    scene.context.store.dispatch({ type: 'closeReveal' });
    expect(linesOf(scene.context, 'celebration.started').map(l => [l.replay, l.fromPhase, l.toPhase])).toEqual([[false, 1, 4], [false, 4, 5]]);
    await Promise.resolve();
    expect(pan.mock.calls).toEqual([]);
    expect([director.running, director.cue?.fromPhase, director.cue?.toPhase, director.timeline.map(t => t.beat)]).toEqual([true, 4, 5, ['barFadeIn']]);
    clock.advance(4620);
    expect(finished(scene)).toBe(2);
  });
});

describe('presentation §7.4 completion hooks', () => {
  it('presentation §7.4 completion hooks (VERIFY-PRES-007 is WORK-023\'s) — 4 → 5: five pops, dust at t0, fx-6 at +170 with the 1.08 bloom, then confetti (depth 7000, explode 60, texture confetti 8×12) and the white flash (depth 9000, scrollFactor 0, α 0.75 → 0 over 350) on the same tick; cutsceneFinished 1750 later; emitter gone by +4000; cameras.main.flash never called', async () => {
    const { scene, house, director, play } = await street(owing(fxContent(), 4, 1500));
    const flash = vi.spyOn(scene.cameras.main, 'flash');
    const explode = vi.spyOn(Phaser.GameObjects.Particles.ParticleEmitter.prototype, 'explode');
    tap(scene);
    clock.advance(2400);
    expect(play).toHaveBeenCalledTimes(5);
    expect(scene.children.list.filter(c => c instanceof DustPoof)).toHaveLength(1);
    clock.advance(170);
    expect(house.texture.key).toBe('houses/fx-6');
    expect(scene.tweens.getTweensOf(house).map(t => [td(t).key, endOf(t), td(t).duration, td(t).yoyo])).toEqual([['scaleX', 1.08, 150, true]]);
    clock.advance(299);
    expect(explode).not.toHaveBeenCalled();
    const completes = () => play.mock.calls.filter(c => c[0] === 'complete');
    expect(completes()).toEqual([]);
    clock.advance(1);
    // VERIFY-WORK-038-1-10: sfx/complete is view-timed on the confetti + flash beat (interim frame), exactly once.
    expect(completes()).toEqual([['complete']]);
    const emitter = scene.children.list.find(c => c instanceof Phaser.GameObjects.Particles.ParticleEmitter) as Phaser.GameObjects.Particles.ParticleEmitter;
    const rect = scene.children.list.find(c => c instanceof Phaser.GameObjects.Rectangle && c !== scene.designTint.rect) as Phaser.GameObjects.Rectangle;
    expect([emitter.depth, emitter.texture.key, explode.mock.calls[0][0]]).toEqual([CONFETTI_DEPTH, 'confetti', 60]);
    expect([scene.textures.get('confetti').source[0].width, scene.textures.get('confetti').source[0].height]).toEqual([8, 12]);
    expect([rect.depth, rect.scrollFactorX, rect.scrollFactorY, rect.alpha, rect.fillColor]).toEqual([FLASH_DEPTH, 0, 0, 0.75, 0xffffff]);
    expect(scene.tweens.getTweensOf(rect).map(t => [td(t).key, endOf(t), td(t).duration])).toEqual([['alpha', 0, 350]]);
    clock.advance(1749);
    expect(finished(scene)).toBe(0);
    clock.advance(1);
    expect(finished(scene)).toBe(1);
    clock.advance(2250);
    expect(emitter.active).toBe(false);
    expect(flash).not.toHaveBeenCalled();
    expect([completes().length, play.mock.calls.filter(c => c[0] === 'phasePop').length]).toEqual([1, 5]);
    expect(director.timeline.map(t => t.beat)).toEqual(['barFadeIn', 'pan', 'fill', 'popAll', 'completionDust', 'completionSwap', 'confetti', 'finish']);
  });
});

describe('presentation §7.5 cancel', () => {
  const title = 'presentation §7.5 state.reset cancels the chain — ';
  it(`${title}mid-chain reset: no cutsceneFinished, dust and world bar destroyed, resetFX called, no tween left; the restarted Street holds no cue`, async () => {
    const { scene, director } = await street(owing(fxContent(), 1, 1260));
    const resetFX = vi.spyOn(scene.cameras.main, 'resetFX');
    tap(scene);
    clock.advance(3800);
    const bar = director.bar!, poof = scene.children.list.find(c => c instanceof DustPoof)!;
    scene.context.store.dispatch({ type: 'reset', seed: 7 });
    expect([bar.active, poof.active, director.running, director.cue]).toEqual([false, false, false, null]);
    expect(resetFX).toHaveBeenCalled();
    expect(scene.tweens.getTweens()).toEqual([]);
    clock.advance(10_000);
    expect(finished(scene)).toBe(0);
    scene.game.scene.processQueue();
    expect(scene.director).not.toBe(director);
    expect([scene.director?.cue, scene.director?.running]).toEqual([null, false]);
  });

  it(`${title}a scene shutdown cancels the same way`, async () => {
    const { scene, director } = await street(owing(fxContent(), 1, 1260));
    tap(scene);
    clock.advance(1000);
    const bar = director.bar!;
    scene.scene.stop();
    scene.game.scene.processQueue();
    clock.advance(10_000);
    expect([bar.active, director.running, finished(scene)]).toEqual([false, false, 0]);
  });
});

describe('fork 6 house texture ownership', () => {
  it('fork 6 the director owns the celebrating house — a mid-chain debugSetCurrent refresh leaves the director\'s texture, the other house still refreshes; after celebration.ended the house shows stageSprites[displayedPhase]', async () => {
    const { scene, house } = await street(owing(fxContent(), 1, 1260));
    tap(scene);
    clock.advance(3920);
    expect(house.texture.key).toBe('houses/fx-3');
    const other = scene.houses.get('starter-house')!;
    const otherIcon = vi.spyOn(other.icon, 'setVisible');
    scene.context.store.dispatch({ type: 'debugSetCurrent', projectId: 'pet-house', cents: 1400 });
    expect(linesOf(scene.context, 'debug.applied').length).toBeGreaterThan(0);
    expect(house.texture.key).toBe('houses/fx-3');
    expect(otherIcon).toHaveBeenCalled();
    clock.advance(2740);
    scene.context.store.dispatch({ type: 'collectRewards' });
    scene.context.store.dispatch({ type: 'closeReveal' });
    expect(house.texture.key).toBe('houses/fx-5');
  });
});

describe('VERIFY-PRES-008 replay (popup half, WORK-020-3)', () => {
  const title = 'VERIFY-PRES-008 partial: jsdom + Chrome (iPhone not run) — director half (WORK-020-2) and popup half: ';
  /** FX-SAVE-V1-CEL-* over the distinct-stage content-min variant with REAL_STRINGS; the overlay mounts before the scene, as main.ts. */
  async function replay(name: string) {
    const content = loadContent(undefined, patchFiles(files(), [{ file: 'street.json', path: '/houses/1/stageSprites', value: FX }, ...REAL_STRINGS]));
    const context = contextFor(content, fixtureState(content, name));
    const host = document.createElement('div'); document.body.append(host);
    mountOverlay(host, context);
    const scene = await bootScene(StreetScene, context, {}, IMAGES);
    const q = (sel: string) => host.querySelector<HTMLElement>(sel)!;
    return { content, context, scene, host, house: scene.houses.get('pet-house')!, milestone: q('.tpp-milestonePopup'), reveal: q('.tpp-revealPopup') };
  }
  it(`${title}FX-SAVE-V1-CEL-milestone — the milestone popup open at mount ("Coming along!", tiles in unlockedTypeIds order), still exactly one after store.start(); camera framed, house fx-5; nothing dispatched`, async () => {
    const r = await replay('save-v1.milestone.json');
    const ids = r.context.store.getState().celebration!.unlockedTypeIds;
    expect([r.milestone.hidden, r.milestone.dataset.state, r.milestone.querySelector('.tpp-heading')!.textContent]).toEqual([false, 'normal', 'Coming along!']);
    expect([...r.milestone.querySelectorAll<HTMLElement>('.tpp-reward-tile')].map(t => t.dataset.typeId)).toEqual(ids);
    r.context.store.start();
    clock.advance(10_000);
    expect(r.host.querySelectorAll('[data-panel="milestonePopup"]:not([hidden]), [data-panel="revealPopup"]:not([hidden])')).toHaveLength(1);
    expect(r.milestone.querySelectorAll('.tpp-reward-tile')).toHaveLength(ids.length);
    const cam = r.scene.cameras.main, b = r.house.getBounds();
    expect(Math.abs(cam.midPoint.x - b.centerX) <= 1 && Math.abs(cam.midPoint.y - b.centerY) <= 1).toBe(true);
    expect([cam.zoom, r.house.texture.key]).toEqual([1, FX[r.context.store.getState().celebration!.toPhase]]);
    expect(linesOf(r.context, 'action.rejected', 'celebration.stepped')).toEqual([]);
  });
  it(`${title}FX-SAVE-V1-CEL-reveal — the reveal popup open at mount with three cards, the milestone popup hidden; store.start() keeps one`, async () => {
    const r = await replay('save-v1.reveal.json');
    expect([r.milestone.hidden, r.reveal.hidden, r.reveal.querySelectorAll('.tpp-clue:not([hidden])').length]).toEqual([true, false, 3]);
    r.context.store.start();
    expect([r.milestone.hidden, r.reveal.hidden, r.reveal.querySelectorAll('.tpp-clue').length]).toEqual([true, false, 3]);
    expect(r.house.texture.key).toBe(FX[r.context.store.getState().celebration!.toPhase]);
    expect(linesOf(r.context, 'action.rejected')).toEqual([]);
  });
});

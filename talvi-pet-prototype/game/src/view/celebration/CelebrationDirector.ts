import Phaser from 'phaser';
import type { Content } from '@content/types';
import type { GameState } from '@sim/state';
import type { ViewContext } from '../context';
import type { HouseSprite } from '../objects/HouseSprite';
import { DustPoof } from './DustPoof';
import { burstConfetti, screenFlash, shake } from './Confetti';
import { hitstop, type Hitstop } from './hitstop';
import { WorldProgressBar } from './WorldProgressBar';
import {
  ANTICIPATION, BLOOM, COMPLETE, CONFETTI_LIFETIME, DUST_CLIP, DUST_LIFETIME, FINAL_STAGGER, PAN_BACK, PAN_IN, PHASE, ZOOM_BACK,
  ZOOM_IN_FACTOR, planCelebration, type Beat, type BeatName, type CelebrationCue, type CelebrationPlan,
} from './timings';

/** Tier 1: the director's clock (scene time in the game; a manual clock in jsdom tests). */
export type DirectorClock = { now(): number; after(ms: number, fn: () => void): () => void };
export const phaserClock = (scene: Phaser.Scene): DirectorClock => ({
  now: () => scene.time.now,
  after: (ms, fn) => { const event = scene.time.delayedCall(ms, fn); return () => event.remove(false); },
});
/** Tier 1: the clock factory the Street uses; jsdom tests swap `create` for a manual clock. */
export const directorClock: { create: (scene: Phaser.Scene) => DirectorClock } = { create: phaserClock };

/** What the director needs from the Street (StreetScene satisfies it). */
export type DirectorScene = Phaser.Scene & { context: ViewContext; houses: Map<string, HouseSprite>; transitioning: boolean };
type Celebration = NonNullable<GameState['celebration']>;

const keyOf = (c: Pick<Celebration, 'projectId' | 'fromPhase' | 'toPhase'>): string => `${c.projectId}:${c.fromPhase}:${c.toPhase}`;
const SHIVER_LEGS = 14; // 7 yoyo cycles over ANTICIPATION ("x '+=6' yoyo repeat 6")
/** DEC-049 spec §2 beat text (order fork (d)): the swap's squash punch scaleY 1 → 0.92 → 1.08 → 1 (scaleX inverse) over `PHASE.punchMs`. */
export const PUNCH_SQUASH = { low: 0.92, high: 1.08 } as const;
/** Spec §2: the gold sparkle tint and the upward cone (Phaser angles, 270 = up) from the roof strip (top quarter of the house). */
export const SPARKLE_TINT = 0xd9a441;
export const SPARKLE_CONE = { min: 240, max: 300 } as const;
/** Spec §2/§3: each phase crossed / each stage raises the pop tick and `phasePop` by 2 semitones. */
export const STEP_SEMITONES = 2;
/** Spec §3: the completion hit's confetti covers the full circle. */
export const FULL_CIRCLE = { min: 0, max: 360 } as const;

/** Mec-002 §3.3 `CelebrationCue` from `state.celebration` and the project's cents at that moment. */
export function cueFrom(content: Content, state: GameState): CelebrationCue {
  const c = state.celebration;
  if (!c) throw new Error('cueFrom: no celebration in state');
  const goal = content.projects.find(p => p.id === c.projectId)?.goalCents;
  if (!goal) throw new Error(`cueFrom: unknown project "${c.projectId}"`);
  return { projectId: c.projectId, fromPhase: c.fromPhase, toPhase: c.toPhase, completes: c.completes, pct0: c.fromPhase * 20,
    pctEnd: Math.round(state.projects[c.projectId].currentCents / goal * 100), resumeFrom: c.step };
}

/** Presentation §7 CelebrationDirector: runs the §7.2 chain, snaps on replay, pans back, cancels on reset/shutdown. */
export class CelebrationDirector {
  cue: CelebrationCue | null = null;
  plan: CelebrationPlan | null = null;
  running = false;
  timeline: { beat: BeatName; atMs: number }[] = [];
  startedAt = 0;
  startedAtPerf = 0;
  bar: WorldProgressBar | null = null;
  panZoom = 1;
  private heldKey: string | null = null;
  private timers: (() => void)[] = [];
  private effects: Phaser.GameObjects.GameObject[] = [];
  private panBackPending = false;
  private freeze: Hitstop | null = null;
  constructor(private readonly scene: DirectorScene, private readonly clock: DirectorClock = phaserClock(scene)) {}

  private get house(): HouseSprite {
    const house = this.cue ? this.scene.houses.get(this.cue.projectId) : undefined;
    if (!house) throw new Error(`CelebrationDirector: no house for "${this.cue?.projectId}"`);
    return house;
  }
  private get camera(): Phaser.Cameras.Scene2D.Camera { return this.scene.cameras.main; }
  private after(ms: number, fn: () => void): void { this.timers.push(this.clock.after(ms, fn)); }

  /** Fork 6: the celebrating house's texture is the director's from start until `celebration.ended`. */
  owns(projectId: string): boolean { return this.cue !== null && this.cue.projectId === projectId; }

  /** Presentation §4 / §7.5: at create, `state.celebration` resumes from its step (cutscene waits for the fade-in). */
  resume(state: GameState): void {
    if (!state.celebration) return;
    const cue = cueFrom(this.scene.context.content, state);
    this.heldKey = keyOf(state.celebration);
    this.cue = cue;
    if (cue.resumeFrom !== 'cutscene') { this.snap(cue); return; }
    if (!this.scene.transitioning) { this.start(cue); return; }
    this.camera.once(Phaser.Cameras.Scene2D.Events.FADE_IN_COMPLETE, () => { if (this.cue === cue) this.start(cue); });
  }

  /** `celebration.started`: order fork 3 — once per celebration; a `replay:true` for the held one is ignored. */
  started(event: { replay: boolean }, state: GameState): void {
    const c = state.celebration;
    if (!c) return;
    if (event.replay && this.heldKey === keyOf(c)) return;
    this.panBackPending = false;
    if (this.cue) this.clear();
    if (event.replay) { this.resume(state); return; }
    this.heldKey = keyOf(c);
    this.start(cueFrom(this.scene.context.content, state));
  }

  /** Mec-002 obligation (1): the §7.2 chain; `cutsceneFinished` exactly once at `plan.totalMs`. */
  start(cue: CelebrationCue): void {
    this.cue = cue;
    this.plan = planCelebration(cue);
    this.running = true;
    this.timeline = [];
    this.startedAt = this.clock.now();
    this.startedAtPerf = performance.now();
    this.panZoom = this.camera.zoom;
    for (const beat of this.plan.beats)
      if (beat.startMs === 0) this.run(beat); else this.after(beat.startMs, () => this.run(beat));
  }

  private run(beat: Beat): void {
    this.timeline.push({ beat: beat.beat, atMs: this.clock.now() - this.startedAt });
    const actions: Record<BeatName, (b: Beat) => void> = {
      barFadeIn: () => this.showBar(this.cue!.pct0, this.cue!.fromPhase).fadeIn(),
      pan: () => { const c = this.target(); this.camera.pan(c.x, c.y, PAN_IN, 'Quad.easeOut'); },
      fill: b => this.fill(b), leftover: b => this.fill(b),
      pop: b => { this.bar?.pop(b.chunk!); this.popTick(STEP_SEMITONES * (b.phase! - this.cue!.fromPhase - 1)); },
      popAll: () => { this.bar?.popAll(); for (let i = 0; i < 5; i++) if (i === 0) this.popTick(0); else this.after(i * FINAL_STAGGER, () => this.popTick(STEP_SEMITONES * i)); },
      anticipation: () => { this.anticipate(); this.scene.context.audio?.play('riser'); },
      dust: () => this.dust(),
      completionDust: () => { this.dust(); this.scene.context.audio?.play('riser'); },
      swap: b => this.swap(b.phase!),
      completionSwap: b => this.completionSwap(b.phase!),
      completionHitstop: b => { this.freeze?.cancel(); this.freeze = hitstop(this.scene, b.durationMs); },
      confetti: () => this.confetti(),
      confettiWave: () => this.confettiWave(),
      finish: () => this.finish(),
    };
    actions[beat.beat](beat);
  }

  private target(): { x: number; y: number } {
    const b = this.house.getBounds();
    return { x: b.centerX, y: b.centerY };
  }
  private showBar(pct: number, completedChunks: number): WorldProgressBar {
    this.bar?.destroy();
    this.bar = new WorldProgressBar(this.scene, this.house.house.attentionAnchor, pct, completedChunks);
    return this.bar;
  }
  /** DEC-049 §2: a chunk pop plays `tick` (was `phasePop`), +2 st per phase crossed. */
  private popTick(semitones: number): void { this.scene.context.audio?.play('tick', { semitones }); }

  /** DEC-049 §2 at `SWAP_AT`: the stage texture, the squash punch, 24 gold sparkles from the roof and `phasePop` (+2 st per stage). */
  private swap(phase: number): void {
    const house = this.house;
    house.setPhase(phase);
    this.camera.zoomTo(this.panZoom, ZOOM_BACK);
    this.punch(house);
    const b = house.getBounds();
    const roof = new Phaser.Geom.Rectangle(b.x + b.width * 0.25, b.y, b.width * 0.5, b.height * 0.25);
    const sparkles = burstConfetti(this.scene, roof, { count: PHASE.sparkles, angle: SPARKLE_CONE, tints: [SPARKLE_TINT] });
    this.effects.push(sparkles);
    this.after(CONFETTI_LIFETIME, () => sparkles.destroy());
    this.scene.context.audio?.play('phasePop', { semitones: STEP_SEMITONES * (phase - this.cue!.fromPhase - 1) });
  }

  /** Squash 1 → 0.92 → 1.08 → 1 on scaleY (scaleX the inverse) over `PHASE.punchMs`, the last leg Back.easeOut. */
  private punch(house: HouseSprite): void {
    const back = Phaser.Math.Easing.Back.Out;
    this.scene.tweens.addCounter({ from: 0, to: 1, duration: PHASE.punchMs, onUpdate: t => {
      const v = t.getValue() ?? 1;
      const y = v < 0.3 ? 1 + (PUNCH_SQUASH.low - 1) * (v / 0.3)
        : v < 0.6 ? PUNCH_SQUASH.low + (PUNCH_SQUASH.high - PUNCH_SQUASH.low) * ((v - 0.3) / 0.3)
          : PUNCH_SQUASH.high + (1 - PUNCH_SQUASH.high) * back((v - 0.6) / 0.4);
      if (house.active) house.setScale(2 - y, y);
    }, onComplete: () => { if (house.active) house.setScale(1); } });
  }

  /** Beats 3 and 4: an `addCounter` drives the chunk fills; the exact target is set at the beat's end. */
  private fill(beat: Beat): void {
    const bar = this.bar;
    if (!bar) return;
    const to = beat.pct!;
    this.scene.tweens.addCounter({ from: bar.pct, to, duration: beat.durationMs, onUpdate: t => { if (bar.active) bar.setPct(t.getValue() ?? to); } });
    this.after(beat.durationMs, () => { if (bar.active) bar.setPct(to); });
  }

  /** §7.4 t 0: shiver (x '+=6' yoyo repeat 6 over 450) and camera creep zoomTo(zoom / 0.85, 450). */
  private anticipate(): void {
    const house = this.house, baseX = house.house.x;
    this.scene.tweens.add({ targets: house, x: baseX + 6, duration: ANTICIPATION / SHIVER_LEGS, yoyo: true, repeat: 6,
      onComplete: () => house.setX(baseX) });
    this.camera.zoomTo(this.camera.zoom / ZOOM_IN_FACTOR, ANTICIPATION);
  }

  /** §7.4 t 450 (completion: t 0): the dust poof over the house bounds at house depth + 1; fade at 500, destroyed at 1000. */
  private dust(): void {
    const house = this.house;
    const poof = new DustPoof(this.scene, house.getBounds(), house.depth + 1);
    this.effects.push(poof);
    this.after(DUST_CLIP, () => { if (poof.active) poof.fade(); });
    this.after(DUST_LIFETIME, () => poof.destroy());
  }

  /** §7.4 completion: lv6 at +170; DEC-049 §3: the bloom scale 1 → 1.08 → 1 over 300 starts after the 120 ms hitstop (+290). */
  private completionSwap(phase: number): void {
    const house = this.house;
    house.setPhase(phase);
    this.after(COMPLETE.hitstopMs, () => {
      if (house.active) this.scene.tweens.add({ targets: house, scale: 1.08, duration: BLOOM / 2, yoyo: true, onComplete: () => house.setScale(1) });
    });
  }

  /** DEC-049 §3 the hit (+590): 140 confetti over 360°, the 0.75 flash, the 250 ms shake and `complete` on this frame. */
  private confetti(): void {
    const emitter = burstConfetti(this.scene, this.house.getBounds(), { count: COMPLETE.confetti1, angle: FULL_CIRCLE });
    const flash = screenFlash(this.scene);
    shake(this.scene, COMPLETE.shakeMs, COMPLETE.shakeIntensity);
    this.scene.context.audio?.play('complete');
    this.effects.push(emitter, flash);
    this.after(CONFETTI_LIFETIME, () => emitter.destroy());
  }

  /** DEC-049 §3: the second wave (`COMPLETE.confetti2` 60, the default upward band) `COMPLETE.wave2At` after the hit. */
  private confettiWave(): void {
    const emitter = burstConfetti(this.scene, this.house.getBounds(), { count: COMPLETE.confetti2 });
    this.effects.push(emitter);
    this.after(CONFETTI_LIFETIME, () => emitter.destroy());
  }

  private finish(): void {
    this.running = false;
    this.scene.context.store.dispatch({ type: 'cutsceneFinished' });
  }

  /** Mec-002 obligation (2) / §7.5: frame the house without tweens, `stageSprites[toPhase]`, bar at `pctEnd`; dispatch nothing. */
  snap(cue: CelebrationCue): void {
    this.cue = cue;
    this.running = false;
    this.panZoom = this.camera.zoom;
    this.house.setPhase(cue.toPhase);
    const c = this.target();
    this.camera.centerOn(c.x, c.y);
    this.showBar(cue.pctEnd, cue.toPhase).setAlpha(1);
  }

  /** §7.1 `celebration.ended`: release the house; pan back and fade the bar unless a chained start arrives in the same publish. */
  ended(): void {
    if (!this.cue) return;
    this.cue = null;
    this.heldKey = null;
    this.panBackPending = true;
    queueMicrotask(() => {
      if (!this.panBackPending) return;
      this.panBackPending = false;
      this.camera.pan(960, 540, PAN_BACK);
      this.bar?.fadeOut();
      this.bar = null;
    });
  }

  private clear(): void {
    for (const off of this.timers.splice(0)) off();
    this.freeze?.cancel();
    this.freeze = null;
    for (const effect of this.effects.splice(0)) effect.destroy();
    this.bar?.destroy();
    this.bar = null;
    this.running = false;
    this.cue = null;
  }

  /** Mec-002 obligation (6) / §7.5 cancel: kill tweens and timers, destroy dust/confetti/flash/bar, `resetFX()`. */
  cancel(): void {
    this.clear();
    this.heldKey = null;
    this.panBackPending = false;
    // On SHUTDOWN the scene's tween manager and cameras may already be shut down (they listen first).
    this.scene.tweens?.killAll();
    this.scene.cameras?.main?.resetFX();
  }
}

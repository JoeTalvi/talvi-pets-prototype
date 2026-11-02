/** Presentation §7.2–7.4 / §12: the production cutscene's ms and factors (PR §Milestone cutscene); not tuning, not skippable (DEC-032). */
export const BAR_FADE_IN = 200;
export const PAN_IN = 600;
export const BAR_TO_MILESTONE = 500;
export const POP = 600;
export const FINAL_STAGGER = 125;
export const LEFTOVER = 400;
export const ANTICIPATION = 450;
export const DUST_LEAD = 450;
export const SWAP_AT = 620;
export const ZOOM_BACK = 200;
export const ZOOM_IN_FACTOR = 0.85;
export const SINGLE_HOLD = 400;
export const MULTI_HOLD = 300;
export const MULTI_GAP = 300;
export const MIN_HOLD = 200;
export const DUST_CLIP = 500;
export const DUST_FADE = 300;
export const DUST_LIFETIME = 1000;
export const DUST_PAD = 24;
export const COMPLETION_SWAP_AT = 170;
export const BLOOM = 300;
export const CONFETTI_HOLD = 1750;
export const CONFETTI_LIFETIME = 4000;
export const FLASH = 350;
export const FLASH_PEAK = 0.75;
export const PAN_BACK = 500;
export const BAR_FADE_OUT = 200;

/** Mec-002 §3.3 `CelebrationCue`, as the view reads it at `celebration.started` (or from state at create). */
export type CelebrationCue = {
  projectId: string;
  fromPhase: number;
  toPhase: number;
  completes: boolean;
  pct0: number;
  pctEnd: number;
  resumeFrom: 'cutscene' | 'milestone' | 'reveal';
};

export type BeatName = 'barFadeIn' | 'pan' | 'fill' | 'pop' | 'popAll' | 'leftover'
  | 'anticipation' | 'dust' | 'swap' | 'completionDust' | 'completionSwap' | 'confetti' | 'finish';
export type Beat = { beat: BeatName; startMs: number; durationMs: number; phase?: number; chunk?: number; pct?: number };
export type CelebrationPlan = { beats: Beat[]; totalMs: number };

/** Mec-002 §3.3 `stageSteps`: `fromPhase+1 .. min(toPhase, 4)` (lv6 is the completion swap). */
export function stageSteps(cue: Pick<CelebrationCue, 'fromPhase' | 'toPhase'>): number[] {
  const steps: number[] = [];
  for (let p = cue.fromPhase + 1; p <= Math.min(cue.toPhase, 4); p++) steps.push(p);
  return steps;
}

/** Beats 3/3b/3c/4: per-phase fills, the pops (only the last awaited), the p = 5 cascade, the leftover. */
function barBeats(cue: CelebrationCue, start: number, beats: Beat[]): number {
  let t = start;
  for (let p = cue.fromPhase + 1; p <= cue.toPhase; p++) {
    beats.push({ beat: 'fill', startMs: t, durationMs: BAR_TO_MILESTONE, phase: p, pct: p * 20 });
    t += BAR_TO_MILESTONE;
    const last = p === cue.toPhase;
    if (p === 5) {
      const cascade = 4 * FINAL_STAGGER + POP;
      beats.push({ beat: 'popAll', startMs: t, durationMs: cascade });
      t += cascade;
    } else {
      beats.push({ beat: 'pop', startMs: t, durationMs: POP, phase: p, chunk: p - 1 });
      if (last) t += POP;
    }
  }
  if (!cue.completes && cue.pctEnd > cue.toPhase * 20) {
    beats.push({ beat: 'leftover', startMs: t, durationMs: LEFTOVER, pct: cue.pctEnd });
    t += LEFTOVER;
  }
  return t;
}

/** Beat 5 (§7.4): anticipation at 0, dust at 450, swap at 620, hold 400 single / 300 per stage + 300 between stages. */
function stageBeats(cue: CelebrationCue, start: number, beats: Beat[]): number {
  const multi = cue.toPhase - cue.fromPhase >= 2;
  const hold = Math.max(multi ? MULTI_HOLD : SINGLE_HOLD, MIN_HOLD);
  let t = start;
  stageSteps(cue).forEach((p, i) => {
    if (i > 0) t += MULTI_GAP;
    beats.push({ beat: 'anticipation', startMs: t, durationMs: ANTICIPATION, phase: p });
    beats.push({ beat: 'dust', startMs: t + DUST_LEAD, durationMs: DUST_LIFETIME, phase: p });
    beats.push({ beat: 'swap', startMs: t + SWAP_AT, durationMs: hold, phase: p });
    t += SWAP_AT + hold;
  });
  return t;
}

/** Beat 6 (order fork 7 reading): dust at t0, lv6 at +170 with the 300 bloom, confetti + flash at +470, hold 1750. */
function completionBeats(start: number, beats: Beat[]): number {
  beats.push({ beat: 'completionDust', startMs: start, durationMs: DUST_LIFETIME, phase: 5 });
  beats.push({ beat: 'completionSwap', startMs: start + COMPLETION_SWAP_AT, durationMs: BLOOM, phase: 5 });
  const confettiAt = start + COMPLETION_SWAP_AT + BLOOM;
  beats.push({ beat: 'confetti', startMs: confettiAt, durationMs: CONFETTI_HOLD });
  return confettiAt + CONFETTI_HOLD;
}

/** Presentation §7.2: the ordered beats from `celebration.started`; `totalMs` is when `cutsceneFinished` is dispatched. */
export function planCelebration(cue: CelebrationCue): CelebrationPlan {
  const beats: Beat[] = [
    { beat: 'barFadeIn', startMs: 0, durationMs: BAR_FADE_IN, pct: cue.pct0 },
    { beat: 'pan', startMs: BAR_FADE_IN, durationMs: PAN_IN },
  ];
  let t = barBeats(cue, BAR_FADE_IN + PAN_IN, beats);
  t = stageBeats(cue, t, beats);
  if (cue.completes) t = completionBeats(t, beats);
  beats.push({ beat: 'finish', startMs: t, durationMs: 0 });
  return { beats, totalMs: t };
}

/**
 * WORK-032-2 (DEC-048, gate fork defaults 4): the design-mode world tint, the Stars burst and the Heart moment — one place per value.
 * The tint is a camera-fixed rectangle above every world sprite; the slot outlines draw in `OUTLINE_BAND` above it (order fork (c)).
 */
export const DESIGN_TINT = { color: 0x5b6f86, alpha: 0.25, depth: 1500 } as const;
export const OUTLINE_BAND = DESIGN_TINT.depth + 1;
/** Stars burst: `count` gold stars, launched `staggerMs` apart, each flying `flightMs` from the slot into the bar; all gone by `totalMs` (≤ 900). */
export const STARS_BURST = { count: 8, staggerMs: 35, flightMs: 600, spreadPx: 70, totalMs: 900 } as const;
/** Heart moment: dim + heart pop (`popMs`) for `totalMs`, skippable from `skipAfterMs`, fading out over `fadeOutMs`; then the vignette box. */
export const HEART_MOMENT = { totalMs: 2200, skipAfterMs: 600, popMs: 520, fadeOutMs: 220, dimAlpha: 0.5, heartTopPct: 6, heartPx: 240,
  petBaseY: 0.88, petScale: 2, spotlightPx: 340 } as const;
/** The big `react` pet draws camera-fixed above the world, tint, outlines, confetti (7000) and pet bubbles (8000), below the flash (9000). */
export const HEART_PET_DEPTH = 8500;

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

/*
 * DEC-049 celebration ladder v2 — spec §C (working/TASK-233/spec-moments-v2.md), the single source of every number, pasted whole by
 * WORK-038-1. Each group exports its "Big" values (what the game plays, DEC-049) as `X` and its "Bigger" values as `X_BIGGER`,
 * side by side; "Bigger" is constants only (no runtime switch). A §C "–" cell is `null`; "same" repeats the Big value. Two §C rows
 * live in content, not here: `tuning.revealCardStaggerMs` (Big/Bigger 400, was 250) and `tuning.revealSilhouetteHoldMs` (1500) are
 * in src/content/tuning.json and changed there (WORK-038-3). Groups GREET and OUTFIT (§10) are for WORK-036/037.
 */
export const ROUNDUP = { coinsUnder50: 1, coins: 2, coinsThresholdCents: 50, flightMs: 450, glowMs: 300 } as const;
export const ROUNDUP_BIGGER = ROUNDUP;

export const PHASE = { punchMs: 260, sparkles: 24, confetti: 0, cameraPunch: null, collectStaggerMs: 120 } as const;
export const PHASE_BIGGER = { punchMs: 260, sparkles: 24, confetti: 60, cameraPunch: { zoom: 1.04, inMs: 120, backMs: 200 }, collectStaggerMs: 120 } as const;

export const CARD = { flipMs: 320, staggerMs: 250, holdMs: 600, sendMs: 400, px: 220, shimmerMs: 600 } as const;
export const CARD_BIGGER = { flipMs: 320, staggerMs: 250, holdMs: 700, sendMs: 400, px: 260, shimmerMs: 600 } as const;

export const COMPLETE = { hitstopMs: 120, confetti1: 140, confetti2: 60, wave2At: 430, wave3: null, shakeMs: 250, shakeIntensity: 0.006, rays: null } as const;
export const COMPLETE_BIGGER = { hitstopMs: 120, confetti1: 140, confetti2: 60, wave2At: 430, wave3: { count: 60, at: 900 }, shakeMs: 250,
  shakeIntensity: 0.006, rays: { alpha: 0.35, degPerSec: 20 } } as const;

export const REVEAL = { wobbleMs: 400, tileFlashMs: 120, fullFlash: null, resolveMs: 400, namePopMs: 300 } as const;
export const REVEAL_BIGGER = { wobbleMs: 400, tileFlashMs: null, fullFlash: { peak: 0.5, ms: 200 }, resolveMs: 400, namePopMs: 300 } as const;

export const ARRIVE = { hopMs: 200, stepDustMs: 400 } as const;
export const ARRIVE_BIGGER = ARRIVE;

export const STARS = { ringMs: 300, largePx: 56, smallPx: 24, staggerMs: 90, flightMs: 520, repeatFlightMs: 420, spreadPx: 70, pulseMs: 160,
  totalMs: { first: 1000, repeat: 500 } } as const;
export const STARS_BIGGER = STARS;

type HeartTimings = {
  hitstopMs: number | null; slowMo: { ms: number; rate: number } | null; charmPunchMs: number; dimInMs: number; dimIris: boolean; dimAlpha: number;
  hitAt: number; popMs: number; flashPeak: number; flashMs: number; shakeMs: number; shakeIntensity: number;
  confetti: number; confettiWave2: { count: number; at: number } | null; glyphs: number; hopMs: number; hops: number; petScale: number;
  holdMs: number; flyAt: number; flyMs: number; cardsAt: number; fadeOutMs: number; skipAfterMs: number; skipHoldMs: number;
  spotlightPx: number; spotlightFrom: 'full' | null; heartPx: number;
};
/** §C `HEART.totalMs` derived from the beat arithmetic: cards start at `cardsAt`, flip, stagger per extra card, hold, send, fade out. */
export function heartTotalMs(h: HeartTimings, card: { flipMs: number; staggerMs: number; holdMs: number; sendMs: number }, cards: number): number {
  return h.cardsAt + card.flipMs + Math.max(0, cards - 1) * card.staggerMs + card.holdMs + card.sendMs + h.fadeOutMs;
}
const HEART_BIG_VALUES: HeartTimings = {
  hitstopMs: 90, slowMo: null, charmPunchMs: 250, dimInMs: 300, dimIris: false, dimAlpha: 0.55, hitAt: 450, popMs: 450, flashPeak: 0.5, flashMs: 200,
  shakeMs: 200, shakeIntensity: 0.004, confetti: 120, confettiWave2: null, glyphs: 12, hopMs: 180, hops: 2, petScale: 2, holdMs: 400,
  flyAt: 1300, flyMs: 450, cardsAt: 1500, fadeOutMs: 300, skipAfterMs: 600, skipHoldMs: 600, spotlightPx: 340, spotlightFrom: null, heartPx: 240,
};
const HEART_BIGGER_VALUES: HeartTimings = {
  hitstopMs: null, slowMo: { ms: 450, rate: 0.3 }, charmPunchMs: 250, dimInMs: 450, dimIris: true, dimAlpha: 0.55, hitAt: 450, popMs: 450, flashPeak: 0.5,
  flashMs: 200, shakeMs: 260, shakeIntensity: 0.006, confetti: 180, confettiWave2: { count: 60, at: 450 }, glyphs: 20, hopMs: 180, hops: 3, petScale: 2.4,
  holdMs: 700, flyAt: 1600, flyMs: 450, cardsAt: 1800, fadeOutMs: 280, skipAfterMs: 600, skipHoldMs: 600, spotlightPx: 340, spotlightFrom: 'full', heartPx: 260,
};
/** The Heart moment v2 (spec §5); `totalMs(cards)` = 3370 (2 cards) / 3620 (3); Bigger 3750 / 4000. */
export const HEART = { ...HEART_BIG_VALUES, totalMs: (cards: number) => heartTotalMs(HEART_BIG_VALUES, CARD, cards) } as const;
export const HEART_BIGGER = { ...HEART_BIGGER_VALUES, totalMs: (cards: number) => heartTotalMs(HEART_BIGGER_VALUES, CARD_BIGGER, cards) } as const;

export const GARDEN = { pulseMs: 600, confetti: 16 } as const;
export const GARDEN_BIGGER = GARDEN;

export const REACT = { popMs: 160, riseMs: 400, hopMs: 160, shakeMs: 160 } as const;
export const REACT_BIGGER = REACT;

export const GREET = { offsetMs: 120 } as const;
export const GREET_BIGGER = GREET;

export const OUTFIT = { shiverMs: 300, dustAt: 300, swapAt: 470 } as const;
export const OUTFIT_BIGGER = OUTFIT;

/** §C "SFX semitone steps (tick arpeggio)": 0, +4, +7, +12, then hold +12 (gate Q6(a)); ticks ≥ `TICK_MIN_GAP_MS` apart. */
export const TICK_STEPS = [0, 4, 7, 12] as const;
export const TICK_MIN_GAP_MS = 45;
/** §C "SFX volumes (new)": Big = the three new ids (also in audio.ts SOUNDS); Bigger = the two not-delegated Bigger sounds. */
export const SFX_VOLUMES = { tick: 0.5, riser: 0.6, reveal: 0.7 } as const;
export const SFX_VOLUMES_BIGGER = { heartFanfare: 0.9, whoosh: 0.4 } as const;

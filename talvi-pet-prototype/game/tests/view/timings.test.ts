import { describe, expect, it } from 'vitest';
import * as T from '../../src/view/celebration/timings';
import tuning from '../../src/content/tuning.json';

/** VERIFY-WORK-038-1-04: spec §C (DEC-049) pasted whole, Big and Bigger side by side; one assertion per §C row. */
const rows: [string, unknown, unknown][] = [
    ['ROUNDUP.coins', [T.ROUNDUP.coinsUnder50, T.ROUNDUP.coins, T.ROUNDUP.coinsThresholdCents], [1, 2, 50]],
    ['ROUNDUP.flightMs', [T.ROUNDUP.flightMs, T.ROUNDUP_BIGGER.flightMs], [450, 450]],
    ['ROUNDUP.glowMs', [T.ROUNDUP.glowMs, T.ROUNDUP_BIGGER.glowMs], [300, 300]],
    ['PHASE.punchMs', [T.PHASE.punchMs, T.PHASE_BIGGER.punchMs], [260, 260]],
    ['PHASE.sparkles', [T.PHASE.sparkles, T.PHASE.confetti, T.PHASE_BIGGER.sparkles, T.PHASE_BIGGER.confetti], [24, null, 24, 60]],
    ['PHASE.cameraPunch', [T.PHASE.cameraPunch, T.PHASE_BIGGER.cameraPunch], [null, { zoom: 1.04, inMs: 120, backMs: 200 }]],
    ['PHASE.collectStaggerMs', [T.PHASE.collectStaggerMs, T.PHASE_BIGGER.collectStaggerMs], [120, 120]],
    ['CARD.flipMs', [T.CARD.flipMs, T.CARD_BIGGER.flipMs], [320, 320]],
    ['CARD.staggerMs', [T.CARD.staggerMs, T.CARD_BIGGER.staggerMs], [250, 250]],
    ['CARD.holdMs', [T.CARD.holdMs, T.CARD_BIGGER.holdMs], [600, 700]],
    ['CARD.sendMs', [T.CARD.sendMs, T.CARD_BIGGER.sendMs], [400, 400]],
    ['CARD.px', [T.CARD.px, T.CARD_BIGGER.px], [220, 260]],
    ['CARD.shimmerMs', [T.CARD.shimmerMs, T.CARD_BIGGER.shimmerMs], [600, 600]],
    ['COMPLETE.hitstopMs', [T.COMPLETE.hitstopMs, T.COMPLETE_BIGGER.hitstopMs], [120, 120]],
    ['COMPLETE.confetti1', [T.COMPLETE.confetti1, T.COMPLETE_BIGGER.confetti1], [140, 140]],
    ['COMPLETE.confetti2 / wave2At', [T.COMPLETE.confetti2, T.COMPLETE.wave2At, T.COMPLETE.wave3, T.COMPLETE_BIGGER.confetti2, T.COMPLETE_BIGGER.wave2At, T.COMPLETE_BIGGER.wave3],
      [60, 430, null, 60, 430, { count: 60, at: 900 }]],
    ['COMPLETE.shakeMs / shakeIntensity', [T.COMPLETE.shakeMs, T.COMPLETE.shakeIntensity, T.COMPLETE_BIGGER.shakeMs, T.COMPLETE_BIGGER.shakeIntensity], [250, 0.006, 250, 0.006]],
    ['COMPLETE.rays', [T.COMPLETE.rays, T.COMPLETE_BIGGER.rays], [null, { alpha: 0.35, degPerSec: 20 }]],
    ['REVEAL.wobbleMs', [T.REVEAL.wobbleMs, T.REVEAL_BIGGER.wobbleMs], [400, 400]],
    ['REVEAL.tileFlashMs', [T.REVEAL.tileFlashMs, T.REVEAL.fullFlash, T.REVEAL_BIGGER.tileFlashMs, T.REVEAL_BIGGER.fullFlash], [120, null, null, { peak: 0.5, ms: 200 }]],
    ['REVEAL.resolveMs', [T.REVEAL.resolveMs, T.REVEAL_BIGGER.resolveMs], [400, 400]],
    ['REVEAL.namePopMs', [T.REVEAL.namePopMs, T.REVEAL_BIGGER.namePopMs], [300, 300]],
    ['ARRIVE.hopMs', [T.ARRIVE.hopMs, T.ARRIVE_BIGGER.hopMs], [200, 200]],
    ['ARRIVE.stepDustMs', [T.ARRIVE.stepDustMs, T.ARRIVE_BIGGER.stepDustMs], [400, 400]],
    ['STARS.ringMs', [T.STARS.ringMs, T.STARS_BIGGER.ringMs], [300, 300]],
    ['STARS.largePx / smallPx', [T.STARS.largePx, T.STARS.smallPx, T.STARS_BIGGER.largePx, T.STARS_BIGGER.smallPx], [56, 24, 56, 24]],
    ['STARS.staggerMs', [T.STARS.staggerMs, T.STARS_BIGGER.staggerMs], [90, 90]],
    ['STARS.flightMs', [T.STARS.flightMs, T.STARS_BIGGER.flightMs], [520, 520]],
    ['STARS.repeatFlightMs', [T.STARS.repeatFlightMs, T.STARS_BIGGER.repeatFlightMs], [420, 420]],
    ['STARS.spreadPx', [T.STARS.spreadPx, T.STARS_BIGGER.spreadPx], [70, 70]],
    ['STARS.pulseMs', [T.STARS.pulseMs, T.STARS_BIGGER.pulseMs], [160, 160]],
    ['STARS.totalMs', [T.STARS.totalMs, T.STARS_BIGGER.totalMs], [{ first: 1000, repeat: 500 }, { first: 1000, repeat: 500 }]],
    ['HEART.totalMs (derived)', [T.HEART.totalMs(2), T.HEART.totalMs(3), T.HEART_BIGGER.totalMs(2), T.HEART_BIGGER.totalMs(3)], [3370, 3620, 3750, 4000]],
    ['HEART.hitstopMs', [T.HEART.hitstopMs, T.HEART.slowMo, T.HEART_BIGGER.hitstopMs, T.HEART_BIGGER.slowMo], [90, null, null, { ms: 450, rate: 0.3 }]],
    ['HEART.charmPunchMs', [T.HEART.charmPunchMs, T.HEART_BIGGER.charmPunchMs], [250, 250]],
    ['HEART.dimInMs / dimAlpha', [T.HEART.dimInMs, T.HEART.dimIris, T.HEART.dimAlpha, T.HEART_BIGGER.dimInMs, T.HEART_BIGGER.dimIris, T.HEART_BIGGER.dimAlpha],
      [300, false, 0.55, 450, true, 0.55]],
    ['HEART.hitAt', [T.HEART.hitAt, T.HEART_BIGGER.hitAt], [450, 450]],
    ['HEART.popMs', [T.HEART.popMs, T.HEART_BIGGER.popMs], [450, 450]],
    ['HEART.flashPeak / flashMs', [T.HEART.flashPeak, T.HEART.flashMs, T.HEART_BIGGER.flashPeak, T.HEART_BIGGER.flashMs], [0.5, 200, 0.5, 200]],
    ['HEART.shakeMs / shakeIntensity', [T.HEART.shakeMs, T.HEART.shakeIntensity, T.HEART_BIGGER.shakeMs, T.HEART_BIGGER.shakeIntensity], [200, 0.004, 260, 0.006]],
    ['HEART.confetti', [T.HEART.confetti, T.HEART.confettiWave2, T.HEART_BIGGER.confetti, T.HEART_BIGGER.confettiWave2], [120, null, 180, { count: 60, at: 450 }]],
    ['HEART.glyphs', [T.HEART.glyphs, T.HEART_BIGGER.glyphs], [12, 20]],
    ['HEART.hopMs / hops', [T.HEART.hopMs, T.HEART.hops, T.HEART_BIGGER.hopMs, T.HEART_BIGGER.hops], [180, 2, 180, 3]],
    ['HEART.petScale', [T.HEART.petScale, T.HEART_BIGGER.petScale], [2, 2.4]],
    ['HEART.holdMs', [T.HEART.holdMs, T.HEART_BIGGER.holdMs], [400, 700]],
    ['HEART.flyAt / flyMs', [T.HEART.flyAt, T.HEART.flyMs, T.HEART_BIGGER.flyAt, T.HEART_BIGGER.flyMs], [1300, 450, 1600, 450]],
    ['HEART.cardsAt', [T.HEART.cardsAt, T.HEART_BIGGER.cardsAt], [1500, 1800]],
    ['HEART.fadeOutMs', [T.HEART.fadeOutMs, T.HEART_BIGGER.fadeOutMs], [300, 280]],
    ['HEART.skipAfterMs', [T.HEART.skipAfterMs, T.HEART_BIGGER.skipAfterMs], [600, 600]],
    ['HEART.skipHoldMs', [T.HEART.skipHoldMs, T.HEART_BIGGER.skipHoldMs], [600, 600]],
    ['HEART.spotlightPx / heartPx', [T.HEART.spotlightPx, T.HEART.spotlightFrom, T.HEART.heartPx, T.HEART_BIGGER.spotlightPx, T.HEART_BIGGER.spotlightFrom, T.HEART_BIGGER.heartPx],
      [340, null, 240, 340, 'full', 260]],
    ['GARDEN.pulseMs / confetti', [T.GARDEN.pulseMs, T.GARDEN.confetti, T.GARDEN_BIGGER.pulseMs, T.GARDEN_BIGGER.confetti], [600, 16, 600, 16]],
    ['REACT.popMs / riseMs / hopMs / shakeMs', [T.REACT, T.REACT_BIGGER], [{ popMs: 160, riseMs: 400, hopMs: 160, shakeMs: 160 }, { popMs: 160, riseMs: 400, hopMs: 160, shakeMs: 160 }]],
    ['GREET.offsetMs', [T.GREET.offsetMs, T.GREET_BIGGER.offsetMs], [120, 120]],
    ['OUTFIT.shiverMs / dustAt / swapAt', [T.OUTFIT, T.OUTFIT_BIGGER], [{ shiverMs: 300, dustAt: 300, swapAt: 470 }, { shiverMs: 300, dustAt: 300, swapAt: 470 }]],
    ['SFX semitone steps (tick arpeggio)', [[...T.TICK_STEPS], T.TICK_MIN_GAP_MS], [[0, 4, 7, 12], 45]],
    ['SFX volumes (new)', [T.SFX_VOLUMES, T.SFX_VOLUMES_BIGGER], [{ tick: 0.5, riser: 0.6, reveal: 0.7 }, { heartFanfare: 0.9, whoosh: 0.4 }]],
];

describe('VERIFY-WORK-038-1-04 spec §C in timings.ts', () => {
  it.each(rows)('§C %s', (_name, actual, expected) => { expect(actual).toEqual(expected); });

  it('§C tuning.* rows stay in tuning.json (changed by WORK-038-3): revealSilhouetteHoldMs 1500 kept; revealCardStaggerMs 250 -> 400 and revealResolveMs 800 -> 400 (§C)', () => {
    expect([tuning.revealSilhouetteHoldMs, tuning.revealCardStaggerMs, tuning.revealResolveMs]).toEqual([1500, 400, 400]);
  });

  it('legacy exports unchanged (today\'s code compiles and plays as at 71f575c)', () => {
    // Review WORK-038-3 A4: the unused 8 × 48 px STARS_BURST (superseded by §4 Stars by value) is retired.
    expect('STARS_BURST' in T).toBe(false);
    expect([T.HEART_MOMENT.totalMs, T.HEART_MOMENT.popMs, T.HEART_MOMENT.dimAlpha, T.HEART_PET_DEPTH, T.DESIGN_TINT.depth, T.OUTLINE_BAND]).toEqual([2200, 520, 0.5, 8500, 1500, 1501]);
    expect([T.FLASH, T.FLASH_PEAK, T.CONFETTI_HOLD, T.CONFETTI_LIFETIME]).toEqual([350, 0.75, 1750, 4000]);
  });
});

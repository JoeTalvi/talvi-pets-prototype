import { z } from 'zod';
const Range = z.object({
    min: z.number(), max: z.number()
});
const GreetBand = z.object({
    minCompatibility: z.number().min(0).max(1),
    weights: z.object({ friendly: z.number().min(0), polite: z.number().min(0), surprised: z.number().min(0) })
});
const DEFAULT_GREET_BANDS = [
    { minCompatibility: 0.8, weights: { friendly: 6, polite: 3, surprised: 1 } },
    { minCompatibility: 0.55, weights: { friendly: 4, polite: 4, surprised: 2 } },
    { minCompatibility: 0, weights: { friendly: 2, polite: 5, surprised: 3 } }
];
export const TuningSchema = z.object({
    roomUnitPx: z.number(),
    avatarSpeedRu: z.number(),
    petSpeedRu: z.number(),
    arrivalImmunityMs: z.number(),
    facingDebounceMs: z.number(),
    eventIntervalMs: z.number(),
    starsFirstCopy: z.number(),
    starsRepeat: z.number(),
    walkOverMs: z.number(),
    wantBubbleEveryMs: z.number(),
    bubbleMs: z.number(),
    bubbleTextMs: z.number(),
    toastMs: z.number(),
    fulfilmentUseHoldMs: z.number(),
    // Play-session Q6: the pet waits this long after entry before its greeting walk, so the walk is seen after the door fade.
    greetingDelayMs: z.number().nonnegative().default(0),
    recentTargetPenalty: z.number(),
    recentTargetsKept: z.number(),
    hiddenSlotFromWant: z.number(),
    revealCardStaggerMs: z.number(),
    revealSilhouetteHoldMs: z.number(),
    revealResolveMs: z.number(),
    dtClampMs: z.number(),
    saveDebounceMs: z.number(),
    logRingLines: z.number(),
    verbHoldMs: Range, idleMs: Range, joystick: z.object({
        x: z.number(), bottomOffset: z.number(), baseDiameter: z.number(), knobDiameter: z.number(), range: z.number()
    }),
    // Indoor / outdoor presence (2026-11-03, replaces the WORK-035-1 per-visit roll): every `presenceRollMs` each house pet
    // with >= 1 Heart rolls once — inside with the player on the street it comes out with `presenceOutP`; outside it goes
    // back into its own house with `presenceInP`; with the player in its room it is brought in at that roll (so within
    // `presenceRollMs`) and stays in. Defaults so older tuning files parse.
    presenceRollMs: z.number().positive().default(8000),
    presenceOutP: z.number().min(0).max(1).default(0.35),
    presenceInP: z.number().min(0).max(1).default(0.15),
    // DEC-046 / gate Q10(a) (WORK-036-1): the pet-to-pet greeting; defaults so older tuning files parse
    greetRadiusRu: z.number().positive().default(1.5),
    greetCooldownMs: z.number().nonnegative().default(60000),
    greetMeetingMs: z.number().positive().default(2000),
    // Ordered bands: the first whose minCompatibility <= c applies (CHK-007-17: non-empty, a 0 band, positive weights)
    greetEmoteWeights: z.array(GreetBand).default(DEFAULT_GREET_BANDS)
});
export type Tuning = z.infer<typeof TuningSchema>;

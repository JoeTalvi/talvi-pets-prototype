import { z } from 'zod';
const Range = z.object({
    min: z.number(), max: z.number()
});
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
    })
});
export type Tuning = z.infer<typeof TuningSchema>;

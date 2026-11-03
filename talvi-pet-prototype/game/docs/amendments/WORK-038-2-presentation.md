# Amendment: presentation.md §7 / §9 (WORK-038-2, DEC-049 spec §5 Big)

- Date: 2026-11-03. Lane WORK-038-2, RUN-005, task TASK-249. As built on base bbc5c45 (WORK-038-1 gated head); code sha f3bc53b / 423a143 and the lane head named in the result.
- Contract-table row covered (this lane's part): the §7 Heart rows (the moment, `heart` view-timed on the hit frame, reduced motion inside the Heart); the reward-card block is used, not changed (WORK-038-1). Every number is read from `src/view/celebration/timings.ts` `HEART` / `CARD` (§C); none is re-typed.

## §7 The Heart moment v2 (replaces the WORK-032-2 "dim + heart pop for 2200 ms" row)

Two halves, one clock. The overlay half (`src/view/celebration/heartMoment.ts`, started by `ui/panels/dialogue.ts` on `heart.earned` in any scene) owns the timeline, the DOM, the sounds and the input; the scene half (`src/view/celebration/heartScene.ts`, started by `WorldScene` on the same event) owns the world effects and answers the overlay's window events.

| t (ms) | Beat | Overlay half | Scene half |
|---|---|---|---|
| 0 | Hitstop, punch | layer mounts (input captured), `riser` | `hitstop(scene, HEART.hitstopMs 90)`; the charm at `focusSlotId` punches 1 → 1.25 → 1 over `HEART.charmPunchMs` (replaces its placement pop) |
| 90 | Dim | dim fades in to `HEART.dimAlpha` 0.55 over `HEART.dimInMs` 300 (spotlight `HEART.spotlightPx`) | the §4 Stars burst plays as normal (WORK-038-3) |
| 450 `HEART.hitAt` | Hit | ♥ (`HEART.heartPx` 240, centre (960, 235)) pops 0 → 1.35 → 1 over `HEART.popMs`; 12 ♥ glyphs (`glyphBurst`, outward, fade); **`heart` plays here, once**; window event `tpp:heartHit {petId, at}` | `screenFlash {0.5, 200}`, `shake(200, 0.004)`, `burstConfetti` 120, angle 0–360 from the heart's centre, red/pink/gold; the ×2 (`HEART.petScale`) `react` pet fades in 160 and hops twice (y −36, `HEART.hopMs` 180 yoyo) |
| 900 | Hold | the heart breathes once (1 → 1.06 → 1, `HEART.holdMs`) | – |
| 1300 `HEART.flyAt` | Count | the ♥ shrinks to 0.2 and flies `HEART.flyMs` 450 ease-in to `.tpp-hearts`; at 1750 `tpp:heartArrived` (the HUD ticks n − 1 → n, 1.5× pulse) and `tick` +7 | – |
| 1500 + 250 i | Reveal | one reward card per entry (each charm type of `items`, the verb, the space; `vignette` none; at most 3), rising 120 px from the row at 50 % height while flipping in; `reveal` +2i st | – |
| last flip end + `CARD.holdMs` | Send | cards fly (`CARD.sendMs` 400) to the open chooser sheet, else `.tpp-design-toggle` (street: the site toggle); one rising `tick` per card (arpeggio reset for the moment; landings 60 ms apart) | – |
| Send end | Settle | layer fades over `HEART.fadeOutMs` 300; window event `tpp:heartSettle {ms}` | the ×2 pet fades over `ms` |
| `HEART.totalMs(n)` | End | `tpp:heartMomentEnd`, then `onEnd` (the held vignette box shows, unchanged) | the pet is removed |

Totals: 1 card 3120, 2 cards 3370, 3 cards 3620; a vignette-only reward (no card) settles after the Count: 2050 (fork (c)).

## Skip-to-result

- From `HEART.skipAfterMs` 600 after the trigger (after the hit), the first tap or key jumps to the result: the heart is in its counter (`tpp:heartArrived` dispatched now if it was not), every card is shown face-up (cards not yet mounted appear without a flip or sound). The frame holds `HEART.skipHoldMs` 600 (taps consumed); then Send at `CARD.sendMs / 2` (`RewardCard.send(to, onDone, CARD.sendMs / 2)`) and Settle at `HEART.fadeOutMs / 2`, then `onEnd`. A skip never hides a reward.
- A pet's first Heart (`heart.earned.hearts === 1`, no state) is not skippable until its last card's flip has ended (2070 for two cards, 2320 for three; with no card, the fly's end).
- A tap is ignored once Send has started, or when the skip would not end the moment sooner (`t > totalMs − (skipHoldMs + sendMs/2 + fadeOutMs/2)`).
- Every input during the moment is consumed (keys in the window capture phase; keyup passes).

## Street variant (fork (a))

On the street there is no Hearts counter: at 1300 the ♥ shrinks to 0.2 and fades in place over the same 450 ms, no `tick`; `tpp:heartArrived` is still dispatched at 1750. The mate's first Heart follows the first-Heart rule. Cards send to the site toggle (it carries `.tpp-design-toggle`).

## Reduced motion (ladder rule 5)

No hitstop, flash or shake (the blocks no-op) and no hop; the dim, the sounds (`riser`, `heart`, `tick`, `reveal`), the cards and the count stay; same total.

## Queue (ladder rule 2, fork (e))

A `heart.earned` while a moment plays is queued and starts after the first's `onEnd`. Only the newest scene half answers the overlay's events. The room's own pet stays visible and following the simulation (m4 row B3 not folded).

## §9 audio

`heart` moves from the moment's start (WORK-038-1 interim) to the hit frame. The moment also plays `riser` at 0, `tick` +7 on the heart's arrival, `reveal` +0/+2/+4 per card flip and the `tickSeq` arpeggio per card sent.

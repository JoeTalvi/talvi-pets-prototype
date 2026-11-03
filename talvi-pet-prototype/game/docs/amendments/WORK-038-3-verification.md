# Amendment: verification.md rows (WORK-038-3, DEC-049)

- Date: 2026-11-03. Lane WORK-038-3, RUN-005, task TASK-250. As built on base bbc5c45; code and tests in bbc5c45..HEAD of the lane branch. Evidence: `phase-4-build/runs/RUN-005/evidence/WORK-038-3/`.

## Re-timed rows (§C reason: `COMPLETE.hitstopMs` 120, DEC-049 spec §3 "Completion Big is the existing chain + 120 ms")

- **VERIFY-PRES-006** (DEC-032 timed total): every completing cutscene total is the 71f575c value + 120 ms (4 → 5: 4620 → 4740 ms; the hit moves from +470 to +590 after the completion dust); non-completing totals unchanged; still not skippable.
- **VERIFY-PRES-007** (completion beats): dust at t0, lv6 at +170, a 120 ms hitstop (+170 → +290), bloom 300 from +290, the hit at +590 (confetti 140 over 0–360°, flash 0.75 / 350, shake 250 / 0.006, `complete` once on this frame), a second wave of 60 at +1020, `cutsceneFinished` 1750 after the hit. Pinned in `tests/view/celebration.test.ts` ("presentation §7.4 completion hooks").

## Superseded rows

- **VERIFY-WORK-032-2-06** and **VERIFY-WORK-032-2-07** (the 8 × 48 px Stars burst on every gain, ≤ 900 ms): superseded by VERIFY-WORK-038-3-04 (Stars by value, Vitest) and VERIFY-WORK-038-3-12 (the live loop). `tests/ui/starsBurst.test.ts` was rewritten; the `STARS_BURST` constant stays exported (unused) because `tests/view/timings.test.ts` pins the legacy exports.

## New rows

| ID | Requirement | Check | Where |
|---|---|---|---|
| VERIFY-WORK-038-3-01 | §1 round-up: 1 (< 50¢) / 2 coins leave at 150 and land at 600; the nudge, 300 ms glow and `tick` −5 st @ 0.35 start on landing; trickle: no coin, no sound, glide at the event | Vitest | `tests/view/streetHud.test.ts` |
| VERIFY-WORK-038-3-02 | §2 phase rise: pops `tick` +2 st per phase, `riser` per anticipation, swap punch 260 + 24 gold sparkles + `phasePop` (+2 st per stage), no flash / shake / hitstop, plan total unchanged; Collect 120 ms apart with the tick arpeggio; clue cards flip in 400 ms apart with `reveal` +0 / +2 / +4 | Vitest | `tests/view/celebration.test.ts`, `tests/view/popups.test.ts` |
| VERIFY-WORK-038-3-03 | §3 completion plan and hit (see VERIFY-PRES-007), the reveal (wobble, `riser` at hold − 450, tile flash 120, resolve 400, 24 glyphs, `reveal` + `heart`), the Owl door (hop 200, 20 confetti, `reaction` +4 st) | Vitest | `celebration.test.ts`, `popups.test.ts`, `arrivalWalk.test.ts` |
| VERIFY-WORK-038-3-04 | §4 Stars by value on the interior bar and the site pill; fill steps per arrival with a 160 ms pulse and `tick` 0 / 4 / 7 / 12; loss red delta only; hidden Stars nothing; Hearts seam untouched | Vitest | `tests/ui/starsBurst.test.ts`, `tests/ui/streetSiteHud.test.ts`, `tests/view/hudStars.test.ts` (unchanged, green) |
| VERIFY-WORK-038-3-05 | §6 milestone tiles flip in 250 ms apart over 320 with `reveal` per tile; "New" only on a never-granted type | Vitest | `tests/view/popups.test.ts` |
| VERIFY-WORK-038-3-06 | §7 the space toast as a card (punch, `reveal`, `tpp:spaceToastShown`); the street beacon (pulse 600 yoyo × 3, 16 confetti, "New" bubble); fork (b) next Street create, once | Vitest | `tests/view/streetSite.test.ts` |
| VERIFY-WORK-038-3-07 | §8 the mate: 🎵 + dust 0.4 + `reaction` at 0, a puff every 400 ms, 16 ♥ + `reaction` +4 st at the end; finish timing unchanged | Vitest | `tests/view/arrivalWalk.test.ts` |
| VERIFY-WORK-038-3-08 | §9 love pop + 3 ♥ + hop, dislike shake, pop otherwise, no view `reaction` play; first use 6 ✨ + `tick` +12 once; B9 the 😢 line once untapped | Vitest | `tests/view/bubbles.test.ts` |
| VERIFY-WORK-038-3-09 | B8 the "none left" label below the sprite (static, last in the card column), ink on paper2 ≥ 4.5:1, label not dimmed | Vitest + still | `tests/ui/chooserNoneLeft.test.ts`; still `captures/b8-none-left-1080.png` when captured |
| VERIFY-WORK-038-3-10 | Reduced motion: completion without hitstop / flash / shake (confetti, sounds, timings kept); the reveal tile flash dropped | Vitest | `celebration.test.ts`, `popups.test.ts` |
| VERIFY-WORK-038-3-11 | Tier exclusivity: `screenFlash` / `hitstop` / `shake` never called outside the §3 completion (and the Heart files) | Vitest spies + grep | `starsBurst.test.ts`, `celebration.test.ts`, `arrivalWalk.test.ts`, `streetSite.test.ts`; `evidence/WORK-038-3/exclusive-callers.txt` |
| VERIFY-WORK-038-3-12 | Live loops per moment with sound times relative to their trigger | Chrome capture | `tests/view/capture/work-038-3.mjs` (not built in this lane: see the lane journal) |
| VERIFY-WORK-038-3-13 | Smoke and m1–m3 traces green on this head, or a proven patch per break | e2e | `evidence/WORK-038-3/{smoke,m1-trace,m2-trace,m3-trace}/`, `patches/` |
| VERIFY-WORK-038-3-14 | VERIFY-PRES-006 / -007 re-timed, VERIFY-WORK-032-2-06 / -07 superseded (this file) | grep | `evidence/WORK-038-3/verify-rows.txt` |

## Changed test pins (bbc5c45 → this lane)

- `celebration.test.ts`: 4 → 5 total 4620 → 4740; the completion beat list gains `completionHitstop` and `confettiWave`; the 1 → 4 tap path's sound list is `tick` ×3, then `riser` / `phasePop` per stage (was `phasePop` ×3); the completion row reads `complete` on the +590 hit with 140 then 60 confetti.
- `timings.test.ts`: `PHASE.confetti` 0 → null (review advisory A7); the tuning row reads `revealCardStaggerMs` 400, `revealResolveMs` 400.
- `streetHud.test.ts`: "every roundup.fired nudges" waits for the end of the dispatch and the 600 ms landing before reading `barMs` 300.
- `panels.test.ts`: the Stars fill width is read after the arrivals (1000 ms).

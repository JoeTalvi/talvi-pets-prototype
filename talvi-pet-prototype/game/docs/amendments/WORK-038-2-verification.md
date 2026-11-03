# Amendment: verification.md (WORK-038-2, DEC-049 spec §5)

- Date: 2026-11-03. Lane WORK-038-2, RUN-005, task TASK-249. As built on base bbc5c45 (WORK-038-1 gated head); code at f3bc53b / 423a143 and the lane head named in the result.
- Contract-table row covered (this lane's part): the Heart rows — the moment (beat order and totals from §C), skip-to-result, first-Heart unskippable, reduced motion inside the Heart, `heart` not before its hit frame.

## Retired and superseded (gate Q2(a): "retire VERIFY-WORK-032-2-08 … replace them with the DEC-049 rows")

- **VERIFY-WORK-032-2-08** (Heart moment then the vignette: box hidden until 2200 ms; "a skip at 300 ms is ignored, a skip at 700 ms ends it") — **retired**. Its edge cases (keys consumed / keyup passes, store advance or close during the moment, reset cancels, Stars hidden still plays, Hearts pulse) are carried by VERIFY-WORK-038-2-02 and -05. The WORK-038-1 interim rows VERIFY-WORK-038-1-10 ("`sfx/heart` once at the moment start") and the -09 heartMoment clause ("`tpp:heartArrived` at the moment finish") are superseded by -01 (heart on the hit frame, arrival at 1750).
- **VERIFY-WORK-032-2-09** (Heart moment live) — its skip clause ("skip ends early") is **superseded** by VERIFY-WORK-038-2-09 (2): a skip jumps to the result, holds 600 ms, then half Send/Settle. The rest of -09 (dim → heart → confetti → react → vignette box) is carried by -09 (1).

## New rows

| ID | Check | Fixture | Expected | Evidence |
|---|---|---|---|---|
| VERIFY-WORK-038-2-01 | Vitest `tests/ui/heartMoment.test.ts` (jsdom, fake timers + performance) | FX-CONTENT-MIN, `dog-bed` in `large-1` (2 cards); `soft-nap` reward + `sit-on` verb (3 cards) | hitstop at 0 (90), `riser` at 0, dim at 90 (α 0.55), hit at 450: pop, flash {0.5, 200}, shake {200, 0.004}, 120 confetti, 12 ♥, ×2 pet with 2 hops (180 yoyo); `heart` once at 450, never before; `tpp:heartArrived` + `tick` +7 at 1750; cards 1500/1750(/2000) with `reveal` +0/+2(/+4); send 2670 / 2920 with rising ticks; settle; `onEnd` + vignette line at 3370 / 3620; 1 card 3120 | `vitest-heart.txt` |
| VERIFY-WORK-038-2-02 | same file | second Heart (`hearts: 2`) | tap 300 consumed; 700 → result (arrived, all cards face-up); 1000 consumed; hold end 1300 → send 200 → settle 150 at 1500 → `onEnd` 1650; keys behave as taps, never reach the game keyboard, keyup passes; no store dispatch | `vitest-heart.txt` |
| VERIFY-WORK-038-2-03 | same file | first Heart (`hearts: 1`), 2 cards | taps 700/1500/2000 ignored; 2100 (last flip ends 2070) → result; state keys unchanged | `vitest-heart.txt` |
| VERIFY-WORK-038-2-04 | same file + `heartMomentData()` | items (rug held 0, cushion held 2) + verb; items + space + vignette; 4 entries | one card per charm type + verb + space, ≤ 3; "New" only on the type held 0; verb card "Dog can now sit-on"; vignette-only → no cards, `onEnd` 2050 (fork (c)) | `vitest-heart.txt` |
| VERIFY-WORK-038-2-05 | same file | as -01 | box hidden until `onEnd`; store advance/close during the moment; reset mid-moment cancels (no layer, cards, glyphs, key capture, late show); Stars hidden still plays, Hearts pulse once; count n − 1 until 1750 then n | `vitest-heart.txt` |
| VERIFY-WORK-038-2-06 | same file, `matchMedia` reduce | as -01 | no hitstop, flash, shake or hop; dim, `riser`, `heart`, `tick`, `reveal`, cards, count; same total | `vitest-heart.txt` |
| VERIFY-WORK-038-2-07 | Vitest `tests/view/heartStreet.test.ts` | Street, mate arrived, `debugFulfilActiveWant owl-mate` (`hearts: 1`) | ×2 mate + confetti at the hit; tap at 700 ignored (first Heart); `tpp:heartArrived` at 1750 with no tick, the ♥ faded in place; the moment and the big pet end at the total | `vitest-heart-street.txt` |
| VERIFY-WORK-038-2-08 | Vitest `tests/view/heartScene.test.ts` | Interior | charm punch tween at `heart.earned`; the big pet mounts on `tpp:heartHit`; the room pet stays visible and at its simulated position during the moment (B3 not folded) | `vitest-heart-street.txt` |
| VERIFY-WORK-038-2-09 | live capture `tests/view/capture/work-038-2.mjs` | dog-room-intro-done; then its next want; mate-arrived steps | (1) first Heart plays to the vignette despite taps every 200 ms until its cards show; (2) a tap at ≈ 800 ms → result, hold, half send/settle; (3) the street variant; rows record t of `heart`, `tpp:heartArrived`, card mounts, settle and end after `heart.earned` | `loops/heart-{first,skip,mate}.mp4`, `rows/heart-*.json`, `captures/heart-*-1080.png` |
| VERIFY-WORK-038-2-10 | smoke + m1/m2/m3 traces | as their scripts | exit 0, every beat ok, order unchanged, m3 38/38, zero console errors; re-pins below | `smoke/`, `m1-trace/`, `m2-trace/`, `m3-trace/` |

## Test pins changed and trace re-pins (gate Q2(c), Q18)

- `tests/view/dialogue.test.ts` VERIFY-MEC-008-015 (jsdom timing): the box now shows at `max(reacting + fulfilmentUseHoldMs, ceil100(HEART.totalMs(2)))` — the held box waits for the moment's end, §C `HEART.totalMs(2)` 3370 for the Dog's two-card first want (was: `reacting + fulfilmentUseHoldMs` exactly, with the 2200 ms moment inside it). Outside this order's named test list: recorded as a lane FORK.
- `tests/ui/heartMoment.test.ts`, `tests/view/heartScene.test.ts`: rewritten to the DEC-049 rows above (the 038-1 "no moment end removes the pet at `HEART_MOMENT.totalMs`" case is gone: the pet now appears on the hit event and leaves on settle/end).
- `tests/e2e/smoke.mjs`, `m1-trace.mjs`, `m2-trace.mjs`: green at the lane head with **no edit** — the existing quiet-window drains and the m1 vignette-box bound (≤ 7,000 ms after `charm.placed`) already cover the 3370 ms first Heart.

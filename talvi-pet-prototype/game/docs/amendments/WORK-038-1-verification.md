# Amendment: verification.md (WORK-038-1, DEC-049)

- Date: 2026-11-02. Lane WORK-038-1, RUN-005, task TASK-238. As built at the lane head.
- Contract-table row covered (this lane's part): the foundation rows; the per-moment, skip-to-result, first-Heart, no-sound-before-hit and tier-exclusivity rows are WORK-038-2 / -3.

## Retired (gate Q2(a): "retire … the event-timed audio tests through the amendment, replace them with the DEC-049 rows")

- `tests/app/audio.test.ts` "presentation §9 audio plays place, heart and reaction in event order" (asserted `sfx/heart` on `heart.earned`) and "plays complete on project.completed" (asserted `sfx/complete` on `project.completed`): replaced by VERIFY-WORK-038-1-01 rows asserting neither event plays.
- `tests/ui/heartMoment.test.ts` "VERIFY-WORK-032-2-08: sfx/heart plays exactly once (audio.ts on heart.earned; the moment adds none)": replaced by VERIFY-WORK-038-1-10 (once, at the moment start). VERIFY-WORK-032-2-08 itself is retired by WORK-038-2.

## New rows

| ID | Check | Evidence |
|---|---|---|
| VERIFY-WORK-038-1-01 | Vitest `tests/app/audio.test.ts`: `{ volume, detune }`; eight SOUNDS; heart/complete not event-timed; reaction pitch map; `play('tick', { semitones: 7 })` → detune 700 at 0.5 | `vitest-audio.txt` |
| VERIFY-WORK-038-1-02 | Live: `game.sound.play` recorder — love reaction detune 300, ticks 0/400/700/1200 (`tests/view/capture/work-038-1.mjs`) | `rows/detune.json` |
| VERIFY-WORK-038-1-03 | Asset gate + ffprobe: three SFX within limits, rows appended only | `check-assets.txt`, `sfx-durations.txt`, `manifest-diff.txt` |
| VERIFY-WORK-038-1-04 | Vitest `tests/view/timings.test.ts`: every §C row, Big and Bigger; derived Heart totals; legacy exports | `vitest-timings.txt` |
| VERIFY-WORK-038-1-05 | Vitest `tests/ui/rewardCard.test.ts` | `vitest-blocks.txt` |
| VERIFY-WORK-038-1-06 | Vitest `tests/view/blocks.test.ts`: hitstop (sim keeps stepping), reduced motion, confetti/flash params, shake | `vitest-blocks.txt` |
| VERIFY-WORK-038-1-07 | Vitest `tests/ui/glyphBurst.test.ts` | `vitest-blocks.txt` |
| VERIFY-WORK-038-1-08 | Vitest `tests/view/tickSeq.test.ts` (gate Q6(a)) | `vitest-blocks.txt` |
| VERIFY-WORK-038-1-09 | Vitest `tests/view/heartScene.test.ts` (Interior + Street mate) + `tests/view/hudStars.test.ts` hearts rows (n − 1, then n with 1.5× on `tpp:heartArrived`; fallbacks) | `vitest-seams.txt` |
| VERIFY-WORK-038-1-10 | Vitest `tests/ui/heartMoment.test.ts` + `tests/view/celebration.test.ts`: `sfx/heart` once at moment start; `sfx/complete` once at the confetti beat | `vitest-seams.txt` |
| VERIFY-WORK-038-1-11 | Loop of the six new-sound plays (audio mixed from the recorded plays; listened verdict at the play session) | `loops/sfx-set.mp4` |

## Changed pins

- Loader: `tests/e2e/smoke.mjs` boot step 99 → 102; `tests/e2e/webkit-boot.mjs` `CHROMIUM_TOTAL` 99 → 102, its `sfx` list to eight ids, `sfxCachedAll5` → `sfxCachedAll8`; `tests/e2e/m3-trace.mjs` `SFX` eight ids and the seed beat title ("eight SFX cached"). WebKit has no live run on this host.
- Hearts count: `tests/view/hudStars.test.ts` and `tests/view/wantPanel.test.ts` read "♥ n − 1" until `tpp:heartArrived`; `tests/ui/heartMoment.test.ts` Stars-hidden row reads the pulse at the moment's end.
- No m1/m2/m3 trace ceiling changed (gate Q18: WORK-038-2 re-pins them).

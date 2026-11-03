# Amendment: presentation.md §7 / §8 / §9 (WORK-038-3, DEC-049)

- Date: 2026-11-03. Lane WORK-038-3, RUN-005, task TASK-250. As built on base bbc5c45 (the gated WORK-038-1 head); code in bbc5c45..HEAD of `gra/talvi-pets-prototype/RUN-005/WORK-038-3` (the commit carrying this file is the lane head the reviewer reads).
- Contract-table rows covered (roadmap §"Amendment, 2026-11-02 (evening)"): `systems/presentation.md` §7 / §9 for every moment except the Heart — `complete` and `phasePop` view-timed on their hit frames, the reduced-motion rule, tier exclusivity — plus the §8 HUD / toast / popup / chooser changes and m4 rows B8 and B9. Every number is a `timings.ts` §C constant or a named local constant beside its use (order fork (d)).

## The interim visible changes, in one place (review advisory A6)

| Moment | Was (bbc5c45) | Now |
|---|---|---|
| §1 round-up | bar nudges 300 ms at `roundup.fired` | 1 / 2 coins fly toast → bar 150 → 600; nudge, 300 ms glow and `tick` −5 st @ 0.35 on landing |
| §2 phase rise | `phasePop` on each chunk pop | `tick` +2 st per phase crossed on the pops, `riser` at each anticipation, `phasePop` (+2 st per stage) on the swap with a squash punch and 24 gold sparkles |
| §2 Collect | tiles flash 50 ms apart | 120 ms apart, each rises 40 px and fades, `tick` arpeggio |
| §2 reveal popup | cards appear 250 ms apart | cards flip in 400 ms apart (`tuning.revealCardStaggerMs` 400), "Phase n" shimmer, `reveal` +2 st each |
| §3 completion | confetti 60 + flash + `complete` at +470 | 120 ms hitstop at +170, bloom +290, hit at **+590**: 140 confetti 0–360°, flash 0.75, shake 250 / 0.006, `complete`; wave 2 of 60 at +1020; every total +120 |
| §3 reveal resolve | silhouette 1500, resolve 800 | wobble 1 ↔ 1.03 × 2, `riser` at hold − 450, tile flash 120, resolve 400 (`tuning.revealResolveMs`), 24 ✦, `reveal` + `heart`, name pop 0 → 1.2 → 1 |
| §3 Owl door | 🎵 only | start dust 0.4; door hop 24 px / 200, 20 red + gold confetti, `reaction` +4 st |
| §4 Stars | 8 × 48 px ★ on every gain, fill tween at the event | by value: first copy ring + 8 small + 1 large ★ per ★ (520), repeat 2 small + 1 large (420); fill steps per arrival with a 1.08 pulse and `tick` 0/4/7/12; the same on the street site pill |
| §6 milestone tiles | static | flip in 250 ms apart over 320, `reveal` +2 st per tile, "New" ribbon on a never-granted type |
| §7 garden | plain toast | toast as a reward card (gold border, 🌱, punch 1.06, `reveal`); street beacon: site pulse 1.06 × 3, 16 green + gold confetti, "New" bubble |
| §8 mate | 🎵 at the path end | 🎵 + dust 0.4 + `reaction` at 0, a 0.25 puff every 400 ms, hop + 16 ♥ + `reaction` +4 st at the end |
| §9 reactions | emoji only | love pop 1.15 + 3 ♥ + pet hop 10 px; dislike ±3 px shake; others pop; first use per (pet, type) 6 ✨ + `tick` +12 |
| B8 | "none left" pill top-right over the sprite, whole card at α 0.5 | label below the sprite, ink on paper2 (≈ 11:1), only the other children dimmed |
| B9 | 😢 line on tap only | 😢 for `bubbleMs`, then its line once untapped for `bubbleTextMs` |

## §7 celebration (cutscene, completion, reveal, arrival)

- `planCelebration`: stage beats unchanged (`ANTICIPATION` 450, dust +450, swap +620, holds); plan totals for non-completing cues unchanged.
- `completionBeats` (`timings.ts`): `completionDust` t0 (1000), `completionSwap` +170 (duration `COMPLETE.hitstopMs + BLOOM` = 420), **`completionHitstop` +170 (120)**, `confetti` +590 (hold `CONFETTI_HOLD` 1750), **`confettiWave` +590 + `COMPLETE.wave2At` = +1020**, `finish` at +2340. 4 → 5 completing chain: 4620 → **4740**.
- `CelebrationDirector`: `completionHitstop` calls `hitstop(scene, 120)` (WORK-038-1 block; cancelled by `clear()`); the bloom (`scale` 1.08 yoyo, 150 each way) starts `COMPLETE.hitstopMs` after the swap; the hit plays `burstConfetti(…, { count: 140, angle: 0–360 })`, `screenFlash` (defaults 0.75 / 350), `shake(250, 0.006)` and `complete`; `confettiWave` bursts 60 (default band). `riser` plays on `completionDust` and on each stage `anticipation`.
- Stage swap: texture, zoom back (unchanged), squash punch (`PUNCH_SQUASH` 0.92 / 1.08 over `PHASE.punchMs` 260, last leg Back.Out), 24 sparkles tinted `0xd9a441` in a 240–300° cone from the roof strip, `phasePop` with `semitones = 2 × (phase − fromPhase − 1)`. Chunk pops play `tick` at the same +2 st step (the p = 5 cascade +2 per chunk). No `screenFlash`, `hitstop` or `shake` in the rise.
- Reveal popup (`revealPopup.ts`): see the table; the tile flash is a DOM span on `.tpp-mystery-tile` (not `screenFlash`).
- `ArrivalWalk`: start poof `ARRIVE_BEATS.startDustScale` 0.4 for both arrivals; site arrival adds the start 🎵 + `reaction` and step puffs every `ARRIVE.stepDustMs`; door/path end hop `ARRIVE.hopMs` (100 up, 100 down), `reaction` +4 st, Owl 20 confetti `[0xb5523f, 0xd9a441]`, mate 16 ♥ (`glyphBurst` on `#panels`). `plan` (doorMs, fadeMs, finishMs) unchanged.

## §8 HUD, toast, popups, chooser

- `hudInterior` / `hudStreet`: `starsBurst` rebuilt (see the mec-006 amendment); `createStarsFill` holds the fill back by the ★ in flight; the label updates at the event. The Hearts-counter seam (WORK-038-1) is untouched.
- `hudStreet`: the events-arm nudge is decided at the end of the dispatch: if the toast launched coins (`ROUNDUP_COINS` window event, `detail.landMs` 600) the bar holds the pre-purchase value and nudges on landing; otherwise (toast held / queued) it nudges at once. Trickle unchanged. The site pill takes the Stars burst on `space.stars.changed` from the slot the street announces (`SITE_SLOT_AT`).
- `toast`: round-up items launch the coins; the `space` item carries `siteId`, gets class `tpp-toast-card` and fires `SPACE_TOAST_SHOWN`.
- `milestonePopup`: `COLLECT.staggerMs` = `PHASE.collectStaggerMs` 120 (`collectMs(n)` = 300 + 120(n − 1) + 500 + 200); tiles flip in on open (`TILE_FLIP_FRAMES`, the reward-card keyframes) with the `tpp-reward-card-new` ribbon when the type has no inventory key yet.
- `StreetScene.beacon(siteId)`: fork (b) — a toast shown with no live street is kept (module memory) and plays on the next Street create, once; `state.reset` clears it; a reload never replays it.
- Chooser (B8): CSS only (`panels.css`); `tpp.chooser.noneLeft` and the template unchanged.

## §9 audio frames (view-timed)

- `complete`: once, on the completion hit frame (+590); not at `project.completed` or Collect.
- `phasePop`: on each stage swap (+620 into the stage), +2 st per stage; no longer on chunk pops.
- `riser`: only §2 anticipations, §3 completion dust and the reveal hold (and the Heart, WORK-038-2).
- `tick`: chunk pops, Collect tiles, Stars arrivals, the coin landing, first use.
- `reveal`: milestone tiles, clue cards, the reveal resolve, the space card. `reaction`: the arrival start / door only (the `pet.reacted` sound stays WORK-038-1's).

## Tier exclusivity and reduced motion (ladder rules 1 and 5)

- `screenFlash`, `hitstop` and `shake` are called in this lane only by `CelebrationDirector` (completion hit and hitstop). The street beacon, Stars, Collect, tiles, toast, arrival and reactions call none of them, and nothing here adds a dim.
- Under `prefers-reduced-motion: reduce`: the blocks no-op (hitstop, shake, flash — WORK-038-1); the reveal tile flash is skipped (`reducedMotion()`); confetti, glyphs, cards, sounds and timings are kept.

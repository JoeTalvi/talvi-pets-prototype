# Amendment: presentation.md §7 / §9 (WORK-038-1, DEC-049)

- Date: 2026-11-02. Lane WORK-038-1, RUN-005, task TASK-238. As built at lane head (see the commit carrying this file; code from 0956e5b..b07cd87).
- Contract-table rows covered (roadmap §"Amendment, 2026-11-02 (evening)"): `systems/presentation.md` §7 / §9 — the timings table as the §C constants, `play(id, { volume, detune })`, `heart`/`complete` view-timed (interim frames), three new ids, the reduced-motion rule, the reward-card block. The moment rows (beats) are WORK-038-2 / WORK-038-3.

## §9 audio (TECH-015)

- `AudioPlayer.play(id, { volume, detune })`, `detune` in cents (Phaser `SoundConfig.detune`). `src/main.ts` forwards the options object unchanged (`game.sound.play(id, opts)`).
- `Audio.play(sound, opts?: { semitones?: number; volume?: number })`: `detune = 100 × semitones` (omitted 0); `volume` overrides the SOUNDS volume. Existing calls are unchanged. Unavailable ids stay silent with no record; the locked and failure rules are unchanged.
- Eight ids (`SOUNDS`): place `sfx/place` 0.6, heart `sfx/heart` 0.8, complete `sfx/complete` 0.9, reaction `sfx/reaction` 0.5, phasePop `sfx/phase-pop` 0.7, **tick `sfx/tick` 0.5, riser `sfx/riser` 0.6, reveal `sfx/reveal` 0.7** (§C "SFX volumes (new)").
- Event subscriptions now: `charm.placed` → place; `pet.reacted` → reaction with the pitch map `REACTION_PITCH` (love +3 st, like 0, dislike −4 st at 0.35; greeting, interrupted, stripped plain); `audio.muteChanged` → setMute. **`heart.earned` and `project.completed` no longer play** (gate Q2(a)).
- View-timed calls, interim frames (WORK-038-2 / -3 move them to the §5 / §3 hit frames): `heart` once at the Heart moment's start (`createHeartMoment(root, onEnd, audio)` plays it when the layer mounts; `dialogue.ts` passes `() => context.audio`); `complete` on the completion confetti + flash beat (`CelebrationDirector.confetti()`, start + 470 ms); `phasePop` unchanged (the chunk pop).
- Tick arpeggio (gate Q6(a)): `createTickSeq(audio, now?)` in `src/view/celebration/tickSeq.ts` — `tick()` plays `tick` at 0, +4, +7, +12, then +12 held; a tick < 45 ms after the last played one is dropped; `reset()` (or a new sequence) restarts at 0.

## §7 celebration timings

- The spec §C table replaces the §7 celebration timings table. It lives in `src/view/celebration/timings.ts` as Big `X` + Bigger `X_BIGGER` per group: `ROUNDUP`, `PHASE`, `CARD`, `COMPLETE`, `REVEAL`, `ARRIVE`, `STARS`, `HEART` (with `totalMs(cards)` derived: 3370 / 3620; Bigger 3750 / 4000), `GARDEN`, `REACT`, `GREET`, `OUTFIT`, `TICK_STEPS` [0, 4, 7, 12], `TICK_MIN_GAP_MS` 45, `SFX_VOLUMES`, `SFX_VOLUMES_BIGGER`. "–" cells are `null`. "Bigger" is constants only (no runtime switch).
- `tuning.revealCardStaggerMs` and `tuning.revealSilhouetteHoldMs` stay in `src/content/tuning.json` (§C names them `tuning.*`); unchanged by this lane (250 / 1500), WORK-038-3 changes the first.
- Every pre-existing export (`DESIGN_TINT`, `OUTLINE_BAND`, `STARS_BURST`, `HEART_MOMENT`, `HEART_PET_DEPTH`, the cutscene constants, `planCelebration`) is kept unchanged.

## Shared blocks (spec §0), `src/view/celebration/`

- `rewardCard.ts`: `createRewardCard(root, ctx: { content, assets, text }, spec: RewardCardSpec | RewardCardFace, { at, px? }) → { el, face, flipIn(delayMs?), send(to, onDone?), cancel() }`. `RewardCardSpec` = `items {typeId, heldBefore}` | `verb {petId, verbId}` | `space {siteId}`; a later kind (outfit, WORK-037-3, gate Q13) passes a resolved `RewardCardFace { kind, imageId?, glyph?, name, isNew }`. Card `CARD.px` 220, `ns-tile` nine-slice (as `.tpp-reward-tile`), charm `sprite` via `image()` or the verb `emote` at 120 px, name line, "New" ribbon iff `heldBefore === 0` (string `tpp.reward.new`); verb text `tpp.reward.verb` "{pet} can now {verb}" with `verbs[].name`; space card 🌱 + `tpp.toast.space`. Flip-in rotateY 90° → 0° and scale 1.1 → 1 over `CARD.flipMs` 320; `send()` shrinks and flies over `CARD.sendMs` 400 and removes itself; `pointer-events: none`. Styles: one `tpp-reward-card*` block at the end of `src/ui/styles/panels.css`.
- `hitstop.ts`: `hitstop(scene, ms) → { cancel() }` = `scene.tweens.pauseAll()` + `scene.anims.pauseAll()`, resumed after `ms` (setTimeout); the store and scene update keep stepping; the DOM is not frozen.
- `Confetti.ts`: `burstConfetti(scene, bounds, { count?, angle?, tints? })` (defaults 60, 200–340°, `CONFETTI_TINTS`), `screenFlash(scene, { peak?, ms? })` (defaults 0.75 / 350), new `shake(scene, ms, intensity)` (main camera).
- `glyphBurst.ts`: `glyphBurst(root, { glyph, px, count, from, to?, spreadPx, staggerMs, flightMs, color?, onArrival?(i) }) → { el, totalMs, cancel() }`; `clearGlyphBursts(root)`. With `to`, `onArrival(i)` at `i × staggerMs + flightMs`; without, spray and fade. `totalMs = (count − 1) × staggerMs + flightMs`.
- `motion.ts`: `reducedMotion()` reads `matchMedia('(prefers-reduced-motion: reduce)')`; false where `matchMedia` is absent.

## Reduced motion (tiers.md ladder rule 5)

- Under `prefers-reduced-motion: reduce`: `hitstop` is a no-op, `screenFlash` draws nothing (returns an already-destroyed α 0 rectangle), `shake` is a no-op. Confetti, glyphs, cards and sound are kept.

## Heart moment, scene-generic (fork (a))

- The scene half moved verbatim from `InteriorScene.heartMoment()` to `startHeartScene(scene, { petId, focusSlotId, charmAt })` in `src/view/celebration/heartScene.ts`, subscribed once in `WorldScene` (Interior and Street). `focusSlotId` is the `want.fulfilled` slot of the same dispatch. `InteriorScene` and `StreetScene` expose `charmAt(slotId)`. `WorldScene.heartPet` reads the newest scene half's big pet.
- The overlay half (`dialogue.ts`) now starts on `heart.earned` in any scene (was interior only), so the mate's Heart on the street plays the same moment (dim, heart, ×2 mate `react`, confetti).
- Hearts-counter seam (`hudInterior.ts`): `heart.earned` holds the count at n − 1; window event `tpp:heartArrived` (`HEART_ARRIVED`, exported from `heartMoment.ts`) shows n with a 1.5× pulse (was 1.3× at `heart.earned`); `tpp:heartMomentEnd`, `state.reset` or a 5000 ms fallback release it without a pulse. Interim: `heartMoment.ts` dispatches `tpp:heartArrived` at its finish and cancel, immediately before `tpp:heartMomentEnd`.

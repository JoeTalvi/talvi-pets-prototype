# Amendment WORK-037-3 — presentation.md (as-built), 2026-11-03

Package WORK-037 view lane (RUN-005, TASK-256), MILESTONE-011. Describes lane head 3a2da74 on base f0c57d5 (the gated WORK-037-2 head, containing WORK-038-1 bbc5c45) with the WORK-037-1 art head 0e81692 merged (fbff677). As-built only; the director applies it to `presentation.md` §6.2, §7, §8 and §9 after run complete. Departures from the order are FORK lines in the lane journal (listed at the end).

## §6.2 Sprites and clips — per-outfit avatar keys (gate Q11)

- Avatar animation keys are `avatar-<outfitId>-<clip>` (was `avatar-<clip>`); the base sheet `player/avatar-sheet` is outfit `default` → `avatar-default-idle-down` … `avatar-default-walk-side`. Each `content.outfits[]` row's `sheet` registers its own six clips (`src/view/anims.ts` `avatarSheetsOf(content.outfits)`, `clipKey(sheetId, clip, avatarSheets)`, `avatarKey`, `outfitClipKey`), all in `BootScene.create` from the manifest rows, so all three sheets load at boot (strict loader total 105).
- Lenient fallback: a sheet whose texture did not load registers no keys; `outfitClipKey` then resolves that outfit to the `default` keys (and so to the base texture).
- `AvatarSprite` reads `avatar.outfitId` on `sync` (`AvatarPose.outfitId?`, kept like `facing`); playing the outfit's key swaps the texture (Phaser anim frames carry their texture); facing, flip and walk/idle logic unchanged. `WorldScene.create` syncs once after constructing the avatar so the worn outfit shows from the first (fade-in) frame in the street and every interior. View-only additions: `hold(outfitId | null)` / `shownOutfitId` (the makeover keeps the previous outfit on screen until the swap frame) and `offsetX` (the shiver offset over the sim position).

## §7 Celebration — the makeover and the outfit cards (spec §10, §6; §C constants from `timings.ts`, not re-declared)

| Moment | Beat (ms from the trigger) | Sound | Module |
|---|---|---|---|
| Outfit worn (makeover, gate Q12) on `outfit.changed` (Closet or debug row 25) | 0 shiver x + `SHIVER_PX` 4 yoyo, 6 legs over `OUTFIT.shiverMs` 300 → `OUTFIT.dustAt` 300 `DustPoof` over the avatar bounds (depth avatar + 1; fade at `DUST_CLIP`, destroyed at `DUST_LIFETIME`) → `OUTFIT.swapAt` 470 the sheet swap under the dust + 12 sparkle confetti (`burstConfetti` `count` 12, gold/white tints, destroyed at `CONFETTI_LIFETIME`) | `riser` at 0 (volume `SFX_VOLUMES.riser` 0.6), `phasePop` at 470 (SOUNDS volume) | `src/view/celebration/makeover.ts` `playMakeover`, subscribed in `WorldScene.subscribeMakeover` (a new change cancels the running one; teardown cancels) |
| Outfit unlocked — completion (gate Q13(a)) | the completing popup gets an outfit tile after the charm tiles (derived from `projects[].completionOutfitId`; no `celebration` change): a 126 px `createRewardCard` face (`kind 'outfit'`, frame 0 of the outfit sheet, "New" always) flipped in at `POPUP_FADE_MS` over `CARD.flipMs` 320; name hidden in the tile, given as its `aria-label` | `reveal` at the flip (0.7) | `src/ui/panels/milestonePopup.ts` `addOutfitTile` |
| Outfit unlocked — the mate's arrival (gate Q13(a)) | `outfit.unlocked {source 'arrival'}` → a standalone `CARD.px` 220 card centred in the overlay, after the intro dialogue closes (shown at once if no dialogue is open; else on the first `dialogue.closed` that leaves none open): flip `CARD.flipMs`, shimmer (brightness pulse over `CARD.shimmerMs` 600 after the flip), hold `CARD.holdMs` 600, `send` over `CARD.sendMs` 400 to the Closet button (fallback point 1576, 52 when it is hidden) | `reveal` at the flip (0.7) | `src/ui/panels/closet.ts` `playOutfitCard` |

Reduced motion (WORK-038 rule: drop motion, keep order and sound): the makeover drops the shiver and the sparkles; the dust, the swap at 470 and both sounds keep their frames. The cards use the frozen block unchanged. No hitstop, flash or shake in any outfit moment (tier exclusivity).

## §8 HTML panels — the Closet button and the picker

- `hudStreet`: a round icon button `.tpp-closet-button` (`ui/Btn_RoundIcon` background + `ui/icon-closet` 56 px) inside the street HUD bar at left 1536, top 12, 80×80 (left of Decorate 1640…1888 and the debug entry, right of the reveal link 1088…1374); `aria-label` `tpp.hud.closet`. Hidden while `unlockedOutfitIds` is only `default` and in design mode; disabled while `inputFrozen`. Re-renders on `outfit.unlocked` / `outfit.changed` besides the existing list. Measured rects: evidence `hud-rects.json` (no overlap at 1920×1080 and 1920×823, with and without the site unlocked).
- New panel template `closet` (`src/ui/panels/templates/closet.ts`, registered in `templates/index.ts`; preview states `one-unlocked`, `two-unlocked`, `all-three-garden-worn`, `closed` in `tools/panels.ts`) and panel `src/ui/panels/closet.ts` `createCloset(root, context, button)`, mounted by `createHudStreet` right after the hudStreet root (z `--z-popup`; not a `Panels` member). A `ns-modal` with ✕ and backdrop close and three `ns-tile` tiles in content order: unlocked = frame 0 (idle-down) of the outfit sheet cropped by CSS `object-view-box` + the outfit name; worn = `.selected` (gold outline, `aria-pressed`); locked = `ui/mystery-shape`, disabled. Choosing an unlocked, not-worn tile closes the panel and dispatches `chooseOutfit`; the worn tile just closes. Closes on `scene.changed`, `state.reset`, `mode.changed`.
- New strings: `tpp.hud.closet` "Closet" (button label and picker title), `tpp.reward.outfit` "New outfit: {outfit}" (placeholders).

## §9 Audio

No new id. Used: `riser` (0.6) and `phasePop` in the makeover; `reveal` (0.7) at each outfit card flip; all view-timed through `audio.play(id, { volume })`.

## Departures (FORK lines, journal)

1. The makeover has no `react` clip on the avatar (the sheet has idle and walk only): after the swap the avatar keeps its idle/walk clip in its facing while the sparkles play (checkpoint 7b4407a).
2. The arrival card waits through the deferred-while-dialogue pattern (`dialogue.closed`), not the Q7(a) roll hash (checkpoint 4b9ee72).

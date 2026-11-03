# WORK-032-2 amendment — `phase-2-technical/systems/presentation.md`

- Date: 2026-11-02. Order: WORK-032-2 (RUN-004, MILESTONE-009), roadmap WORK-032 fixes 4–6, DEC-048.
- Describes game code at lane sha `cfce544` (branch `gra/talvi-pets-prototype/RUN-004/WORK-032-2`, base `a969075`). As-built only.
- Single timing/constant table: `src/view/celebration/timings.ts` (`DESIGN_TINT`, `OUTLINE_BAND`, `STARS_BURST`, `HEART_MOMENT`, `HEART_PET_DEPTH`).

## §4.2 Event subscriptions of the world scenes — add

- Both world scenes (`WorldScene`): `mode.changed` → `syncDesignTint(stateAfter)`; the tint also syncs from state in `create`, so a reload or scene restart in design mode shows it at once.
- `InteriorScene`: `heart.earned` → the scene half of the Heart moment (§7 below); `window` event `tpp:heartMomentEnd` (`HEART_MOMENT_END`) removes it.

## §6.1 Depth — add

- Design-mode tint: `DesignTint` (`src/view/objects/DesignTint.ts`), a camera-fixed `Rectangle` (scrollFactor 0, origin 0,0, sized to `scale.gameSize`, resized on `Scale.Events.RESIZE`), colour `0x5b6f86`, α `0.25`, depth `DESIGN_TINT.depth = 1500`, visible iff `state.mode === 'design'`. It lies above every world sprite (room 0, charms/pet/avatar at base y ≤ ~1100) and below the alignment grid (3000), attention marks (6000), confetti (7000), bubbles (8000), preview/editor layers (10000+).
- Slot outlines (and their labels) move to a band above the tint: depth = `OUTLINE_BAND (1501) + (depthOverride ?? y) − 0.5` (order fork (c)); relative order between outlines is unchanged, the world depth rule (TECH-014, `depth.ts`) is unchanged. Consequence: in design mode a filled outline draws over its charm and over the pet.
- The hook is scene-generic: `StreetScene` owns a `designTint` too; it stays hidden today because the sim rejects design mode on the street (`notInterior`). WORK-034 turns it on through the same `syncDesignTint(state)`.
- The HTML overlay is not tinted, filtered or restyled by this feature (the existing `hudInterior.dim` re-render on `mode.changed` is unchanged).

## §6.2 Sprites and clips — wall-art mirror rule (replace the sentence "other wall art is drawn for the left wall and mirrored on the right")

- A non-painting wall charm is drawn for the wall named by its type's optional `wallArtFacing` (`'left' | 'right'`, default `'left'`) and mirrored (`flipX`) iff the slot's `wall` differs from it. Floor slots never flip. Paintings keep their projection path. `charms/hanging-plant` is drawn for the right wall (`"wallArtFacing": "right"`); no asset, manifest or ledger change. `InteriorScene.charmSprite()` applies the rule, and `placeCharm` and the TOOL-002 fill preview layer reuse it.

## §7 / §8 — the Stars burst and the Heart moment (new, after §7.6)

### Stars burst (MEC-006 R5 gain presentation)
- On `stars.changed` with `delta > 0` for the current interior room while `session.starsVisible`, `hudInterior` adds `div.tpp-stars-burst` (pointer-events none, z-index `--z-toast`) in `#panels`, holding `STARS_BURST.count = 8` `span.tpp-burst-star` "★" in `--gold`. Each star sprays out `spreadPx 70` from the launch point, then flies into the centre of the Stars track; launches are `staggerMs 35` apart, each `flightMs 600`; the container is removed at `totalMs 900`.
- Launch point: the slot named by the `charm.placed` of the same dispatch, world (x, y − 60) → overlay (x, y − (1080 − overlayHeight)/2) (`worldToOverlay`); the screen centre when no placement preceded the gain.
- The `+n ★` delta (`floatDelta`) is unchanged and still shows; a loss shows the red delta only; nothing while Stars are hidden. Removed early on Stars hidden, `state.reset`, `scene.changed` and panel destroy. View-only: no input freeze, no sim change.

### Heart moment (MEC-009 R10 presentation)
- On `heart.earned` in an interior, for `HEART_MOMENT.totalMs = 2200`:
  - overlay (`src/view/celebration/heartMoment.ts`, owned by the dialogue panel): `div.tpp-heart-moment`, z-index `--z-popup`, pointer-events auto: a dim `rgba(40,28,18,0.5)` with a radial spotlight (`spotlightPx 340`) on the big pet, and a "♥" (`heartPx 240`, `--red`) at `heartTopPct 6` popping 0 → 1.25 → 1 over `popMs 520`, then breathing; fades out over the last `fadeOutMs 220`.
  - scene (`InteriorScene`): the existing `burstConfetti` (60 particles, depth 7000) from a 720×160 band at mid-screen, destroyed at `CONFETTI_LIFETIME`; a camera-fixed sprite of the pet's own sheet playing its existing `react` clip at ×`petScale 2`, feet at `petBaseY 0.88` of the height, depth `HEART_PET_DEPTH = 8500` (above bubbles, below the 9000 flash). The room's own pet keeps following the simulation (its walk-over is untouched; VERIFY-MEC-007-016).
  - audio: `sfx/heart` is the existing `audio.ts` play on `heart.earned`; the moment adds no second play.
- Input: every pointer event on the layer and every `keydown` (window, capture phase) is consumed; from `skipAfterMs = 600` a click or keydown ends the moment at once; before that it does nothing. `keyup` passes (no stuck keys).
- Then the vignette: while the moment is active, any dialogue-box show (the existing mec-008 §2.7 fulfil hold release, or a direct `dialogue.opened`) is held and performed at the moment's end; the box therefore shows at max(the existing hold release, the moment end). The hold's own release rule is unchanged.
- Cancel: `state.reset` (box hidden, nothing shows later); a dialogue closed through the store; `scene.changed` (a held box shows as it would have without the moment). The Hearts count `pulse` (300 ms) is kept and runs under the moment. Stars hidden does not suppress the moment.
- View-only: no new sim state, action or event.

### Art bible override
- Art bible v1.4 "Bubbles and feedback" says "No new emoji set, neutral reaction bubble or timing redesign is authorized." For the Stars burst and the Heart moment this clause is overridden by **DEC-048** (user, 2026-11-02, later than the art bible): "Bigger juice ... Pick the approach." No new emoji set or reaction bubble is added; the star and heart are text glyphs, the confetti and the `react` clip are existing.

# WORK-034-3 amendment: systems/presentation.md (street site, the mate on the street)

- Date: 2026-11-02. Lane WORK-034-3 (RUN-004, MILESTONE-009). Describes the code at lane commits 13fd4f9 (street view), 664aa68 (street HUD, toast), 8277c6e (want panel), 6bbdef3 (replace/remove on sites, trace), 1b0a1a5 (trace: back into the Dog room) on base cc42afa (the WORK-034-2 gated head).
- As-built only. Departures from the roadmap interim contract are listed under "Forks"; none were taken.

## §4 Street scene

- Draw order adds each `street.sites[]` entry's ground art: `art.empty` while `spaces[siteId].unlocked` is false, `art.base` once true, an image at the site anchor `(x, y)` with origin (0.5, 1) at depth `SITE_ART_DEPTH` = `GROUND_DEPTH + 0.5` (−0.5): above the ground tiles, below props, houses, charms, pets, outlines and the avatar. A missing texture draws `missing`. The art swaps on `space.unlocked` and `debug.applied`; a reload or `state.reset` restarts the scene, which draws the art from state.
- Site charms: one `CharmSprite` per `spaces[siteId].placements` entry at the slot point `(slot.x, slot.y)`, origin (0.5, 1), depth by the shared `charmDepth` (`standsOnFloor` floor line, else `depthOverride ?? y`), flipped horizontally when the slot's anchor faces right (no wall logic on a site). They follow `charm.placed` / `charm.removed` carrying `siteId` (pop-in 180 ms / fade-out 120 ms, as interiors) and `debug.applied` (no motion).
- Street pointer routing (TECH-004 targets): a visible site outline wins (`slot:<slotId>` → `slot.tapped { slotId, filled }` on the UI bus), then the mate's bubble (`bubble:<petId>`, tap-to-text), then the mate (`pet:<petId>` → `tapPet`), then a house (`house:<projectId>` → `acknowledgeProject`, unchanged), else `world`.

## §6.1 depth / §6.2 outlines (outdoor slot outlines, gate fork 11)

- The street builds one code-drawn `SlotOutline` per site slot (all sites; 6 for the garden) and shows them only in design mode and only for an unlocked site; house fronts have none. Shown/hidden on `mode.changed` with the interior's fade; a reload in design mode shows them (state at create). States `empty` / `filled` / `selected` follow the site placements and `context.selectedSlotId` every frame, as interiors.
- Shared helper `src/view/objects/slotLayer.ts` (`createOutlines`, `syncOutlineStates`, `outlineAt`, `charmDepth`, `popCharm`, `fadeCharm`) is used by both `InteriorScene` and `StreetScene`; the interior's behaviour is unchanged.
- The design-mode tint (WORK-032-2) shows on the street whenever `mode` is `design` (the existing `WorldScene.syncDesignTint` hook; no code change was needed).

## §6.2 / §6.3 the mate on the street (DEC-044/045)

- Once `scenePet` on the street names a site resident (the site's `arrivalDone` is true) and no `siteArrival` is open, the street draws one `PetSprite` for it (texture `pets/<petId>-sheet`, clips registered from the manifest row if the boot did not), synced from `pets[petId].behaviour` every frame (position, facing, depth at base y), clip switched on `pet.phaseChanged`. It is never drawn before the arrival; after a reload it is drawn from state.
- Its `Bubble` uses the same class, timings and event consumers as interiors: the bubble subscriptions (`pet.reacted`, `pet.verbStarted`, `pet.verbEnded`, `pet.wantBubble`, `pet.tapped`) moved verbatim from `InteriorScene` into `WorldScene.subscribePetBubbles()`, routed through each scene's `petBubble()`. A bubble tap emits `bubble.tapped` as indoors.

## §7.6 arrival walk — site variant

- `ArrivalWalk` takes either a project arrival `{ projectId, petId }` (unchanged) or a site arrival `{ siteId, petId }` (`state.siteArrival`). A site arrival walks the site's `arrivalPath` at the same speed (`petSpeedRu × roomUnitPx`), shows the 🎵 greeting at the last point for `bubbleMs`, and has **no fade** (`fades` false, `finishMs = doorMs + bubbleMs`); the walker draws at its base y (no house to sit above). It dispatches `arrivalFinished` exactly once; the sim's `arrival.finished` / `pet.arrived` in that dispatch make the street create the mate's sprite at the walk's last point (the site's `petSpawn`), so there is no gap frame. A reload with `siteArrival` open replays the walk from the first point. The street starts it on `space.arrivalStarted` and at create.
- No timing changed (walk speed, `bubbleMs`); only the door fade is dropped for a site.

## §8.2 panels

- `hudStreet`: once a site is unlocked (`playerSpace` on the street is non-null), a Decorate/Done control (the interior HUD template's `.tpp-design-toggle`, ns-btn-primary / -secondary, same position) toggling `setDesignMode`, hidden while every site is locked, disabled while a dialogue, `arrival` or `siteArrival` is open (Done stays usable); and the site Stars pill (the interior template's `.tpp-interior-pill` + `.tpp-stars`, Hearts removed, placed at top 120 px under the street bar) reading `tpp.stars.label` "n / max ★" from `starsOfSpace` (garden max 24) with the track fill, re-rendered on `space.stars.changed`, `space.unlocked`, `mode.changed`, `stars.visibilityChanged`, dialogue and arrival events, `scene.changed`, `debug.applied`, `state.reset`; hidden when `session.starsVisible` is false (TEST-001) and with the whole street HUD off the street.
- `hudStreet`: "More homes coming" is no longer built (interim contract); the template's `no-active-project` preview state and the `tpp.hud.moreHomes` key remain for `/tools/panels.html`.
- `toast`: the `space` reward announcement — on `space.unlocked`, one toast through the existing shell with `tpp.toast.space` "A garden plot is open on the street" (placeholder), no delta; held while a dialogue or celebration is open like round-ups and shown after (the Heart moment lists no rewards, so no tile was added).
- `replaceRemove`: fills from `playerSpace` / `slotOf`, so it opens over an occupied site slot; Remove dispatches `removeCharm` as indoors. The chooser needed no change (WORK-034-2's `slotOf` / `chooserTypes` resolve site slots; its locator miniature stays interior-only).
- `wantPanel`: on the street in design mode it shows the arrived site resident's active want (mirrors the interior, where the panel shows the resident's want); hidden on the street in play. `.tpp-wantPanel` uses `min-height: 256px` instead of a fixed height so the reward line stays inside the panel (review advisory WORK-033-2-1 A5).

## Forks

- None.

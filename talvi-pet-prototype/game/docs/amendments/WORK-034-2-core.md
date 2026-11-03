# WORK-034-2 amendment: systems/core.md (v1.5, tier 2 site and mate)

- Date: 2026-11-02. Lane WORK-034-2 (RUN-004, MILESTONE-009). Describes the code at lane commits 9583345 (sim), 75afa89 (content), 4bbca29 (fixtures, contract names), 754c37f (CHK, coverage), e11a946 (site tests, invariants), c45996a (debug rows), f6270bc (lint), on base 0280c0b + the WORK-034-1 head ad73071 (merge a25871d).
- As-built only. Departures from the roadmap interim contract table are listed under "Forks" and cite the lane journal.
- `CONTRACT_VERSION` stays `'1.5'` (WORK-033-1 bumped it); this lane extends v1.5.

## §1 CONTRACT-STATE

- `spaces: Record<SiteId, { unlocked: boolean; placements: Record<SlotId, CharmTypeId>; arrivalDone: boolean }>`, one key per `street.sites[]` entry, initialised `{ unlocked: false, placements: {}, arrivalDone: false }`. Absent placement key = empty slot (as rooms).
- `siteArrival: { siteId: SiteId; petId: PetId } | null` (initial `null`): the site arrival bracket, opened when a site reaches `arrivalAtStars` (§6.3), closed by `arrivalFinished`.
- `arrival: { projectId, petId } | null` is **unchanged** (project arrivals only).
- Per pet: `outside: boolean` (DEC-045): `true` for a pet whose content `home` is a space (the mate, always outside), `false` for Dog and Owl until WORK-035. `introduced` is also set at a site arrival.
- A space-homed pet's initial `behaviour` stands at its site's `petSpawn` (no room needed); `initialPets` resolves the home through `homeSpaceOf` (`src/sim/space.ts`).
- `mode: 'design'` is allowed on the street once a site is unlocked.
- Not stored: `spaces[siteId].stars` (Stars stay derived, `starsOfSpace`), `pets[id].home` (content), the per-visit roll seed, greeting cooldowns, outfits (WORK-035..037).

## §2 CONTRACT-ACTIONS (28 actions)

- `setDesignMode { on: true }` on the street: rejected `siteLocked` when no site is unlocked (replaces `notInterior`); otherwise the existing order `dialogueOpen`, `celebrationActive`, `arrivalActive` (now also when `siteArrival` is open). `{ on: false }` on the street is allowed and then runs the site-arrival trigger (§6.3).
- `placeCharm` / `removeCharm` on the street address the unlocked site holding `slotId` (`slotOf` via `playerSpace`); preconditions and copy spending/returning exactly as WORK-033 (`notDesignMode`, `dialogueOpen`, `unknownSlot`, `typeNotOwned`, `sizeClassMismatch`, `noCopiesLeft`; `slotEmpty`).
- `arrivalFinished`: finishes the project arrival when `arrival` is open (unchanged), else the site arrival when `siteArrival` is open, else `noArrival`.
- New debug actions, each first event `debug.applied { action }`, payloads checked first (`invalidPayload`):
  - `debugUnlockSpace { siteId: string }`: `unknownSite`; unlocks without the want (`space.unlocked { wantId: null }`, `petId` = the pet whose want rewards the site).
  - `debugFillSpace { siteId: string }`: `unknownSite`, `siteLocked`; for each empty site slot in file order, grants one copy (`items.granted { source: 'debug' }`) of the first catalogue type of the slot's size class not already on the site and places it through the placement chain, until the site's Stars reach `arrivalAtStars` or the slots run out; then runs the site-arrival trigger.
  - `debugFulfilActiveWant { petId: string }`: `unknownPet`, `noActiveWant`; fulfils the active want through `fulfil` (focus slot = the home's first slot), so a `greeted` want can be passed before WORK-036.

## §3 CONTRACT-EVENTS (44 events)

- `charm.placed` / `charm.removed` carry exactly one of `roomId` (interior) or `siteId` (street site); both keys are typed optional. `interruptedPetId` is always `null` on a site.
- `space.stars.changed { siteId, from, to, delta, max }`: a site's Stars changed (rooms keep `stars.changed { roomId … }`).
- `space.unlocked { siteId, petId, wantId: WantId | null }`: emitted by a `space` reward entry, in reward-list order between `want.fulfilled` and `heart.earned` (the Owl's `glow-among-leaves`: `want.fulfilled`, `space.unlocked`, `items.granted` ×2, `heart.earned`).
- `space.arrivalStarted { siteId, petId }`: the site arrival opened.
- `pet.arrived { petId, siteId }`: after `arrival.finished { petId }` at a site arrival's finish.
- `arrival.started { projectId, petId, doorId }` unchanged (projects only).

## §5 CONTRACT-SELECT (32 exports)

- New: `starsOfSpace(content, state, ref)` (one formula for rooms and sites; `starsOf(content, state, roomId)` is its room wrapper), `scenePet(content, state)` (the interior's resident, or on the street the resident of an arrived site), `playerSpace(content, state, slotId?)`, `homeSpaceOf(content, petId)`.
- `slotOf` and `chooserTypes` resolve street slots of an unlocked site. `inputFrozen` is also true while `siteArrival` is open. `residentPet` is unchanged (interiors only). `wantConditions` returns `{ kind: 'greeted', met: false, hidden: false, withPetId }` for a `greeted` condition.

## §4 tick order

- Step 2 (doors): after the door swap, a `scene.changed` to the street runs the site-arrival trigger (§6.3).
- Step 4 (pets): steps `scenePet` — on the street the arrived mate (wander only).
- Step 5 (bubbles): the mate's want-bubble countdown runs on the street; it resets on entering the street and on its `want.activated`.

## §6.1 placement chain

- The chain links receive the change's space (`PlacementChange.space: SpaceRef`); no `as { roomId }` cast remains on a path the street reaches. Stars → wants (the changed space's resident, a site's only once `arrivalDone`) → reactions (rooms only) → removal rows (rooms only) → bubble reset.

## §6.3 / §6.4 site arrival and introduction

- Trigger (fork 3): on the street, mode play, no dialogue, celebration, `arrival` or `siteArrival` open, the first site that is unlocked, not `arrivalDone`, with `starsOfSpace >= arrivalAtStars` opens `siteArrival` and emits `space.arrivalStarted`. Runs on `setDesignMode { on: false }`, on entering the street, after `debugFillSpace`; never inside design mode.
- Finish: `siteArrival = null`, `spaces[siteId].arrivalDone = true`, the resident's behaviour idle at `petSpawn`, `introduced = true`, `outside = true`; events `arrival.finished { petId }`, `pet.arrived { petId, siteId }`, then the intro script, then `activateFirstWant` (`want.activated { index 0 }`).

## §7 CONTRACT-CONTENT

- `street.json` `sites[]` (optional, default `[]`): `{ id, x, y (art anchor, base-centre), art: { empty, base }, slots (room SlotSchema, small|large only), wanderPoints (exactly 2), petSpawn (anchor), residentPetId, arrivalPath (>= 1 point), arrivalAtStars (int > 0) }`. Real content: `garden`, anchor {380, 955}, art `world/site-garden-empty` / `world/site-garden-base`, 5 small + 1 large, `arrivalAtStars` 8.
- Pet `home` (optional): `{ kind: 'room', roomId } | { kind: 'space', siteId }`; absent = the room whose `residentPetId` is the pet (Dog, Owl unchanged).
- Condition kind `greeted { withPetId }` (DEC-046), resolved against pet ids.
- Reward kind `space { siteId }`, resolved against site ids; one per reward list (kinds stay distinct).
- `pets/owl-mate.json` (new, placeholder text): `home: { kind: 'space', siteId: 'garden' }`, wants `garden-supper` {food, plant} vignette, `garden-seat` {seat, plant, adjacent seat+plant} items seed-dish + cushion, `greet-the-owl` {greeted owl} vignette (last).
- The Owl's `glow-among-leaves` reward: `[{ kind: 'space', siteId: 'garden' }, { kind: 'items', items: [potted-tree ×1, night-light ×1] }]`, label "Garden + Potted Tree, Night Light".
- New CHK rules: see the tools amendment (CHK-001-15/16, CHK-005-09/10, CHK-009-18..21; CHK-009-17 over a site home; CHK-008 over `lines.stripped`). Registry 81 → 89.

## §8 invariants and CONTRACT-PERSIST

- Invariant 3: site placements are checked like room placements (known slot, known type, granted, size class).
- Invariant 5: design mode outside an interior requires an unlocked site.
- PERSIST: the save schema version is **not** bumped (stays 2, WORK-033's single bump for MILESTONE-009); `spaces`, `siteArrival` and `pets[].outside` are part of the version-2 shape. `unknownContentId` also checks the `spaces` keys equal the content's sites, `siteArrival` ids, site placements. A save written between WORK-033 and this lane fails the schema and is discarded with reason `parse` (dev-only).

## Forks (journal WORK-034-2)

1. Site arrival as a separate `siteArrival` field and `space.arrivalStarted` event instead of widening `arrival` / `arrival.started` (widening breaks src/view compile and would throw in ArrivalWalk) — checkpoint 9583345.
2. `spaces[siteId]` holds `unlocked, placements, arrivalDone`; Stars derived, not stored (`stars` omitted, `arrivalDone` added) — 9583345.
3. `pets[id].home` stays content-only — 9583345.
4. Arrival trigger on leaving design mode / entering the street / after debugFillSpace — 9583345.
5. The site rows' `<GAME>` refs in public/assets/manifest.json fixed per the dispatch instruction despite the order's manifest hard stop (3 ref strings, no asset change) — 75afa89.

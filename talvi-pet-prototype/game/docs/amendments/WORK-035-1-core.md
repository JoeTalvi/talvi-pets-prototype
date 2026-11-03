# Amendment: core.md CONTRACT-STATE / ACTIONS / EVENTS / CONTENT / PERSIST / SELECT and §8 (WORK-035-1, DEC-045)

- Date: 2026-11-03. Lane WORK-035-1, RUN-005, task TASK-252. As built at 9706970 (base bbc5c45).
- Interim-contract rows covered (roadmap §"Amendment, 2026-11-02 — Tier 2"): CONTRACT-STATE `pets[id].outside` and "a per-visit roll seed" (as `streetVisits`, gate Q7(a)); CONTRACT-ACTIONS debug `setPetsOutside` (as `debugSetPetsOutside`); CONTRACT-EVENTS `pet.outside`; CONTRACT-CONTENT per-house `wanderPoints`; CONTRACT-PERSIST no bump.

## CONTRACT-STATE
- `session.petsOutside: 'roll' | 'all' | 'none'` — the street presence override (MEC-010 row 23); initial `'roll'`; `reset` returns it to `'roll'` (reset keeps only the tester label).
- `streetVisits: number` (top level, after `pets`) — street arrivals so far; initial 0; +1 in the same dispatch as each `scene.changed` to the street, before that visit's roll. Never on load, boot or reset.
- `pets[id].outside` semantics: a space-homed pet (the mate) is always `true`; a house pet (a room resident whose room is a street house's door target) is `true` only while it is on the street. The roll itself is never stored (recomputed from `session.seed`, `petId`, `streetVisits`).
- An outside house pet's `behaviour` is in street coordinates; its `target.wanderPointId` names a street point (`starter-w*`, `pet-w*`, `street-meet`).

## CONTRACT-ACTIONS
- `{ type: 'debugSetPetsOutside'; mode: 'roll' | 'all' | 'none' }` — sets `session.petsOutside`; on the street `'all'` puts every house pet with ≥ 1 Heart outside at once and `'none'` brings every house pet in; `'roll'` changes nothing until the next arrival. Emits `debug.applied` then one `pet.outside` per change. A bad mode → `action.rejected invalidPayload`. Contract now 29 actions.

## CONTRACT-EVENTS
- `{ type: 'pet.outside'; petId; outside: boolean }` — only on a change, after any `pet.verbEnded` of the reset. Contract now 45 events.

## CONTRACT-CONTENT
- `street.houses[].wanderPoints?: [{ id, x, y }, { id, x, y }]` (optional for fixtures; CHK-007-09 requires them on a presence street) and `street.meetingPoint?: { id, x, y }` (CHK-007-10). Shipped: `street-meet` (780, 950); Starter `starter-w1` (650, 948), `starter-w2` (1010, 935); Pet House `pet-w1` (1300, 948), `pet-w2` (1700, 948).
- CHK-007-09..13 (TOOL-001), see WORK-035-1-tools.md. Registry 89 → 94.

## CONTRACT-PERSIST
- No version bump: `schemaVersion` and `SAVE_SCHEMA_VERSION` stay 2 (gate Q16(a)). Both fields are zod defaults (`petsOutside` `'roll'`, `streetVisits` 0), so a version-2 save written before this lane loads unchanged. A save with a house pet outside round-trips.

## CONTRACT-SELECT
- `streetPets(content, state): { petId; ref: SpaceRef }[]` — content order; every arrived site resident (`ref` its site) and every house pet with `outside` (`ref` its yard). Contract now 33 selectors.
- `SpaceRef` gains `{ kind: 'yard'; projectId }` (the street in front of a house; no slots, no placements, no Stars). `spaceDef(yard)` = the house's two wander points + the meeting point, the street walk area, `petSpawn` = wanderPoints[0]. A site's `spaceDef` also appends the meeting point. `DecorRef` = room | site is what `roomRef`/`siteRef`/`homeSpaceOf` return.

## §4 tick order
- Step 2 is now doors → the street-arrival hook (mate's arrival) → the presence hook (`afterSceneChange`: count + roll on a street arrival; entering a house brings its pet in, before step 4's entry greeting).
- Step 4 on the street steps every `streetPets` entry (content order); in an interior only the resident (unchanged).

## §8 invariants
- Invariant 10 amended: a room resident stands inside its room's walk area while `outside === false`; while `outside === true` it stands inside the street walk area and is never `using`.
- New invariant 11: `scene.kind === 'interior'` ⇒ that room's resident has `outside === false`.

## Named constants to move to tuning.json after the run (order fork (f))
- `STREET_OUTSIDE_P = 0.6` in `src/sim/rules/streetPresence.ts`; `GREETING_RADIUS_RU = 1.5` in `src/sim/checks/chk-007-street.ts`.

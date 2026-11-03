# WORK-033-1 amendment: verification.md

- Date: 2026-11-02. Lane WORK-033-1 (RUN-004, MILESTONE-009). Describes the code at lane commits 30f164f (sim, content shape, tools), f52ec79 (FORK: schema version writers), 1e91af5 (CHK-002-03, log reader), 6a40939 (tests, fixtures) and 27bfd9b (traces), on base a969075 + the WORK-032 heads 0ea6180, f8c7029.
- As-built only. Any departure from the roadmap interim contract table cites its journal FORK line.

## §3 fixtures

- Every committed fixture (`tests/fixtures/*.json`, `tests/view/capture/*.real.json`) is regenerated at `schemaVersion: 2` with `inventory.counts`, `heartCharms`, `strippedPending`; file names (`save-v1.*`) unchanged; `fixture --all` reruns byte-identical.
- FX-SAVE-BAD rebuilt from the version 2 `save-v1.json`, one fault each (`invariant`, `schema-0`, `unknown-id` = a `counts` key `not-a-type`, `parse-error`).
- New **FX `save-bad/schema-1-tier1.json`**: the a969075 `save-v1.json` verbatim (schemaVersion 1, `ownedTypeIds`); load → `{ discarded: 'schemaVersion' }`.
- New bad content `tests/fixtures/bad/chk-009-17.json` and patch `tests/fixtures/content/CHK-009-17.json`.

## §4 rows

New:
- VERIFY-MEC-004-012 initial counts = the starter set × its counts in `starterSet` order (FX-REAL).
- VERIFY-MEC-004-013 `grantItems` adds copies in first-grant order (existing key keeps its place, new key appended), one `items.granted` per item, `[]` emits nothing (replaces the de-dup rows 002/003).
- VERIFY-MEC-004-014 the only `fern` placed in the Dog room is listed for an Owl small slot with `copiesOf = 0`.
- VERIFY-MEC-005-017/018 place spends; a zero-count place is rejected `noCopiesLeft` with state identical.
- VERIFY-MEC-005-019/020 remove returns; a replace swaps (`fern −1`, `lamp +1`); a same-type replace at count 0 applies with no count change and no `stars.changed`.
- VERIFY-MEC-007-018 strip record: fulfil `soft-nap` with `dog-bed`, remove → `charm.removed` then `charm.stripped {dog-room, large-1, dog-bed, dog}`, `strippedPending ['dog-bed']`, Hearts 1, `fulfilledWantIds` unchanged, Stars drop; re-place clears with no event. A replace by a different type strips too; a non-Heart charm never strips.
- VERIFY-MEC-009-024 a Heart `items` reward → `items.granted {rug,1,heart}`, `{cushion,1,heart}`; `want.fulfilled.reward` is the array; a `verb` entry still emits `verb.unlocked`.
- VERIFY-MEC-009-025 CHK-009-17 on FX-REAL: every Dog and Owl want satisfiable from the copies owned at activation; the bad fixture fails naming CHK-009-17.
- VERIFY-MEC-010-016 `debugGrantCopies {lamp,2}` → `+2`, `debug.applied` then `items.granted {debug}`; `count` 0 / 10 / 1.5 → `invalidPayload`; `nope` → `unknownType`.
- VERIFY-CORE-013 a real tier 1 save is discarded `schemaVersion`, `save.discarded {reason:'schemaVersion'}` logged, fresh state at version 2.

Rewritten to the scarcity form (old → new):
- VERIFY-MEC-004-001 "copies are unlimited" → the same type in two slots needs two copies (second placement `noCopiesLeft`; the second copy from `debugGrantCopies`); remove returns one.
- VERIFY-MEC-004-002/003 → VERIFY-MEC-004-013.
- VERIFY-MEC-004-006 "phase grant filters owned ids" → every phase item granted (`items.granted {phase}` per item), an already-owned bookshelf gains a copy (sim and fixture forms).
- VERIFY-MEC-004-007 / VERIFY-MEC-010-006 → `debugUnlockAllTypes` grants one copy of each ungranted type in file order, then nothing.
- VERIFY-MEC-006-003 "a second Lamp" and 005 → the second copy comes from `debugGrantCopies` / setup; Stars values unchanged.
- VERIFY-CORE-001 name sets v1.5: 25 actions, 40 events, 28 selectors.
- VERIFY-CORE-004 / MEC-005-011 (FX-ARB): invariant 3 v1.5; the generator places only a type with a copy available.
- VERIFY-CORE-012 (b) adds `schema-1-tier1`; (c) the full-progress save takes extra copies through `debugGrantCopies`.

## §10 TEST-002 row

- TEST-002 (one copy vs a second copy): the sim arm `debugGrantCopies` exists (WORK-033-1); the row is **runnable once WORK-033-2 adds the debug-panel row**.

## §11 GAP-7

- The TEST-002 half of GAP-7 is closed in the sim by `debugGrantCopies`; the panel half stays open until WORK-033-2.

## Traces

- M3 trace: `types.unlocked` reads → `items.granted`; storage beat `schemaVersion 2`; TEST-005/006 beat reads `inventory.counts['dog-bed']` (expected 0) in its found data; beat order unchanged.
- M2 trace: the Owl's first want places `lamp-planter` (plant + light, Pet House phase 2) at floor-3 instead of `fern` (the only fern stays in the Dog room at floor-4); found data carries the `counts` of fern, lamp-planter, perch-branch before and after.
- M1 trace: `items.granted {rug, cushion, heart}` and `schemaVersion 2` reads.

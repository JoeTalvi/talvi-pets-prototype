# WORK-033-1 amendment: systems/core.md (v1.4 → v1.5)

- Date: 2026-11-02. Lane WORK-033-1 (RUN-004, MILESTONE-009). Describes the code at lane commits 30f164f (sim, content shape, tools), f52ec79 (FORK: schema version writers), 1e91af5 (CHK-002-03, log reader), 6a40939 (tests, fixtures) and 27bfd9b (traces), on base a969075 + the WORK-032 heads 0ea6180, f8c7029.
- As-built only. Any departure from the roadmap interim contract table cites its journal FORK line.

## Header and §11 changelog

- `CONTRACT_VERSION = '1.5'` (`src/sim/state.ts`); STATE, ACTIONS, EVENTS, SELECT, CONTENT and PERSIST move to v1.5 together.
- §11 changelog line to add: "v1.5 (WORK-033-1, 2026-11-02, DEC-043): inventory is a count of copies per type; awards are `{ typeId, count }` lists; `items.granted` replaces `types.unlocked`; `charm.stripped`; `debugGrantCopies`; `copiesOf`; reward arrays; save schema 2 with tier 1 saves discarded; invariant 3 rewritten; CHK-009-17."

## §1 CONTRACT-STATE v1.5

- `schemaVersion: 2`.
- `inventory: { counts: Record<CharmTypeId, number> }` replaces `ownedTypeIds`. The value is the number of copies **in hand** (placed copies are not counted). Key order is the order of first grant, which is the chooser order. A key is never deleted: a type at 0 keeps its key and its place. The initial value is the starter set in file order with its counts (a type listed twice adds up).
- Per pet, two new fields, both `[]` in `initialState`:
  - `heartCharms: CharmTypeId[]`: distinct types credited at the fulfilment of any want, first-credit order (§6.2).
  - `strippedPending: CharmTypeId[]`: Heart charms removed from the pet's home room whose reaction has not played yet; FIFO, distinct. WORK-033-2 consumes it.
- Nothing else in `GameState` changes (no `spaces`, `home`, `outside`; those are WORK-034+).

## §2 CONTRACT-ACTIONS v1.5

- New `debugGrantCopies { typeId, count }` (25 actions). Payload: `typeId` a string, `count` an integer 1..9, else `invalidPayload`. Precondition: `unknownType` when no content type has that id. Effect: `debug.applied`, then `items.granted { typeId, count, source: 'debug' }`.
- `debugUnlockAllTypes` keeps its name; it now grants **one copy of every type with no `counts` key**, in `charms.types` file order. A second use grants nothing (only `debug.applied`).
- `placeCharm` preconditions, in order: `notDesignMode`, `dialogueOpen`, `unknownSlot`, `typeNotOwned` (unknown type or no `counts` key), `sizeClassMismatch`, `noCopiesLeft` (copies available = `counts[typeId]` + 1 when the slot already holds that type; rejected when 0). Effects: the placed type spends one copy; a replaced **different** type returns one; a same-type replace changes no count and still applies (no `stars.changed`).
- `removeCharm` returns the copy (`counts[typeId] + 1`).
- Rejections leave state untouched (the input object is returned).

## §3 CONTRACT-EVENTS v1.5 (40 events)

- `types.unlocked` is removed. `items.granted { typeId, count, source: 'phase' | 'heart' | 'debug' }` replaces it: one event per granted item, in list order; an empty list emits nothing.
- New `charm.stripped { roomId, slotId, typeId, petId }`, emitted directly after `charm.removed` (remove) or `charm.placed` (replace by a different type) when the type that left the slot is in the resident pet's `heartCharms` and no other slot of that room still holds it. It is emitted each time that happens; `strippedPending` stays distinct.
- `want.fulfilled.reward` carries the want's reward **array**.
- `celebration.started.unlockedTypeIds`, `celebration.unlockedTypeIds` and `rewards.collected.typeIds` keep their names and meaning (the de-duplicated type ids shown as tiles).

## §5 CONTRACT-SELECT v1.5 (28 selectors)

- `chooserTypes(content, state, slotId)`: the `counts` keys (first-grant order) of the slot's size class in the current interior, **including zero-count types** (the UI greys them, WORK-033-2).
- New `copiesOf(content, state, typeId) → number`: copies in hand; 0 for an unknown or never-granted type.
- `ownsTag`: some granted type (a `counts` key, in hand or placed) carries the tag; the want panel's `owned` availability keeps its tier 1 meaning.
- `typeUnlockPhase` reads `phaseRewards[i][j].typeId`.

## §6.1 / §6.2 sequences

- §6.1: `slots` writes the placement and the count change, then appends `charm.stripped` (when due) to its own events; the chain (stars → wants → reactions/pets → bubble reset) is unchanged. Placing a pending Heart charm back into its pet's room removes it from `strippedPending` with no event.
- §6.2: at fulfilment, before the reward, every type placed in the home room whose tags include any of the want's tag-condition tags (hidden included) is appended to the pet's `heartCharms` (distinct, slot file order). The reward then applies **every entry in list order**: `items` → `items.granted { source: 'heart' }` per item; `verb` → `verb.unlocked`; `vignette` → nothing. Hearts, `fulfilledWantIds` and verbs never change on a strip; Stars drop through the existing `stars.changed`.
- §6.3 `collectRewards` (and `skipWait`): grants the `phaseRewards` items of phases `fromPhase+1..toPhase`, phase then list order, source `phase`, where `types.unlocked` was (before `rewards.collected`).

## §7 CONTRACT-CONTENT v1.5

- Item: `{ typeId, count }`, `count` an integer 1..9 (`ItemSchema`, `src/content/schema/charms.ts`).
- `charms.json`: `starterSet: Item[]` (count 1 each; the six types unchanged).
- `projects.json`: `phaseRewards: Item[][]` (5 lists; count 1 each, the same types as tier 1).
- `Want.reward`: a list of 1–3 `Reward` entries, at most one per kind (zod). `Reward = { kind: 'items'; items: Item[] } | { kind: 'verb'; verb } | { kind: 'vignette' }`. The items list length 1..2 is CHK-009-06's (error), not zod's. Content converted 1:1, count 1 everywhere; `rewardLabel` text unchanged.
- Resolver paths now end in `typeId`: `/starterSet/i/typeId`, `/projects/p/phaseRewards/j/k/typeId`, `/wants/i/reward/k/items/j/typeId`, `/wants/i/reward/k/verb`.

## §8 Invariant 3 and CONTRACT-PERSIST v1.5

- Invariant 3: every `counts` value is an integer ≥ 0; every placement names a known slot and a known type that is a `counts` key and matches the slot's size class; per pet `strippedPending ⊆ heartCharms ⊆ counts keys`. Invariants 1, 2, 4–10 unchanged (invariant 4 keeps its repeat term).
- Persistence: `tpp.save = { schemaVersion: 2, savedAt, state }` (`SAVE_SCHEMA_VERSION` in `src/sim/state.schema.ts`). `parseSave` discards every other version (all tier 1 saves are 1) with `'schemaVersion'`, logged `save.discarded {reason:'schemaVersion'}`, and the game starts fresh. No migration. `unknownContentId` also covers `counts` keys, `heartCharms` and `strippedPending`.
- `session.started.schemaVersion` reports 2 (FORK f52ec79: `src/main.ts`, `src/app/log.ts`; the debug fixture loader `src/ui/panels/debugPanel.ts` writes version 2).

## §10 hooks

- Contract name sets: `tests/fixtures/core-contract.ts` (v1.5, 25 / 40 / 28); `tests/sim/contract.test.ts`.
- CHK registry 80 → 81 (CHK-009-17).

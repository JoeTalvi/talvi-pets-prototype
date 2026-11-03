# Amendment WORK-037-2 — systems/core.md (v1.5), outfits

Dated 2026-11-03, as-built at lane head of `gra/talvi-pets-prototype/RUN-005/WORK-037-2` (content d39c78e plus a lint-only test move; base bbc5c45). Applied by the director after run complete (gate AMEND-PHASE2). Interim contract: roadmap §"Amendment, 2026-11-02 — Tier 2" rows CONTRACT-STATE / ACTIONS / EVENTS / CONTENT / PERSIST.

## CONTRACT-STATE

- `avatar` gains `outfitId: OutfitId` (new alias `OutfitId = string`, an `outfits.json` id; `"default"` is the base avatar sheet). Initial state: `"default"`.
- `outfits.unlocked` is **not stored** (gate Q16(a)). Departure from the interim row "`avatar.outfitId`, `outfits.unlocked`": the second is the derived selector below. FORK-free: the gate answer names it derived.
- A door (scene change) keeps the worn outfit (`rules/doors.ts` carries `outfitId` through the avatar rebuild).

## CONTRACT-SELECT

- `unlockedOutfitIds(content, state): OutfitId[]` — `"default"`, plus each project's `completionOutfitId` where `projects[id].complete`, plus each site's `arrivalOutfitId` where `spaces[siteId].arrivalDone`; in `outfits.json` order; always starts with `"default"`. Select exports 32 → 33.

## CONTRACT-ACTIONS

- `{ type: 'chooseOutfit'; outfitId }` — payload: `outfitId` string. Order of rejections: unknown id → `action.rejected 'unknownOutfit'`; a dialogue, celebration, arrival or site arrival open → `'inputFrozen'`; not in `unlockedOutfitIds` → `'outfitLocked'`. The worn outfit → no-op (no event, same state). Otherwise sets `avatar.outfitId` and emits `outfit.changed`. **Design mode does not block** (FORK, see below).
- `{ type: 'debugSetOutfit'; outfitId }` — MEC-010 row 25: any known outfit regardless of its lock; emits `debug.applied` then `outfit.changed` (no `outfit.changed` when already worn); unknown → `'unknownOutfit'`.
- Action union 28 → 30.

## CONTRACT-EVENTS

- `outfit.unlocked { outfitId; source: 'completion' | 'arrival'; projectId?; siteId? }` — emitted in the same dispatch, immediately after `project.completed` (celebration `collect`, so `collectRewards` or a completing `skipWait`) for a project with a `completionOutfitId`, and immediately after `pet.arrived` (`finishSiteArrival`) for a site with an `arrivalOutfitId`. It fires once because its trigger fires once; no `celebration` state change (Q13(a)).
- `outfit.changed { from; to }`.
- SimEvent union 44 → 46.

## CONTRACT-CONTENT

- New file `outfits.json`: `{ outfits: [{ id, nameKey, sheet: AssetId }] }`, min 1, content order kept (`content.outfits`). Optional in the loader: an absent file loads as `[]` (pre-tier-2 fixture bundles), like `street.sites` defaulting to `[]`.
- Shipped: `default` (`player/avatar-sheet`, "Everyday"), `cosy` (`player/avatar-cosy-sheet`, "Cosy set"), `garden` (`player/avatar-garden-sheet`, "Garden set"); names are placeholders; keys `tpp.outfit.default|cosy|garden`.
- Grant declarations: optional `projects[].completionOutfitId` (shipped: `pet-house` → `cosy`, set 1) and optional `street.sites[].arrivalOutfitId` (shipped: `garden` → `garden`, set 2). Theme-to-beat mapping is a placeholder.
- Reward kind `outfit` (interim row "reward kinds add `space` and `outfit`") is a reward of the completion and arrival beats only, declared by the two fields above; the want `RewardSchema` is **not** extended (DEC-047). Order fork 1 default.
- CHK-010-01..06 (see the tools amendment). Registered ids 89 → 95.

## CONTRACT-PERSIST

- No version bump: `SAVE_SCHEMA_VERSION` and `schemaVersion: z.literal(2)` stay 2. `avatar.outfitId` is `z.string().default('default')`, so a v2 save written before this lane loads wearing `"default"`; its unlocks derive from `complete` / `arrivalDone` with nothing written.
- `unknownContentId` also discards a save whose `avatar.outfitId` names no outfit (`"default"` is always known). A known but locked id is tolerated (only the debug arm produces one).

## FORK lines

- FORK (b2597e8): `chooseOutfit` in design mode is accepted. The order's rule says "inputFrozen is false", but `select.inputFrozen` includes `mode === 'design'`; the order's fork 5 default says "accepted (only inputFrozen blocks it)". As built: `inputFrozen(content, { ...state, mode: 'play' })`.
- FORK (b2597e8): `src/sim/rules/doors.ts` and `tools/pet-preview.ts` each gain one additive `outfitId` line (outside the order's permitted list) so a door keeps the outfit and the preview avatar type-checks.

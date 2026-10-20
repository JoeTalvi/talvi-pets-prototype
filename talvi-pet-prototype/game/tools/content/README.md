# Content validation and coverage

Run these from `game/` with pinned Node 22.17.1/npm 10.9.2 after `npm ci`:

```sh
npm run check:content -- --content tests/fixtures/content-min --manifest tests/fixtures/content-min/manifest.json
npm run report:coverage -- --content tests/fixtures/content-min --manifest tests/fixtures/content-min/manifest.json
npm run check:content -- --content tests/fixtures/bad/chk-005-02-asym-adjacency --manifest tests/fixtures/content-min/manifest.json
```

The third command deliberately exits 1. Its located adjacency error is corrected by restoring `floor-1` to `floor-2.adjacent`; the first command then exits 0. The baseline retains provisional-target warnings. Add `--strict` to make warnings exit 2, `--format json` for deterministic structured output, and `--out path` to write only that requested file. Bad flags, unreadable/invalid JSON files and unavailable preview operations exit 3. Shape/resolution failures exit 1, with every located issue collected. Schema or ID failures stop dependent checks; when the only failures are unresolved asset IDs, every CHK check still runs and its findings are reported beside the resolution errors. `--known-missing tools/known-missing-assets.json` reports listed, absent later-batch AssetIds as warnings (see `game/README.md`). Without it, they stay errors.

`--only CHK-005,CHK-009-10,ZOD`, `--room id` and `--pet id` filter registry output. Global findings remain when a room/pet filter is applied. Resolution always runs first: filtering does not authorize unresolved content. `--project id` scopes coverage section C. `--panel`, `--reveal` and `--stars` deliberately fail with “needs the sim kernel” until WORK-003.

The default content path is `src/content`, manifest `public/assets/manifest.json`. Real content is WORK-016: no authored game values or silent fallback fixtures were inserted. The Vite loader discovers JSON under `src/content`; Node tools pass explicit file maps. The synthetic test manifest validates references/types only and has no image exports. It is not a deployable asset manifest. Use the explicit fixture manifest for every fixture command above.

Maintained entry points: `loadContent(manifest?, files?)`, `ContentError.issues`, `runContentChecks(content, manifest?, options?)`, `registeredIds`, and the three geometry functions. Semantic constraints live in the shared registry; Zod owns structure. The core resolver is owned by `content/resolve.ts` and adapted into `sim/checks/chk-core.ts`, preserving the layer boundary. Human issue formatting is a hand formatter with file plus JSON pointer, not `z.prettifyError`.

Per-check fixture files are small JSON operations `{file, path, value}` or `{file, path, remove:true}`. The test helper applies them to a fresh baseline. Named bad fixtures are full file maps accepted as `--content bundle.json` (the documented extensionless alias also works). Every check must produce a new finding relative to the baseline when its patch is applied. Existing baseline warnings remain visible in negative fixtures; aliases for overlapping facts share one finding.

Coverage uses the same source timeline and reachability helpers as the checks. Sections A–F include per-want results, type sources, clue hints/leaks, line counts, reward diversity, and maximum/reachable Stars. Content-only `select.typeUnlockPhase` is handed over to WORK-003; no simulation reducers or fake preview outputs exist.

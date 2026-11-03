# Talvi Pets prototype — game

**Play it in the browser:** https://joetalvi.github.io/talvi-pets-prototype/ (built from `main` by `.github/workflows/pages.yml`; desktop plays with WASD / arrows, a phone shows the on-screen joystick).

Phaser 4.2.1 / Vite scaffold, content schema and checks, asset registry and ledger tools. The interior is still the WORK-001 spike scene; the simulation kernel, design mode and most panels are not built yet.

## Environment

- Node **22.17.1**, npm **10.9.2** (`package.json` `engines`). Check `node -v` and `npm -v` first. A non-login shell (agents, scripts) may pick up a different Homebrew Node, so put the pinned one first: `export PATH="$HOME/.nvm/versions/node/v22.17.1/bin:$PATH"`.
- `npm ci` prints an engine warning for jsdom 30.1.3, which declares a newer Node minimum. The tests run on 22.17.1 anyway; the warning is expected.
- Playwright 1.64.1 is a dev dependency, but its default browser build is not installed on this host. The exporters launch the system Google Chrome (`channel: 'chrome'`). Browser probes in task evidence pin `~/Library/Caches/ms-playwright/chromium-1243` through `executablePath`. Run `npx playwright install chromium` only if you want the default build.
- `check:assets` measures audio with `ffprobe`/`ffmpeg`, which must be on `PATH`.

## Scripts (run from `game/`)

| Script | What it does today | Expected exit on the current tree |
|---|---|---|
| `dev` / `dev:host` | Vite on **http://127.0.0.1:5187/** (strict port; 5173 is taken by another app). `dev:host` also listens on the LAN for the iPhone | — |
| `test` | Vitest, all of `tests/**/*.test.ts`. Hermetic: needs only this directory (see Tests) | 0 |
| `lint` | `eslint src tests tools` | 0 |
| `build` | `tsc --noEmit` then `vite build`. Prints a >500 kB chunk warning, which is expected | 0 |
| `preview` | Serves the build on port 4173 | — |
| `check:content` | Zod schemas, then asset-ID resolution against `public/assets/manifest.json`, then every CHK-* check on `src/content`. If the only failures are unresolved asset IDs, the CHK checks still run and both are reported | **1** (later-batch IDs, below) |
| `check:assets` | VERIFY-ASSET-001..009 on the manifest and exported files, plus the ledger-only-grows check against the manifest in Git `HEAD`. Outside a Git checkout, or before the manifest is committed, it prints a VERIFY-ASSET-007 INFO line and skips that comparison | **1** (same IDs) |
| `report:coverage` | Content coverage sections A–F (`tools/coverage.ts`) | 1 while IDs are missing |
| `asset:ledger` | `append` / `replace` / `retire` / `accept` one manifest row with hash, dimensions and provenance history. `accept --id <id> --by <name> --reason <text> --record phase-3-preproduction/approvals/<file>` records a human-instructed acceptance (DEC-040); the record must be an existing file under `phase-3-preproduction/approvals/` of the workflow root (three levels above the manifest), and the reason is stored ending with that path. `append`/`replace` never write `accepted`; `replace` on an accepted row demotes it to `ai-placeholder` with the accepted snapshot in `history[]`; `retire` refuses accepted rows. Rejects format or dimension changes (`replace --layout-change` allows new `px` and `clips` for an amended sheet layout such as CN-12's 6×7 pet sheet; type, frame and URL stay), and `derived` rows whose `source` is not a runtime AssetId (the VERIFY-ASSET-007 rule `check:assets` applies). Use `--dry-run` first | — |
| `preview:feed`, `preview:pet`, `fixture` | Future tools TOOL-004, TOOL-005 and TOOL-008. They need the sim kernel (WORK-003) | `ERR_MODULE_NOT_FOUND` until delivered |
| `log` | TOOL-007 log reader (`tools/log-reader.ts`, delivered WORK-025-1): `npm run log -- <file.jsonl> [--type a,b] [--where key=value] [--from mm:ss] [--to mm:ss] [--test TEST-00n] [--summary] [--format text\|csv\|json] [--out <file>]`; `--help` lists the `jq` fallbacks. Sample: `tests/fixtures/logs/sample.jsonl` | 0; **3** if the file is unreadable |
| `deploy` | Build plus `wrangler deploy`. Wrangler setup and login are deferred; never exercised | — |

Content check flags (`--content`, `--manifest`, `--only`, `--strict`, `--format json`, fixture commands) are documented in `tools/content/README.md`.

### Why the checkers exit 1, and `--known-missing`

`src/content` refers to 21 AssetIds that later asset batches will deliver: 15 charms (WORK-018), and the Owl sheet, portrait and silhouette plus three clue icons (WORK-022). `check:content` reports 22 resolution errors because `pets/owl-portrait` is referenced twice. `check:assets` reports the same 22 as VERIFY-ASSET-001 errors. That is the expected state, not a regression.

`tools/known-missing-assets.json` lists those IDs, each with its batch. Pass the file to either checker and the listed IDs that are absent from the manifest are reported as warnings instead of errors:

```sh
npm run check:content -- --known-missing tools/known-missing-assets.json
npm run check:assets -- --known-missing tools/known-missing-assets.json
```

With the flag, both exit 0 on the current tree (`--strict` makes warnings exit 2). Without the flag, nothing changes. Unlisted, retired or wrong-type IDs stay errors either way. When a listed ID appears in the manifest, the checkers print an INFO line asking you to remove it from the file. Remove each row as its batch is ledgered.

## Asset tools

- `tools/assets/export-alpha.mjs source.png dest.png width height [alpha-cutoff]`: deterministic native-alpha fit onto a fixed canvas.
- `tools/assets/export-refinements.mjs --project <game-root> --config game/tools/assets/refinements-v1.config.json --out <staging-dir>`: reproduces the room and furniture exports from their sources. Run it from the game root.
  - `room-v2.config.json` reproduces the current `rooms/dog-room` (room candidate 3). Its room uses a full-frame uniform fit (`bandTop: 0`, `bandHeight: 1080`: the whole source is scaled to the 1920 width and centred, no phone-band fit). `sourceSubdirectory` (default `sources`) names the folder under `sourceDirectory`; `""` reads `sourceDirectory` itself. An item's optional `sourceSha256` makes the export refuse a source with different bytes.
- `npx tsx tools/assets/refit.ts --config tools/assets/refit-half-v1.config.json --out <staging-dir>`: deterministic re-fit (pure Node, no browser). Reads each source from a Git revision and checks its SHA-256, scales every frame's artwork uniformly about the frame's bottom centre by `fitFraction` of the reference frame's opaque height (rounded down to a whole pixel), keeps the canvas and frame grid, and writes PNGs plus `refit-report.json`. WORK-013H used it for the half-size Dog sheet and bed.
- `npx tsx tools/assets/use-poses.ts --config tools/assets/use-poses-v1.config.json --out <staging-dir>`: deterministic use-pose rows for the 6×7 pet sheet (pure Node; ffmpeg decodes JPEG candidates). Copies the config's `base.copyRows` byte for byte from a Git revision of the sheet, keys each selected candidate's white background (the `export-refinements.mjs` sprite key plus enclosed white holes of at least `holeMinArea` px; `exclude` column ranges such as cell dividers are blanked first), splits the poses into equal cells by connected component, and scales each row by its head-height `scale` into 256×256 cells about the base centre. It refuses a source whose SHA-256 differs, a head height outside `headTolerancePx`, or a configured standing height outside its tolerance. WORK-013J used it for `use-sit`, `use-lie` and `use-look`. `react-v2.config.json` (WORK-013K) rebuilds only row 3 `react` (the rear-up) on top of the Git 2e1dcb5 sheet; its `head.framesPx` lists a source head height per frame, and the recipe then checks every frame's scaled head against the tolerance (open mouths and head tilt vary it within one row). Ledger the result with `asset:ledger -- replace ... --layout-change`, which lets a replacement change `px` and `clips` (from `--row`) while type, frame and URL stay fixed.
- `tools/panels.html` (`/tools/panels.html` on the dev server): UI panel and state gallery, plus a contact sheet of every manifest row.
- `tools/asset-trial.html` (`/tools/asset-trial.html?height=1080&guides=1&clip=idle`): inspection harness for the Dog sheet, tags, portrait and clue on hash-verified loads. `clip` takes any Dog clip (`idle`, `walk`, `use-sit`, `react`, `use-lie`, `use-look`); `?at=<slotId>` stands the Dog on that slot's pet anchor with its facing, and room mode then still draws that slot's charm.
- Exporters write only to the output path you give them. Add the result to the registry with `asset:ledger`, then run `check:assets`.

## Maintained vs disposable

| Maintained (keep working, keep tests green) | Disposable (do not extend; replace when superseded) |
|---|---|
| `src/content/schema/*`, `src/content/load.ts`, `src/content/resolve.ts`, `src/sim/checks/*` | `tools/asset-trial.*` inspection harness |
| `tools/check-content.ts`, `tools/check-assets.ts`, `tools/coverage.ts`, `tools/content/*`, `tools/assets/{checks,common,image}.ts`, `tools/known-missing-assets.json` | Archived preparation recipes under `../phase-3-preproduction/production/*/` (`prepare-*.mjs`). Their relative `node_modules` imports are not maintained |
| `tools/asset-ledger.ts`, `tools/assets/export-*.mjs`, `tools/assets/refit.ts`, `tools/assets/use-poses.ts` and their configs | Spike runtime: `app/spikeController.ts`, `view/scenes/SpikeScene.ts`, `view/spikeManifest.ts`, `view/spikeDiagnostics.ts`, which WORK-003/004/014 replace |
| `src/view/anims.ts` (clip registration, per-frame durations, verb → use clip with the `use-sit` fallback) | Task probes under `../working/*/evidence/` |
| `tools/panels.*` gallery | |

## Tests

- `tests/sim/contract.test.ts` checks the Action/SimEvent unions against `tests/fixtures/core-contract.ts`, a vendored transcription of `../phase-2-technical/systems/core.md` v1.4 (source path and SHA-256 recorded in the file). When that document is present, a drift test also checks the live version and names. When it is absent, the test is skipped and the suite prints why.
- `tests/content/assets.test.ts` compares the manifest with its Git `HEAD` copy when one exists. In a copy without history it prints an info line and skips the comparison, as `--no-git` does.
- Headless jsdom tests establish scene construction, not WebGL rendering. The Phaser mocks are MIT-licensed (`tests/view/PHASER-LICENSE.md`).

## Runtime notes

Arrow keys/WASD and the fixed joystick move the avatar. Walk into the marked doorway to swap rooms. Position and scene save under `tpp.save`; delete that key to reset. In development builds, `window.__tpp` exposes diagnostics; `await window.__tpp.sample('idle')` samples ten seconds. Warm up for 60 seconds before measuring performance. Runtime assets have stable IDs and SHA-256 provenance in `public/assets/manifest.json`. Generated art stays `ai-placeholder` until a human records acceptance.

A passing desktop test is not creative acceptance, device performance, Safari behaviour or an iPhone result.

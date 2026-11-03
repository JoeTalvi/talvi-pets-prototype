# Amendment WORK-037-1 — assets.md (as-built), 2026-11-02

Package WORK-037 art lane (RUN-005, TASK-237), MILESTONE-011. Describes lane head ec5f887 on base 71f575c. As-built only; the director applies it to `assets.md` (new ASSET rows, grant record) after run complete. No `src/` file changed.

## New ASSET rows (batch `tier2-m5`, status `ai-placeholder`, origin `asset-bot`)

| Asset id | Type | Canvas | Frame grid | Pivot | Clips | Generator / how made |
|---|---|---|---|---|---|---|
| `player/avatar-garden-sheet` (outfit `garden`) | spritesheet | 1152×1536 RGBA | 6×6 of 192×256; rows 0 idle-down, 1 idle-up, 2 idle-side, 3 walk-down, 4 walk-up, 5 walk-side; cells 4, 5, 10, 11, 16, 17 transparent | as `player/avatar-sheet` (per-cell baseline and centre identical) | copied verbatim from `player/avatar-sheet` | Asset-Bot nano-banana image-to-image, six row calls × 3 (refs: base row candidate, APPROVAL-004 concept, `pet_house_lv3`, the outfit's idle-down); `tools/assets/use-poses.ts` + `tools/assets/avatar-garden-v1.config.json` |
| `player/avatar-cosy-sheet` (outfit `cosy`) | spritesheet | 1152×1536 RGBA | as above | as above | as above | as above with `tools/assets/avatar-cosy-v1.config.json` |
| `ui/icon-closet` | image | 96×96 RGBA, glyph centred, 8 px margin | none | centre | none | Asset-Bot nano-banana, 1 call × 3 (refs `ui/tag-soft`, `ui/tag-seat`, `pet_house_lv3`); white key + area-average fit (RUN-005 evidence `recipes/icon-cutout.mts`) |

Themes (outfit names are placeholders): `garden` = mustard-ochre rolled-sleeve work shirt under dusty slate-blue bib dungarees; `cosy` = muted brick-red chunky knit jumper with cream ribbed collar and cuffs, warm grey-brown corduroy trousers. Both keep the base hair, face, skin, proportions and brown shoes; no hat, props or accessories. Director's mapping: Pet House completion → `cosy`, the mate's arrival → `garden`.

Configs: `avatar-garden-v1` / `avatar-cosy-v1` are copies of `avatar-sheet-v1` (the gate Q15 "v1 scale config": same frame, grid, key 240/18/0/40, headTolerancePx 4, idle-down standing 166 ± 6, row order, cell counts). Only `$comment` and `poses[].source/sha256/scale/head.sourcePx` differ. The head feature runs from the hair top to the outfit's first garment row; scale = 63.0 / head.sourcePx. Measured: head 63 px in every row of both sheets; idle-down standing garden 172 px, cosy 163 px.

## Replaced rows (ledger `replace`, old provenance on `history[]`)

| Asset id | Change | Origin / batch / status |
|---|---|---|
| `pets/owl-mate-sheet` (m4 fold-in B13) | Re-run of `tools/assets/recolour.ts` (unchanged) with the new `tools/assets/owl-mate-v2.config.json`: value ceiling 0.82 → 0.76, feather 0.05 → 0.03, so the light peach feet keep the Owl's colour and the plumage stays slate blue-grey. Same 1536×1792 canvas, frames, clips; alpha identical to `pets/owl-sheet`. `owl-mate-v1` and `pets/owl-mate-portrait` are unchanged. | authored / tier2-m4 / ai-placeholder |

FORK: `world/site-garden-empty` (m4 fold-in B14) is **not** replaced. The order requires the opaque box to stay within ±4 px of the current row. Removing the 11–13 px pale fringe shrinks the box 9 px on the right, so the order's fork-3 default (leave the row unreplaced) was applied. A ready replacement with the fringe gone, keeping the same 640×320 canvas, pivot and anchor (pale edge pixels 3856 → 128), is staged at `phase-4-build/runs/RUN-005/evidence/WORK-037-1/staging/b14-try1/site-garden-empty.png` for a director or user decision.

## Generations (SPEND images, RUN-005)

39 of this lane's cap of 39: two sheets 36, icon 3. That is 39 of the 60-generation RUN-005 grant (the end of the DEC-048 grant of 80). The director's reserve of 21 is untouched, there were 0 failed calls, and there were no HTTP 402 errors. Call-by-call record: `evidence/WORK-037-1/generations.json`.

## Loader total

The strict and lenient boots load **102** files on this lane (99 + 3), with 0 failures. `tests/e2e/smoke.mjs` line 47 and `tests/e2e/webkit-boot.mjs` `CHROMIUM_TOTAL` are re-pinned 99 → 102. Union note: WORK-038-1 adds 3 SFX rows in parallel, so the integrator takes the union (expected 105), not either lane's literal.

## Checks at this head

`check:assets`: 0 errors, 10 warnings (+3 VERIFY-ASSET-001: the three new rows are unreferenced until WORK-037-2/-3), 11 info, 103 files. `check:content`: 0 / 12, unchanged. Tests: 951 + 1 skipped. Lint and build: clean. Smoke: pass.

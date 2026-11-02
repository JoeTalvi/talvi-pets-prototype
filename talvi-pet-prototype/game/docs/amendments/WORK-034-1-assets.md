# Amendment — assets.md (WORK-034-1, RUN-004, MILESTONE-009)

- Date: 2026-11-02. Describes lane commits 2d4e0f3 (recipe), eb85073 (ledger rows), 39936a5 (loader pin) on base a969075. As-built only.
- Target: `phase-2-technical/assets.md` §1.5 ASSET rows / ledger, §3.7 VERIFY-ASSET boot rows, and the grant record.

## ASSET rows added (status ai-placeholder, batch tier2-m4; none accepted, no existing row changed)

| id | type | canvas | frame grid | pivot | origin | generator | how made | SHA-256 |
|---|---|---|---|---|---|---|---|---|
| `pets/owl-mate-sheet` | spritesheet | 1536 × 1792 | 256 × 256, 6 × 7, clips copied verbatim from `pets/owl-sheet` (idle 0–3 with frameDurationsMs [2600,80,120,80], walk 6–11, react 18–21, use-lie 24–27, use-look 30–33, use-perch 36–39) | base centre (unchanged; no pixel moved) | authored | tools/assets/recolour.ts + tools/assets/owl-mate-v1.config.json | deterministic HSV palette shift of a969075:public/assets/pets/owl-sheet.png | 2b2e693eefeb8732b8678e2c8ec6eb850102116f35f1276e1b5c4e8e8f8354ac |
| `pets/owl-mate-portrait` | image | 600 × 600 (8-bit RGBA; the source is an 8-bit palette PNG) | — | — | authored | same | same shift of a969075:public/assets/pets/owl-portrait.png | a72ca56849ed5800e78c2d45aef9434bef8dde865edd7463b7de6f6ec86562d0 |

## Recolour recipe (`tools/assets/recolour.ts`, config SHA-256 e12d0aefaa424d0837722236b943d6e7d8825060983c029d71855fb4381137c4)

Per opaque pixel, HSV band weight = hue 8..45° (feather 8) × saturation ≥ 0.38 (feather 0.06) × value 0.36..0.82 (feather 0.05) × (1 − keep), keep = saturation ≥ 0.6 and value ≤ 0.40 (feather 0.03, the irises). Inside the band the colour moves to hue 212°, saturation × 0.5, value × 1.0, blended by the weight. Cream (light, low-saturation), the dark brown contour, the irises and every alpha byte are unchanged; alpha IoU 1.0; two runs give identical bytes. Sources verified by SHA-256 from the Git blob.

## Site art and slot outlines

- `world/site-garden-empty`, `world/site-garden-base`: **not produced**. Asset-Bot returned HTTP 402 RESOURCE_EXHAUSTED (prepayment credits depleted) on the first call. No canvas or anchor is recorded as built; the order's default (640 × 320, base-centre pivot, world anchor {x: 380, y: 955}) remains the plan only.
- Exterior slot outlines: the code-drawn `SlotOutline` (no asset row).

## Generations and grant record

- Spent by this lane: 0 of its 15 (0 of the 20 MILESTONE-009 grant; 0 of the 80 of DEC-048). One call was attempted and failed with 402 before producing any image.

## Boot

- Manifest rows 96 → 98; boot loader total 95 → **97** (strict and lenient, totalFailed 0). `tests/e2e/smoke.mjs` line 47 and `tests/e2e/webkit-boot.mjs` `CHROMIUM_TOTAL` re-pinned to 97.

## Departures from the interim contract (FORK)

- The roadmap row lists "mate sheet (recolour) and portrait"; the order asked for `origin: derived`. As built the two rows are `origin: authored`, because VERIFY-ASSET-007 requires a derived row to carry its parent's status (`accepted`), which this lane may not record. The parent id, Git path and SHA-256 are in `source`; the recipe and config in `postProcess` / `generator`.
- The roadmap row's "site art ×2" is not delivered (Asset-Bot 402).

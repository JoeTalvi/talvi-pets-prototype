# Amendment — assets.md (WORK-034-1, RUN-004, MILESTONE-009)

- Date: 2026-11-02. Describes lane commits 2d4e0f3 (recipe), eb85073 (ledger rows), 39936a5 (loader pin), 4ab3b61 (attempt 1 head); attempt 2 (TASK-218): f45319b (site rows), 880f9b1 (loader pin 97 → 99); base a969075. As-built only.
- Target: `phase-2-technical/assets.md` §1.5 ASSET rows / ledger, §3.7 VERIFY-ASSET boot rows, and the grant record.

## ASSET rows added (status ai-placeholder, batch tier2-m4; none accepted, no existing row changed)

| id | type | canvas | frame grid | pivot | origin | generator | how made | SHA-256 |
|---|---|---|---|---|---|---|---|---|
| `pets/owl-mate-sheet` | spritesheet | 1536 × 1792 | 256 × 256, 6 × 7, clips copied verbatim from `pets/owl-sheet` (idle 0–3 with frameDurationsMs [2600,80,120,80], walk 6–11, react 18–21, use-lie 24–27, use-look 30–33, use-perch 36–39) | base centre (unchanged; no pixel moved) | authored | tools/assets/recolour.ts + tools/assets/owl-mate-v1.config.json | deterministic HSV palette shift of a969075:public/assets/pets/owl-sheet.png | 2b2e693eefeb8732b8678e2c8ec6eb850102116f35f1276e1b5c4e8e8f8354ac |
| `pets/owl-mate-portrait` | image | 600 × 600 (8-bit RGBA; the source is an 8-bit palette PNG) | — | — | authored | same | same shift of a969075:public/assets/pets/owl-portrait.png | a72ca56849ed5800e78c2d45aef9434bef8dde865edd7463b7de6f6ec86562d0 |
| `world/site-garden-empty` | image | 640 × 320 (8-bit RGBA) | — | base centre (0.5, 1); world anchor {x: 380, y: 955} | asset-bot | asset-bot/generate_image:nano-banana | seed 9410, candidate_002 of 3, white-key cut-out + common-scale fit (evidence recipe site-cutout.ts); overgrown untended plot, shown while the site is locked | d37fcab78bcc0117160583812b484bb97e5dad211a1692fb09fe4b3e2c8f16c1 |
| `world/site-garden-base` | image | 640 × 320 (8-bit RGBA) | — | same | asset-bot | same | seed 9420 (empty candidate as outline ref), candidate_002 of 3, same cut-out and scale; cleared plot (mulch beds, stepping-stone path, low stone edge), shown once unlocked | 2d406fc17162990bf1b53aeedd828df0d95d9065cbf91a37f0a7774f4d0ab200 |

## Recolour recipe (`tools/assets/recolour.ts`, config SHA-256 e12d0aefaa424d0837722236b943d6e7d8825060983c029d71855fb4381137c4)

Per opaque pixel, HSV band weight = hue 8..45° (feather 8) × saturation ≥ 0.38 (feather 0.06) × value 0.36..0.82 (feather 0.05) × (1 − keep), keep = saturation ≥ 0.6 and value ≤ 0.40 (feather 0.03, the irises). Inside the band the colour moves to hue 212°, saturation × 0.5, value × 1.0, blended by the weight. Cream (light, low-saturation), the dark brown contour, the irises and every alpha byte are unchanged; alpha IoU 1.0; two runs give identical bytes. Sources verified by SHA-256 from the Git blob.

## Site art and slot outlines

- Site canvas contract (as built): both states share one 640 × 320 RGBA canvas, base-centre pivot (origin 0.5, 1), world anchor {x: 380, y: 955} (covers world x 60..700, y 635..955); ground decal drawn above the ground tiles (`GROUND_DEPTH` −1 in `StreetScene.ts`) and below everything else. Attempt 1's call failed with HTTP 402 (0 images); attempt 2 produced both states.
- Exterior slot outlines: the code-drawn `SlotOutline` (no asset row).

## Generations and grant record

- Spent by this lane: **6** of its 15 (6 of the 20 MILESTONE-009 grant; 6 of the 80 of DEC-048): two `generate_image` calls of count 3 for the site art. Mate sheet/portrait fallbacks unused (0). Attempt 1's call failed with 402 before producing any image (0).

## Boot

- Manifest rows 96 → 100; boot loader total 95 → **99** (strict and lenient, totalFailed 0). `tests/e2e/smoke.mjs` line 47 and `tests/e2e/webkit-boot.mjs` `CHROMIUM_TOTAL` re-pinned to 99.

## Departures from the interim contract (FORK)

- The roadmap row lists "mate sheet (recolour) and portrait"; the order asked for `origin: derived`. As built the two rows are `origin: authored`, because VERIFY-ASSET-007 requires a derived row to carry its parent's status (`accepted`), which this lane may not record. The parent id, Git path and SHA-256 are in `source`; the recipe and config in `postProcess` / `generator`.

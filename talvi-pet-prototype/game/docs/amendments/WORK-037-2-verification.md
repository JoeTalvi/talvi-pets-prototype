# Amendment WORK-037-2 — verification.md, proposed VERIFY rows

Dated 2026-11-03, as-built at the WORK-037-2 lane head (base bbc5c45). Each row names the test that proves it.

| Proposed ID | Rule | Test |
|---|---|---|
| VERIFY-WORK-037-2-01 | Pet House completion emits `outfit.unlocked {cosy, 'completion', pet-house}` right after `project.completed`, once; no `celebration` field | `tests/sim/outfits.test.ts` "grant beats" |
| VERIFY-WORK-037-2-02 | The garden arrival emits `outfit.unlocked {garden, 'arrival', garden}` right after `pet.arrived`, once | same |
| VERIFY-WORK-037-2-03 | Unlocks are derived: default at start; cosy after Pet House; garden after arrival; pre-outfit v2 saves derive theirs; content order; no `outfits` key in `GameStateSchema` | `tests/sim/outfits.test.ts` "unlockedOutfitIds" |
| VERIFY-WORK-037-2-04 | `chooseOutfit`: unlocked → `outfit.changed` + state; worn → no-op; locked / unknown / frozen / bad payload → `action.rejected` with reason; design mode allowed; outfit survives a door | `tests/sim/outfits.test.ts` "chooseOutfit" |
| VERIFY-WORK-037-2-05 | Persistence: `SAVE_SCHEMA_VERSION` 2; a bbc5c45 v2 save without `outfitId` loads "default"; "cosy" round-trips; unknown id → `unknownContentId`; locked id tolerated | `tests/sim/outfits.test.ts` "persistence"; fixtures `tests/fixtures/pre-outfits/*.v2-bbc5c45.real.json` |
| VERIFY-WORK-037-2-06 | Debug row 25 "Outfits" found by label; options = `content.outfits`; Wear dispatches `debugSetOutfit` and changes the state; unknown id rejected under the row | `tests/view/debugPanel.test.ts` "row 25 Outfits" |
| VERIFY-WORK-037-2-07 | CHK-010-01..06 each fail their broken fixture and pass shipped content | `tests/content/outfit-checks.test.ts`, `tests/content/checks.test.ts` (fixtures `tests/fixtures/content/CHK-010-0*.json`) |
| VERIFY-WORK-037-2-08 | `outfits.json` loads default, cosy, garden in order; absent file → `[]` | `tests/content/outfits.test.ts` |

Pins moved: VERIFY-CORE-001 counts 28/44/32 → 30/46/33; registered CHK ids 89 → 95 (`checks.test.ts`, `cli.test.ts`, `known-missing.test.ts`); content-min file count 13 → 14; 22 committed save fixtures and 4 `session-opening*.real.json` regenerated (avatar gains `outfitId`).

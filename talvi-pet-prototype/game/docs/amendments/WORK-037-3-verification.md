# Amendment WORK-037-3 — verification.md (as-built), 2026-11-03

Package WORK-037 view lane (RUN-005, TASK-256), MILESTONE-011, lane head 3a2da74. Proposed VERIFY rows as built; the director applies them after run complete.

| VERIFY id (proposed) | Requirement | Method | Where |
|---|---|---|---|
| VERIFY-WORK-037-3-01 | Per-outfit keys `avatar-{default,cosy,garden}-{idle,walk}-{down,up,side}` exist after the boot registration; a missing sheet resolves to the default keys | HEADLESS + Chrome boot probe (strict 105/0; lenient with the cosy sheet blocked) | `tests/view/anims.test.ts`, `tests/view/boot.test.ts`, `tests/view/avatarSprite.test.ts`; `tests/e2e/m5-outfit.mjs` boot beats |
| VERIFY-WORK-037-3-02 | `AvatarSprite` swaps sheet on an `outfitId` change without a facing change; holds the previous outfit until released | HEADLESS | `tests/view/avatarSprite.test.ts` |
| VERIFY-WORK-037-3-03 | Closet button hidden while only the default is unlocked and in design mode; visible after the Pet House completes; disabled while input is frozen; top right of the street HUD clear of the joystick, Decorate, the site pill and the reveal link at 1920×1080 and 1920×823 | HEADLESS + Chrome rects | `tests/ui/closet.test.ts`; m5-outfit beats 3, 5, 6, 11 |
| VERIFY-WORK-037-3-04 | Picker: three tiles in content order; locked tile disabled with the mystery shape; worn tile selected; choose → `chooseOutfit` + close; ✕ / backdrop close | HEADLESS + Chrome real clicks | `tests/ui/closet.test.ts`; m5-outfit beats 5, 7, 12 |
| VERIFY-WORK-037-3-05 | Makeover order and totals from §C: `riser` at 0, shiver 0–300, dust at 300, swap + `phasePop` + 12 sparkles at 470, no sound before its frame; reduced motion drops shiver and sparkles only | HEADLESS manual scene clock | `tests/view/makeover.test.ts` |
| VERIFY-WORK-037-3-06 | The worn outfit shows on the street, in an interior and after a reload (`state.avatar.outfitId` matches the texture) | Chrome | m5-outfit beats 7–9 |
| VERIFY-WORK-037-3-07 | The Pet House completion popup carries the outfit tile (cosy, "New", flip, `reveal` at the flip); a progress popup has none | HEADLESS + Chrome | `tests/ui/closet.test.ts`; m5-outfit beat 4 |
| VERIFY-WORK-037-3-08 | The mate-arrival outfit card shows only after the intro dialogue closes, holds `CARD.holdMs`, sends to the Closet over `CARD.sendMs`; a completion grant shows no standalone card | HEADLESS fake store + Chrome | `tests/ui/closet.test.ts`; m5-outfit beat 10 |
| VERIFY-WORK-037-3-09 | Debug row 25 Wear plays the same makeover | Chrome | m5-outfit beat 13 |
| VERIFY-WORK-037-3-10 | CHK-010-03: an outfit sheet missing from the manifest is an error (WORK-037-2-1 advisory A2) | HEADLESS | `tests/content/outfit-checks.test.ts` |

Feel of the makeover and the cards: no automated pass condition; loops in the lane evidence `loops/` (makeover-cosy, makeover-garden, popup-outfit-tile, arrival-card), judged at the play session.

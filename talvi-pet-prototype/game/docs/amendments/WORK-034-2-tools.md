# WORK-034-2 amendment: systems/tools.md

- Date: 2026-11-02. Lane WORK-034-2 (RUN-004, MILESTONE-009). Describes the code at lane head f6270bc (sim 9583345, content 75afa89, fixtures 4bbca29, CHK 754c37f, tests e11a946, debug rows c45996a) on base 0280c0b + WORK-034-1 ad73071 (merge a25871d).
- As-built only; departures from the interim contract are listed in WORK-034-2-core.md "Forks" and the lane journal.

## TOOL-001 `check:content` (registry 81 → 89)

- CHK-001-15 (error): a site's anchor, `petSpawn`, both wander points and the last `arrivalPath` point lie inside the street `walkArea` and outside every house blocker and door rect.
- CHK-001-16 (warning): any of those points or a site slot base below y 951.5 (the 1920×823 visible band). Real content: one warning, the art anchor at y 955 (WORK-034-1's recorded 4 px); every slot and point is ≤ 951.
- CHK-005-09 (error): a site has exactly 5 small + 1 large slots, no wall slot, slot ids unique across rooms and sites, `adjacent` ids valid and symmetric.
- CHK-005-10 (error): a site slot base on a house door rect or its approach corridor (the door's x range from the door top to the walk area bottom).
- CHK-009-18 (error): homes — every pet exactly one home; a space home names an existing site whose `residentPetId` is that pet; a site's resident's home is that site; a room home names the pet.
- CHK-009-19 (error): each site is unlocked by exactly one want (`space` reward) across pets.
- CHK-009-20 (error): `arrivalAtStars ≤ starsFirstCopy × slots`, and the distinct site-fitting copies owned once the unlock want is fulfilled (its bundle and every project phase included, stripping allowed) reach `arrivalAtStars`.
- CHK-009-21 (error): a `greeted` condition only in a pet's last want.
- CHK-009-17 evaluates a space-homed pet's wants over its site slots with the copies owned after the unlock want plus the pet's earlier Heart items; `greeted` conditions are skipped. CHK-009-01 targets 3 wants for a space-homed pet; a `greeted`-only want is exempt from CHK-009-02 and CHK-009-12. CHK-008 also checks `lines.stripped`.
- Real content: 0 errors, 12 warnings (baseline 7; new: CHK-001-16 anchor, placeholder-content targets for owl-mate).

## TOOL-003 `report:coverage`

- Section "G — Sites": the site's slots, resident and `unlockedBy`; the mate's wants listed with conditions; `greeted` renders "☐ greeted owl (WORK-036)"; `--panel` works for the mate (site home); `--stars` lists site Stars.

## TOOL-006 debug panel (MEC-010)

- Rows 20–22 after row 19 "Grant copies": "Unlock garden" (`debugUnlockSpace` for the first street site), "Fill garden" (`debugFillSpace`), "Fulfil active want" with a pet select in content order (`debugFulfilActiveWant`). Rows are selected by label.

## TOOL-008 fixtures

- `fixture --all` (content-min, no site) writes the same 22 fixtures with the new state fields (`spaces: {}`, `siteArrival: null`, `pets[].outside`).
- Real-content scenarios: `tests/view/capture/site-unlocked.steps.json` (pet-house arrival, Owl wants 1–2 fulfilled via `debugFulfilActiveWant`, site unlocked, bundle owned, player on the street) and `mate-arrived.steps.json` (+ potted-tree on garden-large-1 and night-light on garden-small-3 = 8 ★, leave design mode, `arrivalFinished`, drain), each with its `.real.json` (`npm run fixture -- --steps <file> --out <file>.real.json`). The steps-file pin stays 22.

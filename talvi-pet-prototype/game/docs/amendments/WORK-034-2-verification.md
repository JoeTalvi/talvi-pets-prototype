# WORK-034-2 amendment: systems/verification.md

- Date: 2026-11-02. Lane WORK-034-2 (RUN-004, MILESTONE-009). Describes the code at lane head f6270bc (sim 9583345, content 75afa89, fixtures 4bbca29, CHK 754c37f, tests e11a946, debug rows c45996a) on base 0280c0b + WORK-034-1 ad73071 (merge a25871d).
- As-built only; departures from the interim contract are listed in WORK-034-2-core.md "Forks" and the lane journal.

## New VERIFY rows (tier 2, WORK-034-2)

| ID | Requirement | Command | Expected |
|---|---|---|---|
| VERIFY-T2-SITE-001 | site schema + content load | `npx vitest run tests/sim/site.test.ts -t SITE-001`; `npm run check:content -- --known-missing tools/known-missing-assets.json` | garden 5 small + 1 large, 2 wander points, spawn = arrivalPath end, art ids, arrivalAtStars 8; 0 errors |
| VERIFY-T2-SITE-002 | site CHK rules fire | `npx vitest run tests/content/site-checks.test.ts` | each negative case reports its CHK id (y band as warning) |
| VERIFY-T2-SITE-003 | Owl's 2nd Heart unlocks the site + two charms | `-t SITE-003` | `want.fulfilled`, `space.unlocked {garden}`, `items.granted` ×2, `heart.earned {2}` |
| VERIFY-T2-SITE-004 | street design mode only when unlocked | `-t SITE-004` | `siteLocked` (state identical) → `mode.changed {design}` |
| VERIFY-T2-SITE-005 | outdoor place/remove, Stars per space | `-t SITE-005` | counts −1/+1; `space.stars.changed` 0→4→8→4; room Stars unchanged; `sizeClassMismatch`; `noCopiesLeft` |
| VERIFY-T2-SITE-006 | 8 ★ arrival trigger | `-t SITE-006` | none below 8 or in design mode; one `space.arrivalStarted` on leaving design; none once arrived |
| VERIFY-T2-SITE-007 | arrival finish introduces the mate | `-t SITE-007` | `arrival.finished`, `pet.arrived`; arrivalDone, introduced, outside; intro open; `want.activated {index 0}`; project arrivalFinished unchanged (`noArrival` with no arrival) |
| VERIFY-T2-SITE-008 | mate wants read the site; greeted inert, last | `-t SITE-008` | wants 1–2 fulfil from site placements; want 3 `met: false`; debug arm → Hearts 3, `wants.exhausted` |
| VERIFY-T2-SITE-009 | mate on the street | `-t SITE-009` | alternates garden-w2/garden-w1, inside walkArea, deterministic per seed; not stepped before arrival; Dog/Owl outside false |
| VERIFY-T2-SITE-010 | debug arms | `-t SITE-010`; `npx vitest run tests/view/debugPanel.test.ts -t SITE-010` | `debug.applied` per arm; fill reaches ≥ 8 ★ via 2 `charm.placed`; `invalidPayload`, `unknownSite`, `unknownPet`, `siteLocked`; rows render and dispatch |
| VERIFY-T2-SITE-011 | save round-trip | `-t SITE-011` | equal after round-trip; save schema 2 |

- Rewritten existing rows: VERIFY-MEC-001-010 (street reason `siteLocked`), VERIFY-MEC-009-026 (a space-unlocking reward names the site), VERIFY-MEC-010-017 (rows 20–22 follow row 19), VERIFY-CORE-001 (28 actions / 44 events / 32 selectors), VERIFY-TOOL-008 rejected-step message (`siteLocked`).

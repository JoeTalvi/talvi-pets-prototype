# Amendment: tools.md — TOOL-001 street presence rules, TOOL-004 roll preview (WORK-035-1)

- Date: 2026-11-03. Lane WORK-035-1, RUN-005, task TASK-252. As built at 9706970 (base bbc5c45).
- Interim-contract row covered: `tools.md` "TOOL-004 preview of the roll"; TOOL-001 rules for DEC-045.

## TOOL-001 (src/sim/checks/chk-007-street.ts, from check007; registry CHK-007 8 → 13, total 89 → 94)
Applies once a street authors presence (any house `wanderPoints` or a `meetingPoint`). Street pets = each street house's room resident + each site's resident; W(p) = its two points ∪ {meetingPoint}; R = `GREETING_RADIUS_RU` 1.5 × `tuning.roomUnitPx` (360 px).
- **CHK-007-09** (error) every house whose room has a resident has exactly two `wanderPoints`; street wander ids (houses, sites, meeting point) unique; each point inside `walkArea`, outside every blocker and door rect.
- **CHK-007-10** (error) `meetingPoint` present when the street has ≥ 2 street pets; inside `walkArea`, outside every blocker and door rect.
- **CHK-007-11** (error) for each street pet, every segment among its own points and the meeting point lies inside `walkArea` and crosses no blocker (door rects may be crossed).
- **CHK-007-12** (error) for every pair of street pets, the meeting point is in both W and min |pa − pb| ≤ R.
- **CHK-007-13** (warning) a house wander point or the meeting point below the 1920×823 visible band (y > 951.5).
- Triggering patches: `tests/fixtures/content/CHK-007-09..13.json` (over content-min).

## TOOL-004
- `npm run preview:feed -- --seed <n> --street-roll <visits>` prints, per visit 1..n, each house pet's `rollOutside` (out/in), assuming ≥ 1 Heart, mode `'roll'` and not the house just left. Byte-stable. No `package.json` change.

# Amendment: verification.md — VERIFY-WORK-035-1-01..12 and re-pinned tests (WORK-035-1)

- Date: 2026-11-03. Lane WORK-035-1, RUN-005, task TASK-252. As built at 9706970 (base bbc5c45).

| VERIFY ID | Rule | Test |
|---|---|---|
| VERIFY-WORK-035-1-01 | the roll is pure, p ≈ 0.6 over 2000 visits (seeds 1, 42, 1234), no rngState touched | tests/sim/streetPresence.test.ts |
| VERIFY-WORK-035-1-02 | 0 Hearts never outside in any mode; the mate always outside | tests/sim/streetPresence.test.ts |
| VERIFY-WORK-035-1-03 | just-left rule; idle at house wanderPoints[0]; entering the house: outside false, room wanderPoints[0], then the greeting; pet.outside only on change | tests/sim/streetPresence.test.ts |
| VERIFY-WORK-035-1-04 | streetVisits +1 per arrival, not on load/reset; old v2 save → 0 / 'roll'; outside Dog round-trips; version 2 | tests/sim/streetPresence.test.ts |
| VERIFY-WORK-035-1-05 | 5 min of street ticks: targets only in W(p), never twice in a row, inside walkArea, street-meet reached by each | tests/sim/streetPresence.test.ts |
| VERIFY-WORK-035-1-06 | tapPet on the street: outside Dog answers, inside Dog petNotHere, mate unchanged | tests/sim/streetPresence.test.ts |
| VERIFY-WORK-035-1-07 | debugSetPetsOutside modes (sim) and row 23 (panel) | tests/sim/streetPresence.test.ts, tests/view/debugPanel.test.ts |
| VERIFY-WORK-035-1-08 | CHK-007-09..13 pass on shipped content, fire on broken content | tests/content/street-presence-checks.test.ts, tests/content/checks.test.ts |
| VERIFY-WORK-035-1-09 | B1: never above the blocker bottoms behind the houses; doors open from below | tests/sim/street-blockers.test.ts |
| VERIFY-WORK-035-1-10 | B16: path ≥ 720 px (816), inside walkArea, visible, ends at petSpawn; m3 site-arrival beat | tests/content/street-presence-checks.test.ts, m3-trace |
| VERIFY-WORK-035-1-11 | invariant 10 amended, invariant 11 new | tests/sim/streetPresence.test.ts |
| VERIFY-WORK-035-1-12 | TOOL-004 --street-roll equals reduce | tests/sim/street-roll-preview.test.ts |

## Re-pinned existing tests
- VERIFY-CORE-001 (tests/sim/contract.test.ts + tests/fixtures/core-contract.ts): 28/44/32 → 29 actions / 45 events / 33 selectors; reduce.test "all 29 actions".
- VERIFY-T2-SITE-009 (tests/sim/site.test.ts): the mate's targets are in {garden-w1, garden-w2, street-meet}, never the same twice (was strict w1/w2 alternation).
- VERIFY-WORK-032-1-04 (tests/sim/avatar-blockers.test.ts): starts (600,790)→(390,790) and (1200,860)→(1190,860) (inside the B1 blockers); the R3 slide runs on the Pet House blocker (a slide off the B1 Starter blocker's left edge now walks into starter-front).
- VERIFY-MEC-010-017 labels pin gains 'Pets outside'; CHK counts 89 → 94 in checks.test, cli.test, known-missing.test; state.test session pin gains petsOutside.
- VERIFY-TOOL-008: every committed fixture (22) and tests/view/capture/{session-opening*, mate-arrived, owl-room-entry, site-unlocked}.real.json regenerated (field additions only: session.petsOutside, streetVisits).

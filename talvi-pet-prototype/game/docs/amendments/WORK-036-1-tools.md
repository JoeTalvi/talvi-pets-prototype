# Amendment: tools.md — TOOL-001 CHK-007-14..17 and the coverage label (WORK-036-1)

- Date: 2026-11-03. Lane WORK-036-1, RUN-005, task TASK-258. As built at 5e02c35 (base 855c2e5).

- New error checks in `src/sim/checks/chk-007-greet.ts` (called from `check007`):
  - CHK-007-14: a `compatibility` key names the pet itself or an unknown pet.
  - CHK-007-15: a missing entry; every pet must have a value for every other pet (complete).
  - CHK-007-16: asymmetry, `pets[a].compatibility[b] !== pets[b].compatibility[a]`.
  - CHK-007-17: `tuning.greetEmoteWeights` empty, without a `minCompatibility: 0` band, or with a negative weight or a zero-sum band.
  - CHK-007-14..16 apply once any pet authors `compatibility` (content without greetings, e.g. content-min, stays clean); a value outside 0..1 fails zod.
- `registeredIds` CHK-007 13 → 17; total 94 → 98. Triggering patches `tests/fixtures/content/CHK-007-14..17.json`. check:content on shipped content: 0 errors, 12 warnings (unchanged).
- `lines.stripped` was already covered by CHK-008-01 (WORK-034-2); a test case now pins it.
- `tools/coverage.ts`: the greeted condition renders as "☐ greeted <pet>" (the "(WORK-036)" suffix removed).

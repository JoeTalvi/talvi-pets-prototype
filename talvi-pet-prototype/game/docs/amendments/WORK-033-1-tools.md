# WORK-033-1 amendment: tools.md

- Date: 2026-11-02. Lane WORK-033-1 (RUN-004, MILESTONE-009). Describes the code at lane commits 30f164f (sim, content shape, tools), f52ec79 (FORK: schema version writers), 1e91af5 (CHK-002-03, log reader), 6a40939 (tests, fixtures) and 27bfd9b (traces), on base a969075 + the WORK-032 heads 0ea6180, f8c7029.
- As-built only. Any departure from the roadmap interim contract table cites its journal FORK line.

- TOOL-001 `check:content`: runs CHK-009-17 with the existing flags (`--only CHK-009`, `--pet`, `--format json`); registry 80 → 81 checks. Shipped content: 0 errors, 7 warnings (the WORK-032 baseline, unchanged). CHK-002-03 compares type ids for duplicates.
- TOOL-003 `report:coverage`: the per-pet `rewardKinds` keys are `items`, `verb`, `vignette` (a want counts once per kind it carries); `rewardKind` per want is the kinds joined by `+`; a "copies" section lists the copies granted per type by source and the CHK-009-17 verdict per want (see the coverage change in this lane). `--panel --owned …` gives one copy of each listed type; its text is unchanged.
- TOOL-005 `preview:pet`: reads `counts` (`debugUnlockAllTypes` when a wanted type has no key) and tops counts up directly (a synthetic setup edit, no events) so a fill that repeats one type across slots places every copy.
- TOOL-007 `log-reader`: the TEST-006 preset matches `items.granted` instead of `types.unlocked`.
- TOOL-008 `fixture`: the direct-edit field is `/inventory/counts` or `/inventory/counts/<typeId>` (was `/inventory/ownedTypeIds(/i|-)`); fixtures are written at `schemaVersion: 2`. Every committed fixture was regenerated; `--all` reruns byte-identical.
- TOOL-004 `preview:feed`: unchanged (output identical to the baseline).

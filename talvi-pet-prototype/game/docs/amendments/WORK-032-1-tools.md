# WORK-032-1 amendment: tools.md (TOOL-001 `check:content`)

- Date: 2026-11-02. Lane WORK-032-1 (RUN-004). Describes lane commit 5e8f84e, base a969075. As-built only.

## New CHK-001 ids (all `error`, file `street.json`)

| ID | Rule | JSON path | Bad fixture |
|---|---|---|---|
| CHK-001-11 | A blocker lies outside the 1920×1080 scene | `/houses/<i>/blockers/<j>` | `tests/fixtures/bad/chk-001-11-blocker-off-scene.json` |
| CHK-001-12 | `playerSpawn` or a door spawn is inside any blocker | `/playerSpawn`, `/houses/<i>/door/spawn` | `tests/fixtures/bad/chk-001-12-spawn-in-blocker.json` |
| CHK-001-13 | A door rect centre is not walkable because it is inside a blocker. A centre outside the walkArea stays CHK-001-02, which now carries the alias CHK-001-13 on the street | `/houses/<i>/door/rect` | `tests/fixtures/bad/chk-001-13-door-in-blocker.json` |
| CHK-001-14 | An arrivalPath point is inside another house's blocker | `/houses/<i>/arrivalPath/<k>` | `tests/fixtures/bad/chk-001-14-arrival-in-other-blocker.json` |

The semantics of CHK-001-01..10 are unchanged. Triggering patches are `tests/fixtures/content/CHK-001-11..14.json`. The registry grows from 76 to 80 ids, with the CHK-001 count going from 10 to 14 in `src/sim/checks/index.ts`.

Consequence for real content: CHK-001-09 now warns once for `street.json` `/walkArea`, because the walkArea, door rects and spawns reach y 1010, past the 951 band. `check:content --known-missing` reports 0 errors and 7 warnings, up from 6. This is fork (a), journaled.

# WORK-032-1 amendment: systems/core.md

- Date: 2026-11-02. Lane WORK-032-1 (RUN-004, MILESTONE-009). Describes the code at lane commits 2b5756e (feed) and d96a454 / 5e8f84e (street schema, CHK), on base a969075.
- As-built only. Contracts stay v1.4 here; WORK-033 makes the v1.5 bump. Each change below is additive.

## CONTRACT-CONTENT, `street.json` schema (`src/content/schema/street.ts`)

Add one field to every house:

- `houses[].blockers: { x, y, w, h }[]`. Each entry is an axis-aligned solid footprint in street world pixels. It is half-open like door rects, covering [x, x + w) × [y, y + h), and `w` and `h` must be positive. The field defaults to `[]` when absent.
- Authoring rule: there is one rect per house. It runs from the walkArea top (y 780) down to the house anchor y, which is the sprite base and the house's depth line. It spans the opaque x extent of the stage sprite within that band. For the Pet House that sprite is `pet-house-lv6`.
- The avatar never ends a street tick inside a blocker (MEC-001 R3 as amended).
- Rooms have no blockers.
- As-built values in `src/content/street.json`:
  - Starter House: `{x 629, y 780, w 329, h 100}`.
  - Pet House: `{x 1445, y 780, w 314, h 160}`.
- Checked by CHK-001-11..14 (tools amendment).

## §4 tick order, step 3 (feed)

The order is unchanged: step 1 avatar, 2 doors, 3 feed, 5 scripts.

Step 3 now also banks no time and fires nothing in either of these cases:

- a dialogue is open (`state.dialogue.current !== null`, any source);
- the orientation is still owed (`!state.session.orientationShown`). This covers a fresh save's first tick, where step 5 enqueues the orientation after step 3.

Unchanged:

- A frozen interval (`eventIntervalMs === null`) or no active project banks nothing.
- The feed still accrues in design mode, during celebrations and during the arrival. The pause is not `inputFrozen`.
- `debugSimulatePurchase` still fires a round-up immediately in any state.

Code: `feedPaused()` in `src/sim/rules/feed.ts`.

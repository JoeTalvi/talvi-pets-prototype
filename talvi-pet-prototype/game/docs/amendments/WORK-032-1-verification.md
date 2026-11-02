# WORK-032-1 amendment: verification.md

- Date: 2026-11-02. Lane WORK-032-1 (RUN-004). Describes the lane head. Code is at 5e8f84e; the capture script is at the lane head. Base a969075. As-built only.

## New rows

| ID | Layer | Test / command | Expectation |
|---|---|---|---|
| VERIFY-WORK-032-1-01 | Vitest | `tests/sim/feed-dialogue.test.ts`, on FX-CONTENT-MIN | Orientation open for 60 s, and a mid-session vignette for 60 s, each ticked at 100 ms with a 250 ms interval: `feed.sinceLastEventMs` unchanged and zero `roundup.fired`. After the last `advanceDialogue`, the first round-up comes one interval later, less any time banked before the box opened. |
| VERIFY-WORK-032-1-02 | Vitest | same file | `initialState` → `tick {dtMs: 100}` (the reducer maximum; 5000 is rejected as invalid): `sinceLastEventMs === 0`, no round-up, orientation open |
| VERIFY-WORK-032-1-03 | Playwright | `tests/view/capture/work-032-1.mjs fix1` → `<EV>/rows/fix1-live.json` | Fresh save, orientation open for 30 s at real time: zero `roundup.fired`. The first one comes ≥ `eventIntervalMs` after `dialogue.closed`. |
| VERIFY-WORK-032-1-04 | Vitest | `tests/sim/avatar-blockers.test.ts`, on real content and content-min | Steering toward each blocker, or holding any of 8 directions for 5 s from 8 starts, never ends a tick inside a blocker or outside the walkArea. A diagonal push slides along the edge. Walking up stops at the blocker base. |
| VERIFY-WORK-032-1-05 | Playwright loop | `work-032-1.mjs solid` → `<EV>/loops/fix2-solid-<house>.mp4`, `<EV>/rows/fix2-solid.json` | Holding KeyW for 2 s below each house: `avatar.y >= blocker base` throughout |
| VERIFY-WORK-032-1-06 | Vitest | `tests/sim/doors-street.test.ts`, on both content sets | A straight-line walk from `playerSpawn` to below each door, then up, gives one `scene.changed` into `dog-room`. For `owl-room` this happens only once `complete && arrivalDone`; before that the avatar stands in the rect with no change, so VERIFY-MEC-001-009 stands. Rect centres, spawns and approach points are walkable. |
| VERIFY-WORK-032-1-07 | stills + PIL measurement | `work-032-1.mjs doors` → `<EV>/captures/door-<house>-<H>-NNN.png`; `<EV>/door-geometry.json` | Rect centre x within ±10 px of the painted door centre: Starter +0.5, Pet −1. Rect top at or below the anchor y. Measured at 1080 and 823. |
| VERIFY-WORK-032-1-08 | Playwright loop | `work-032-1.mjs enter` → `<EV>/loops/fix3-enter-<house>.mp4`, `<EV>/rows/fix3-enter.json` | Each loop ends in the interior with one `scene.changed` |

## Changed rows (setup only; stated expectations unchanged)

These rows now start from an orientation-done state (`orientationDone()` in `tests/sim/helpers.ts`), because the feed no longer runs under the opening box:

- VERIFY-MEC-002-002, VERIFY-MEC-002-005, VERIFY-MEC-002-007;
- the VERIFY-MEC-010-013 control arm;
- VERIFY-MEC-010-004;
- VERIFY-TOOL-004 parity.

Core §9 Q7(a) and Q14(a) now raise their held round-ups with `debugSimulatePurchase`.

VERIFY-MEC-001-013 (CHK-001) is extended by CHK-001-11..14 (tools amendment).

# Amendment: verification.md — VERIFY-WORK-036-1-01..11 and VERIFY-T2-SITE-008 (WORK-036-1)

- Date: 2026-11-03. Lane WORK-036-1, RUN-005, task TASK-258. As built at 5e02c35 (base 855c2e5).

| ID | Requirement | Where |
|---|---|---|
| VERIFY-WORK-036-1-01 | compatibility placeholders load both ways; the four tuning fields and their defaults | tests/content/greeting-checks.test.ts |
| VERIFY-WORK-036-1-02 | CHK-007-14..17 each fire; 1.2 fails zod; lines.stripped → CHK-008-01; 98 ids | tests/content/greeting-checks.test.ts |
| VERIFY-WORK-036-1-03 | 361 px no meeting, 360 px both `meeting`, facing each other, one `greeting.played`, two `pet.phaseChanged`, no `pet.reacted`, one draw per pet stream | tests/sim/greetings.test.ts |
| VERIFY-WORK-036-1-04 | 60 000 ms cooldown per pair, counts down (also in interiors), next greeting at the tick it reaches 0; another pair greets meanwhile | tests/sim/greetings.test.ts |
| VERIFY-WORK-036-1-05 | band lookup 0.9/0.6/0.5/0; 10 000 draws within ±2 points; deterministic; own stream only | tests/sim/greetings.test.ts |
| VERIFY-WORK-036-1-06 | meeting → idle → walking; three pets in radius: only the first pair meets, the third is not stuck | tests/sim/greetings.test.ts |
| VERIFY-WORK-036-1-07 | Owl greeting fulfils `greet-the-owl` in the same tick (event order), Dog does not, an early greeting is not remembered | tests/sim/greetings.test.ts |
| VERIFY-WORK-036-1-08 | no meeting or cooldown with a dialogue open, in design mode, during a site arrival, in an interior; the first tick after greets | tests/sim/greetings.test.ts |
| VERIFY-WORK-036-1-09 | `greetings` + `meeting` round-trip; a v2 save without `greetings` loads `{}`; bad pair keys → unknownContentId; version 2 | tests/sim/state.schema.test.ts |
| VERIFY-WORK-036-1-10 | row 24 after row 23 dispatches `debugGreetNow`; reducer greets the closest pair with a running cooldown, `debug.applied` first; notOnStreet; noPair | tests/view/debugPanel.test.ts, tests/sim/debug.test.ts |
| VERIFY-WORK-036-1-11 | live: row 24 on the street with the mate's want 3 active → cooldown > 55 000, mate Hearts 3, log `greeting.played` then `want.fulfilled greet-the-owl`, 0 console errors | tests/view/capture/work-036-1.mjs |

- VERIFY-CORE-001 re-pinned: 30 actions / 46 events / 33 selectors.
- VERIFY-T2-SITE-008 (unchanged, still passes): want 3 still evaluates `met: false`; it is now also fulfilled by a greeting with the Owl in the same dispatch (VERIFY-WORK-036-1-07), and the debug arm still reaches Hearts 3.
- VERIFY-WORK-035-1-05 re-pinned: the never-same-target-twice run restarts at each `greeting.played` of that pet.

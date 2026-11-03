# Amendment: verification — WORK-036-2 rows (greeting beat, greeted pill, m5 greeting beats)

- Date: 2026-11-03. Lane WORK-036-2, RUN-005, task TASK-263. As built at 740ff6a (base 40fe619 + WORK-035-2 f8d2f38 merged at 6e957a1).

| ID | Kind | Where | Pins |
|---|---|---|---|
| VERIFY-WORK-036-2-01 | Vitest, fake timers, Phaser doubles | tests/view/greetingBeat.test.ts | t 0 bubble A + reaction 0 st + hop A; t 120 bubble B + reaction +4 st + hop B + one 4 ♥ burst without `to`; hop +24 over ARRIVE.hopMs yoyo, sim position untouched; cancel before 120; audio null; a pet not drawn |
| VERIFY-WORK-036-2-02 | Vitest | greetingBeat.test.ts | GREET_EMOJI map; tap text; the same beat for each outcome |
| VERIFY-WORK-036-2-03 | Vitest, scene harness | tests/view/streetScene.test.ts | row-24 greeting on drawn pets → A's bubble at once, B's after 120; undrawn pet no throw; second greeting cancels the first; no hook on InteriorScene |
| VERIFY-WORK-036-2-04 | Vitest | streetScene.test.ts | meeting facing → flipX false / true; meeting maps to the idle clip |
| VERIFY-WORK-036-2-05 | Vitest | greetingBeat.test.ts | reduced motion: sounds, bubbles, hops and burst kept; no shake / hitstop / flash |
| VERIFY-WORK-036-2-06 | Vitest | tests/view/wantPanel.test.ts | the mate's want 3 pill "☐ Say hello to Owl" → "✓ Say hello to Owl", no adjacency pill |
| VERIFY-WORK-036-2-07 | Playwright trace | tests/e2e/m5-trace.mjs → tests/e2e/lib/m5-greeting.mjs `greetingBeats` | g1 setup (row 22 ×2 for owl-mate); g2 Owl–mate greeting after a street-meet heading with the pair > 1.5 ru apart (natural, or row 24 once the pair is the closest within 1.5 ru), both meeting, facing; g3 bubble timing; g4 burst; g5 sound; g6 want.fulfilled greet-the-owl + heart.earned 3 + dialogue.opened + wants.exhausted; g7 cooldown falling; g8 natural greeting ok / skipped (≤ 90 s) |
| VERIFY-WORK-036-2-08 | live recorder | rows/greeting-sound.json | exactly two sfx/reaction plays per greeting, detune 0 then 400, 120 ± 50 ms apart |
| VERIFY-WORK-036-2-09 | recording | loops/greeting.mp4, loops/greeting-heart.mp4 | cut from the m5 trace's screencast (video only: the harness encoder writes `-an`; the sound is proven by -08); verdict at the play session |

Attempt 2 (as built at addfa6f): m5 base beat 3 (WORK-035-2, wording unchanged) waits, bounded at 20 s per pet, until the pet is out of WORK-036-1's `meeting` phase and taps a point inside its hit box outside the joystick capture square (baseDiameter/2 + 12 px), and counts only a `pet.tapped` logged after the tap; g2's facing clause holds vacuously when the Owl and the mate share one x (both on street-meet: `faceToward` keeps each facing).

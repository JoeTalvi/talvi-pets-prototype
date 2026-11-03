# Amendment: verification.md — VERIFY-WORK-035-2-01..08 and the m5 trace (WORK-035-2)

- Date: 2026-11-03. Lane WORK-035-2, RUN-005, task TASK-257. As built at 0f35bdf (base 855c2e5).

| VERIFY ID | Rule | Test / check |
|---|---|---|
| VERIFY-WORK-035-2-01 | one sprite per street pet, kept equal to `streetPets`; `pet.outside {dog,false}` destroys the Dog's sprite and bubble in that dispatch; `{owl,true}` adds the Owl at its behaviour position; no mate sprite mid-arrival; `state.reset` rebuilds the set | tests/view/streetPets.test.ts |
| VERIFY-WORK-035-2-02 | each sprite's depth = its behaviour y; the Owl at y 948 in front of the Pet House (940); `pet.phaseChanged {owl, walking}` changes only the Owl's clip | tests/view/streetPets.test.ts |
| VERIFY-WORK-035-2-03 | overlapping pets → the larger base y gets `tapPet`; a bubble over a pet wins; a visible outline wins over both; a pet over a visible house icon wins, no pet → `acknowledgeProject`; log targets name the hit pet | tests/view/streetPets.test.ts |
| VERIFY-WORK-035-2-04 | `pet.tapped {dog}` shows the Dog's bubble only, the mate's tap the mate's only; `petBubble(petId)` resolves each pet's bubble; interior bubble tests unchanged | tests/view/streetPets.test.ts, tests/view/bubbles.test.ts (unchanged) |
| VERIFY-WORK-035-2-05 | the m5 trace (gate Q18), below | tests/e2e/m5-trace.mjs |
| VERIFY-WORK-035-2-06 | m3 trace 38/38 with the N-pet street (`StreetScene.pet` = `owl-mate` via the compatibility getter), m1 and m2 green | tests/e2e/m1-trace.mjs, m2-trace.mjs, m3-trace.mjs (unchanged) |
| VERIFY-WORK-035-2-07 | loops street-pets-wander-1080/-823, pets-outside-override-1080; stills street-three-pets-1080/-823, dog-inside-after-entry-1080; every pet inside the 823 band; the look is a play-session judgement | tests/e2e/m5-trace.mjs |
| VERIFY-WORK-035-2-08 | no change under src/sim, src/content, src/ui, public | `git diff --stat 855c2e5 -- …` empty |

m5 trace beats (`tests/e2e/m5-trace.mjs`, seed `<EV>/m5-seed.real.json` generated from `tests/view/capture/mate-arrived.steps.json` + one Dog Heart):

1. boot from the seed; zero console errors; drawn = `streetPets`;
2. roll: walk out of the Dog room → `streetVisits` +1, Dog inside (just left), Owl = `rollOutside(seed, 'owl', streetVisits)`, drawn = `streetPets`;
3. row 23 "All out": three sprites, depth = base y; a tap on each → `pet.tapped {petId}` and that pet's bubble above it;
4. meeting point: within 40 s a pet targets `street-meet` and a pair comes within 360 px (pair, time and positions logged for WORK-036);
5. never in two places: Dog outside → enter the Dog room → interior Dog, `outside` false, one `pet.outside {dog,false}`; row 23 "Roll" inside → walk out → Dog not drawn;
6. "All in" → only the mate; "Roll" keeps the set until the next arrival, which rolls again;
7. reload: `streetVisits`, `session.petsOutside` and each `outside` survive; drawn set matches;
then the 1920×823 window (three pets inside the band, 20 s wander loop) and a zero-errors beat. Extension marker for WORK-037-3 / WORK-036-2: `// --- WORK-037-3 / WORK-036-2 beats ---`.

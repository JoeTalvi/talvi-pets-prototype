# Amendment: presentation.md §4.2 / §7 / §9 — the street greeting beat (WORK-036-2, DEC-046, DEC-049 spec §10)

- Date: 2026-11-03. Lane WORK-036-2, RUN-005, task TASK-263. As built at 740ff6a (base 40fe619 + WORK-035-2 f8d2f38 merged at 6e957a1).

## §4.2 Street subscriptions
- StreetScene adds `greeting.played` → `GreetingBeats.played(event)` (`src/view/celebration/greetingBeat.ts`); `state.reset` and scene SHUTDOWN → `cancelAll()`. Interiors do not subscribe (a greeting only happens on the street).
- Pets are looked up in WORK-035-2's `StreetPetLayer.pets` by `petId`; a pet that is not drawn gets no bubble and no hop (no throw). A pet's new greeting cancels its previous beat.

## §7 The §10 beat as built
- t 0: `petA` (content order; `owl-mate` for the Owl–mate pair) shows its emote bubble (`kind 'emoji'`, class `greeting`, glyph `GREET_EMOJI[emoteA]`, tap text `tpp.bubble.greeting` with `{pet}`) and hops once.
- t `GREET.offsetMs` (120): `petB` shows its emote bubble and hops; one `glyphBurst` of 4 ♥ (no `to`: rise and fade) from the midpoint of the two bubble anchors, mapped world → `#panels` through the street camera's `worldView` and `zoom`.
- Values (not §C): `GREET_EMOJI` friendly 🎵 / polite 🙂 / surprised 😮; hop `GREET_HOP_PX` 24 over `ARRIVE.hopMs` 200 (100 up, 100 yoyo back, Quad.easeOut) applied to the sprite's `displayOriginY`, so `behaviour` x/y and `PetSprite.sync` are untouched; `GREET_HEARTS` px 44, spreadPx 56, staggerMs 60, flightMs `REACT.riseMs` 400, colour `var(--red)`.
- Every emote outcome plays the same beat (DEC-016). Bubble life is the bubble's own `bubbleMs`.
- A greeting that fulfils the mate's want also starts its Heart moment in the same dispatch; the beat is not delayed and plays under the Heart overlay.
- Reduced motion: the beat keeps the hops and the ♥ burst (tiers.md rule 5 drops shake, hitstop and flash; the beat uses none of them); both sounds and both bubbles play.

## §9 Audio
- Two view-timed `Audio.play('reaction', { semitones })` per greeting: 0 st at t 0 (petA), +4 st (detune 400) at t 120 (petB). The sim emits no `pet.reacted` for a meeting, so there is no event-timed reaction play.

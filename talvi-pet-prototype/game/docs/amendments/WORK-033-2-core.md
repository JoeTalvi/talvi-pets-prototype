# WORK-033-2 amendment: systems/core.md

- Date: 2026-11-02. Lane WORK-033-2 (RUN-004, MILESTONE-009). Describes the code at lane commits d9db5b0 (stripped reaction, lines, strings, labels), 5b791e6 (chooser counts, Replace, panel gallery), d9c70d6 (debug row 19) and 5c56a25 (M3 trace), on base 23b302e (the WORK-033-1 gated head).
- As-built only. No FORK was taken in this lane; tier-1/2 decisions are in the lane journal.

## §1 `Reaction`

- `Reaction = 'love' | 'like' | 'dislike' | 'interrupted' | 'greeting' | 'stripped'` (state.ts and `ReactionSchema` in state.schema.ts). Additive; `SAVE_SCHEMA_VERSION` stays 2.

## §3 `pet.reacted`

- Shape unchanged. New value: `{ petId, reaction: 'stripped', slotId: null, typeId: <the stripped type>, line: <one of the pet's lines.stripped>, walkOver: false }`, followed in the same event list by `pet.phaseChanged { to: 'reacting', reaction: 'stripped', target: null, verb: null }` (the order every `transition` uses). No new event or action.

## §7 `pets/<petId>.json`

- `lines.stripped: string[]`, required, 1–3 entries, each 1..140 characters (zod in schema/pet.ts). Authored placeholder lines (DEC-040) in each pet's voice: Dog "Oh. Something I loved used to be right here." / "I keep looking for my favourite thing. It has gone."; Owl "Oh dear. Something I was fond of has gone missing." / "I was sure there was something lovely here. How odd." FX-CONTENT-MIN and the `tests/fixtures/bad` bundles carry "Something is missing.".
- Want `rewardLabel` texts for `items` rewards read "2 charms: …" (DEC-043); see the mec-009 amendment.

## §7 string key registry

- New keys (values **P**): `tpp.bubble.stripped` = "Something is missing." (added to `RequiredDialogueKeys`; the generic text of the `stripped` reaction class when an event carries no line), `tpp.chooser.copies` = "×{count}", `tpp.chooser.noneLeft` = "none left".

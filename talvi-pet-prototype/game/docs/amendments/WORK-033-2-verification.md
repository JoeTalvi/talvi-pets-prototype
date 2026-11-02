# WORK-033-2 amendment: verification.md

- Date: 2026-11-02. Lane WORK-033-2 (RUN-004, MILESTONE-009). Describes the code at lane commits d9db5b0 (stripped reaction, lines, strings, labels), 5b791e6 (chooser counts, Replace, panel gallery), d9c70d6 (debug row 19) and 5c56a25 (M3 trace), on base 23b302e (the WORK-033-1 gated head).
- As-built only. No FORK was taken in this lane; tier-1/2 decisions are in the lane journal.

## §4 rows

New:
- VERIFY-MEC-004-015 (jsdom): a zero-count type among three stays at its grant position, greyed, "none left", `aria-disabled`; a click dispatches nothing and logs only `input.tap`; the header counts copies in hand.
- VERIFY-MEC-004-016 (jsdom): with the chooser open, a place elsewhere ("none left"), a remove ("×1") and `debugGrantCopies` ("×3", header) update the cards without reopening.
- VERIFY-MEC-005-021 (jsdom): Replace on a filled slot lists the current type greyed and inert; another type replaces (`replacedTypeId` the old type) and the old copy returns.
- VERIFY-MEC-007-019 (Vitest, FX-CONTENT-MIN): fulfil Dog want 1 with `dog-bed`, remove it, run 30 s → one `pet.reacted { dog, stripped, slotId null, typeId dog-bed, line ∈ lines.stripped }` followed by `pet.phaseChanged {reacting}`, `strippedPending` emptied, Hearts 1; none when the bed is placed back first; identical events and state across two runs of one seed; held while a dialogue is open.
- VERIFY-MEC-007-020 (jsdom): `pet.reacted {stripped}` shows 😢 at once (class `stripped`), a tap shows the line, the clip stays `idle`.
- VERIFY-MEC-009-026 (jsdom + content): the want panel reads "Reward: 2 charms: Rug and Cushion"; every real `items` reward label starts "<copies> charms: " (Owl want 2 "2 charms: Potted Tree, Night Light"); no "charm types" in content.
- VERIFY-MEC-010-017 (jsdom): row 19 "Grant copies" follows rows 1–18 (labels and order unchanged), select in catalogue order by name, count 1..9 default 1; Grant dispatches `debugGrantCopies {typeId, count}`; 12 is rejected and shown under the row.

Rewritten:
- VERIFY-MEC-004-009 "no counts" → every card carries "×n" = `copiesOf` (two lamps read ×2; header counts copies in hand).
- `mec-005 R8 replace` jsdom case: picking the same type is no longer offered (lamp inert); the replace uses another type.

Browser (M3 trace, `tests/e2e/m3-trace.mjs`): want panel "2 charms" still before the bed; after TEST-005/006 the scarcity block (place lamp → counts 0 → chooser "none left" + others "×n" → inert click → remove → "×1" at the same position), the strip reaction (remove bed → `charm.removed` then `charm.stripped` → Done → `pet.reacted {stripped}` ×1 with a line, 😢 bubble, `strippedPending` [], Hearts 1 → bed back), the row 19 still; after the quota context a tier 1 save reset context (`save.discarded {schemaVersion}`, scene street, `tpp.save` at schemaVersion 2). Loops `scarcity-chooser`, `stripped-reaction`; stills `want-panel-2-charms-1080`, `chooser-none-left-1080`, `stripped-reaction-1080`, `debug-grant-copies-1080`, `panels-chooser-states-1080`.

## §10 TEST-002 row

- Runnable: the arm is the default scarcity (one copy per award) plus debug row 19 "Grant copies"; the log records `charm.removed`, `charm.stripped`, `pet.reacted {stripped}` and `items.granted {source: 'debug'}`. GAP-7's TEST-002 half is closed.

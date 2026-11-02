# WORK-033-2 amendment: systems/presentation.md

- Date: 2026-11-02. Lane WORK-033-2 (RUN-004, MILESTONE-009). Describes the code at lane commits d9db5b0 (stripped reaction, lines, strings, labels), 5b791e6 (chooser counts, Replace, panel gallery), d9c70d6 (debug row 19) and 5c56a25 (M3 trace), on base 23b302e (the WORK-033-1 gated head).
- As-built only. No FORK was taken in this lane; tier-1/2 decisions are in the lane journal.

## §8.2 `chooser` card states (geometry unchanged: 272 × 280 cards, 460 px sheet, locator as before)

- Badge (placeholder, DEC-040; judged at the MILESTONE-009 play session): a pill at the card's top-right (12 px inset), min-width 56 px, height 40 px, 0 12 px padding, paper fill, 2 px ink stroke, radius 20 px, Nunito 800 24 px / 36 px, ink text: "×n".
- Zero-count ("none left") card: the whole card at opacity 0.5, `cursor: default`; its label pill on paper2 with a `line` stroke and `muted` text reads "none left".
- Renders.html screen 8 draws no counts; the layout is kept and only the badge/label is added (order fork 4 default: DEC-043 is the user's later decision).
- `/tools/panels.html` renders the chooser states with the same card markup: one copy on each card and the last card "none left" (header 4 / 7 "charms you own").

## §6 bubbles

- New reaction emote 😢 for the `stripped` class (text glyph like every reaction; no art asset).

## §8.2 `debugPanel`

- Row 19 "Grant copies" (select, count input, Grant) in the existing row grid.

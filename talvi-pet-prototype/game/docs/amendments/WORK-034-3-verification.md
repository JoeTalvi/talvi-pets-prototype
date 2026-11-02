# WORK-034-3 amendment: verification.md (tier 2 site rows, M3 trace beats)

- Date: 2026-11-02. Lane WORK-034-3 (RUN-004, MILESTONE-009). Describes lane commits 13fd4f9, 664aa68, 8277c6e, 6bbdef3, 1b0a1a5 on base cc42afa. As-built only.

## New VERIFY rows (Vitest, HEADLESS jsdom, real content)

| ID | Where | Asserts |
|---|---|---|
| VERIFY-T2-SITE-101 | tests/view/streetSite.test.ts | garden art `world/site-garden-empty` while locked at (380, 955), origin (0.5, 1), depth −0.5 (above tiles −1, below houses); `world/site-garden-base` after `space.unlocked` and after a reload |
| VERIFY-T2-SITE-102 | tests/ui/streetSiteHud.test.ts | Decorate + site Stars hidden while locked; shown "Decorate" / "0 / 24 ★" once unlocked; Decorate ↔ Done toggles design mode on the street; "4 / 24 ★" after a placement, track width 16.67 %; Stars hidden with `debugSetStarsVisible false`, back on true; street HUD hidden in an interior; no `.tpp-more-homes` |
| VERIFY-T2-SITE-103 | tests/view/streetSite.test.ts, tests/ui/streetSiteHud.test.ts | 6 outlines, shown only in design mode with the site unlocked; outline tap → `slot.tapped {slotId, filled:false}`; placement → `charm.placed {siteId garden}` and a `CharmSprite` at (120, 820), outline `filled`; tap again → `filled:true`; the replace/remove sheet opens over the occupied site slot and Remove returns the copy; outlines hidden on Done |
| VERIFY-T2-SITE-104 | tests/view/streetSite.test.ts, tests/ui/streetSiteHud.test.ts | no mate sprite before the arrival; after it one `PetSprite owl-mate` at the walk's last point, idle clip `pet-owl-mate-idle`; after a reload drawn at `behaviour (x, y)`; a tap on it records `input.tap {target pet:owl-mate}` and dispatches `tapPet`; want panel shows the mate's want on the street in design mode only |
| VERIFY-T2-SITE-105 | tests/view/streetSite.test.ts | `debugFillSpace` → `space.arrivalStarted {garden, owl-mate}` → walk from `arrivalPath[0]`, `fades` false, `finishMs = doorMs + bubbleMs`; 🎵 at the end with alpha 1; exactly one `arrivalFinished`; `pet.arrived`, `want.activated {owl-mate, 0}`; `siteArrival` null; a reload mid-walk replays it from the first point. tests/view/arrivalWalk.test.ts (project arrivals) unchanged and green |
| VERIFY-T2-SITE-106 | tests/ui/streetSiteHud.test.ts | `space.unlocked` → exactly one visible toast, `data-kind space`, "A garden plot is open on the street" |

## M3 trace (tests/e2e/m3-trace.mjs) — new beats and order

- Beat order: seed + SFX + first tap → tester label → TEST-008 reset frozen + 120 s → Playtest → TEST-003 (street) → TEST-004 (street ?) → walk in → TEST-001 → want panel "2 charms" → TEST-005/006 → scarcity → strip reaction → TEST-007 → **garden site** → mute → exports → R-9 → errors → storage → quota → tier 1 save reset.
- Garden site beats (all real inputs after one debug-row click): (1) row 20 "Unlock garden" → `space.unlocked {garden}`; walk out of the Dog room → the street shows `world/site-garden-base`, HUD "Decorate" and "0 / 24 ★", no "More homes coming"; (2) Decorate → 6 garden outlines only; tap garden-small-1 → chooser → a card → `charm.placed {siteId garden}`; again at garden-small-2 with a different type → "4 / 24 ★" then "8 / 24 ★", each count −1; (3) Done → `space.arrivalStarted {garden, owl-mate}` (the as-built name; the order's `arrival.started` is WORK-034-2 fork 1's separate event) → the walk (`fades` false) → `arrival.finished {owl-mate}` ×1, `pet.arrived {owl-mate, garden}` ×1 → the street sprite; `want.activated {owl-mate, 0}`; (4) input unfreezes: `siteArrival` null, mode play, no dialogue, a real ArrowRight hold moves the avatar (review WORK-034-2-1 A2); (5) ≥ 2 idle ↔ walking switches of the mate within 25 s; (6) Decorate → tap the occupied garden-small-1 → sheet → Remove → `charm.removed {garden}` ×1, count +1, "4 / 24 ★", Done; (7) walk back into the Starter House (scene dog-room) so mute and exports run in their original scene (the mate's wander on the street writes `pet.phaseChanged` lines that would fall between an export and its `log.exported`).
- Loops added: `site-placement`, `mate-arrival`, `mate-wander` (cut from the trace screencast by marks); stills `site-unlocked-hud-1080`, `site-design-outlines-1080`, `site-placed-8stars-1080`, `mate-arrived-1080` under captures/; row `rows/t2-site.json`.
- The scarcity inert-click beat now counts records appended after a log-index cursor (`linesSince(type, cursor())`) instead of `t >= lastT()`, which also counted the triggering placement's own same-`t` records (review WORK-034-2-1 A1).

## Rewritten pins

- tests/view/streetHud.test.ts VERIFY-MEC-002-026 "More homes coming iff activeProjectId === null" → "More homes coming is retired — absent with or without an active project".

## Forks

- None.

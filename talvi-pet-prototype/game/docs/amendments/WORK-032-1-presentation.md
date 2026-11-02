# WORK-032-1 amendment: systems/presentation.md

- Date: 2026-11-02. Lane WORK-032-1 (RUN-004). Describes lane commit d96a454, base a969075. As-built only. No view code changed.

## §2.1 logical spaces: street geometry below the visible band

The street walkArea now reaches y 1010. The Pet House door rect is 940..990, its spawn y is 1000, and the Starter door spawn y is 950.

- At the minimum 1920×823 game size, the camera scroll is (1080 − 823)/2 and the visible band is y 128..951.
- So the ground in front of the Pet House door, and the bottom 59 px of the lane, are off-screen there. The door rect top (940) is visible; its lower part is not.
- At 1920×1080 everything is visible.
- Stills at both sizes: `<EV>/captures/door-*-1080-*.png`, `door-*-823-*.png`.

CHK-001-09 warns once for `street.json` (fork (a), journaled).

## Door entry placement (§5.2 door transition unchanged)

Each street door rect is centred on the painted door, and its top is at the house's anchor y, which is the `HouseSprite` depth line.

- The avatar standing in it has depth > the house depth, so it draws in front of the house.
- The rect is entered by walking up from the street.

The view did not change: there are no door markers, and the door fade is the same.

## §7.6 arrival walk

The Owl's arrival path is re-routed under the Pet House blocker: (1820,910) → (1680,985) → (1490,965).

- It is 349.9 px long, so the door beat is at 729 ms (was 789).
- `ArrivalWalk` is unchanged.

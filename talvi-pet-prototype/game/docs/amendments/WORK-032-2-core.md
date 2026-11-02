# WORK-032-2 amendment — `phase-2-technical/systems/core.md`

- Date: 2026-11-02. Order: WORK-032-2 (RUN-004, MILESTONE-009), roadmap WORK-032 fix 5. Describes game code at lane sha `cfce544`. As-built only.

## §7 CONTRACT-CONTENT (charm type schema, `src/content/schema/charms.ts`) — add one optional field

| Field | Type | Meaning |
|---|---|---|
| `wallArtFacing` | `'left' \| 'right'`, optional (absent = `'left'`) | The wall a non-painting wall charm's art is drawn for; the view mirrors it on the other wall (presentation §6.2). |

- Content as built: only `hanging-plant` carries it (`"wallArtFacing": "right"`, `src/content/charms.json`). No check (CHK) reads it; TOOL-001 result unchanged (0 errors / 6 warnings).
- FORK note: this field is not in the roadmap's 2026-11-02 contract-change table; it is gate fork default 5 ("per-type facing flag inverting the wall flip, no asset change"). CONTRACT-CONTENT version bump is the director's call at application.

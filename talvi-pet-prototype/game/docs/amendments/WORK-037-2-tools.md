# Amendment WORK-037-2 — tools.md, TOOL-001 outfit rules

Dated 2026-11-03, as-built at the WORK-037-2 lane head (base bbc5c45). File `src/sim/checks/chk-010-outfits.ts`, registered in `src/sim/checks/index.ts`. The group is skipped when no `outfits.json` is present.

| ID | Level | Rule |
|---|---|---|
| CHK-010-01 | error | outfit ids are unique |
| CHK-010-02 | error | exactly one outfit `default`, with sheet `player/avatar-sheet` |
| CHK-010-03 | error / info | each `sheet` is a manifest `spritesheet` with frame 192×256 and the same clip names as `player/avatar-sheet`; a sheet absent from the manifest is **info** (`CHK-010-03, KNOWN-MISSING`, "later batch") |
| CHK-010-04 | error | a `completionOutfitId` / `arrivalOutfitId` names a known, non-default outfit |
| CHK-010-05 | error | every non-default outfit is granted by exactly one beat |
| CHK-010-06 | error | every `nameKey` is in `strings.json` |

- CHK-010-03 absence is reported by the check, not by `resolve.ts` CHK-CORE-03, so the boot (`findingsOf`, no known-missing list) stays error-free until WORK-037-1's rows merge (FLAG; WORK-037-3 may tighten it).
- `tools/known-missing-assets.json` lists `player/avatar-cosy-sheet` and `player/avatar-garden-sheet` (batch WORK-037); `check:assets` reports them as two VERIFY-ASSET-001 known-missing warnings. `ui/icon-closet` is not listed (not referenced by `src/content`; the shipped-list test requires a content reference). WORK-037-3 removes the rows.
- `check:content --known-missing`: 0 errors, 12 warnings (unchanged), 2 info, 95 checks, 15 files.

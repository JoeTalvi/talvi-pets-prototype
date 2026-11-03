# Amendment: assets.md ASSET-018 (WORK-038-1, DEC-049)

- Date: 2026-11-02. Lane WORK-038-1, RUN-005, task TASK-238. As built at 0956e5b.
- Contract-table row covered: `assets.md` ASSET-018 — 5 → 8 SFX pairs, same encoding contract, ledgered `ai-placeholder`.

| id | limit | WAV | m4a measured | ogg measured | class |
|---|---|---|---|---|---|
| `sfx/tick` | ≤ 0.100 s | 36 ms, −8 dBFS | 92.9 ms | 36.0 ms | one soft tuned note, C6 + quiet 4th harmonic (pitch-stepped by detune) |
| `sfx/riser` | ≤ 0.500 s | 390 ms, −7 dBFS | 441.2 ms | 390.0 ms | soft upward shimmer, C5 → C6 swelling glide + a fifth |
| `sfx/reveal` | ≤ 0.400 s | 300 ms, −5 dBFS | 348.3 ms | 300.0 ms | sparkle chime G6 C7 E7 |

- Source: scripted tones (gate Q20(a); zero spend; no Asset-Bot, no ElevenLabs). Tool `tools/assets/sfx-placeholders.mjs` (SHA-256 2f1e3e2f…, unchanged) with the **new** config `tools/assets/sfx-placeholders-v2.config.json` (SHA-256 a3801e57f08f5257a8673319221affef3717047c66927bcb4b8a25e2411981da). The v1 config is untouched, so the five v1 rows keep their provenance. A negative `decay` (the riser) is a swell; no tool interface change.
- Encoding (unchanged contract): 44.1 kHz mono 16-bit PCM → afconvert AAC 96k `.m4a` + libsndfile Vorbis `.ogg` (route B; ffmpeg's vorbis rejects mono), decode round-trip validated; lengths ≥ 60 ms under the limits to absorb AAC priming/padding (no limit changed).
- Manifest: three rows appended through `npm run asset:ledger -- append` (no existing row changed): `status: ai-placeholder`, `origin: authored`, `batch: tier2-m5`, `recordedBy: WORK-038-1 / TASK-238`, `recordedAt: 2026-11-02`, measured durations/bytes/peaks and WAV SHA-256 in `postProcess`. Never accepted in-run.
- Loader total measured 102 on this branch (was 99). WORK-037-1 appends its own rows in parallel; the integrator unions and re-pins.

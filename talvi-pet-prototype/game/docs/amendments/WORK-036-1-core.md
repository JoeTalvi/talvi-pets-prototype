# Amendment: core.md CONTRACT-STATE / ACTIONS / EVENTS / CONTENT / PERSIST and §4 tick order (WORK-036-1, DEC-046)

- Date: 2026-11-03. Lane WORK-036-1, RUN-005, task TASK-258. As built at 5e02c35 (base 855c2e5).
- Interim-contract rows covered (roadmap §"Amendment, 2026-11-02", the contract-change table): CONTRACT-STATE "greeting cooldowns per pair"; CONTRACT-EVENTS `greeting.played`; CONTRACT-CONTENT "pets gain … `compatibility`" and the existing want condition kind `greeted { withPetId }` (now evaluated per gate Q9(a), see WORK-036-1-mec-009.md); CONTRACT-PERSIST additive (gate Q16(a)). Plus the debug action of gate Q17.

## CONTRACT-STATE
- `PetBehaviour.phase` gains `'meeting'` (DEC-046 pet-to-pet greeting), distinct from the avatar-entry `'greeting'` phase and reaction.
- `greetings: Record<PairKey, { cooldownMs: number }>` at the top level, last key (after `streetVisits`). `PairKey = "<a>|<b>"`, a before b in content pet order (`Object.keys(content.pets)`; shipped order dog, owl-mate, owl, so the Owl–mate key is `owl-mate|owl`). Initial `{}`. Written at a greeting with `cooldownMs = tuning.greetCooldownMs`; counted down by `dtMs` on every tick in any scene, floored at 0; entries are never deleted.

## CONTRACT-ACTIONS
- `{ type: 'debugGreetNow' }` (no payload; validator none) — MEC-010 row 24 "Greet now". On the street: the closest pair of street pets in `idle`/`walking` (ties: content order) meets at once, ignoring the radius, the cooldown and `inputFrozen`; events `debug.applied` then the meeting's events. Rejects `notOnStreet` in an interior and `noPair` with fewer than two candidates (state unchanged). Contract now **30 actions**.

## CONTRACT-EVENTS
- `{ type: 'greeting.played'; petA: PetId; petB: PetId; emoteA: GreetEmote; emoteB: GreetEmote }`, `GreetEmote = 'friendly' | 'polite' | 'surprised'` (the view maps 🎵 / 🙂 / 😮). petA before petB in content order. One per meeting; no `pet.reacted` is emitted for a meeting (order fork 3). Each pet's entry into `meeting` emits `pet.phaseChanged` (petA first). Contract now **46 events**; selectors unchanged at **33**.
- "First greeting per pair per session is logged" (DEC-046): every greeting emits one `greeting.played`, which the event log records, so the first per pair per session is the first such line after `session.started`; no `first` field (order fork 7; an open reading for Phase 2).

## CONTRACT-CONTENT
- `pets[].compatibility?: Record<PetId, number 0..1>` (zod optional so minimal content parses). Shipped placeholders (gate Q10(a)): dog {owl 0.6, owl-mate 0.5}, owl {dog 0.6, owl-mate 0.9}, owl-mate {dog 0.5, owl 0.9}. CHK-007-14..16 enforce known/other keys, completeness and symmetry once any pet authors a table.
- `tuning` gains, each with a zod default equal to the shipped value: `greetRadiusRu` 1.5, `greetCooldownMs` 60000, `greetMeetingMs` 2000, `greetEmoteWeights` = ordered bands `[{ minCompatibility, weights: { friendly, polite, surprised } }]` (the first band with `minCompatibility <= c` applies): 0.8 → 6/3/1, 0.55 → 4/4/2, 0 → 2/5/3 (placeholders). CHK-007-17 checks the band table. Keys appended at the end of tuning.json.
- Registry 94 → 98.

## CONTRACT-PERSIST
- Additive: `greetings` defaults to `{}` on a version-2 save without it; `schemaVersion` and `SAVE_SCHEMA_VERSION` stay **2**. `unknownContentId` also discards a save whose `greetings` key does not name two distinct known pets a before b in content order. `'meeting'` is a valid phase on load.

## §4 tick order
- One step inserted (order fork 1): avatar, doors (+ street hooks), feed, pets (4), **greetings (4b, `stepGreetings`)**, scripts then bubbles (5). No existing step moved. A vignette enqueued by a greeting's fulfilment opens through `stepScripts` in the same tick.

// WORK-036-2 m5 greeting beats g1–g8 (DEC-046, spec §10, gate Q9(a)/Q18), called from tests/e2e/m5-trace.mjs's extension section.
// The pair forms on the street after a pet starts heading for street-meet (review WORK-035-2-1 A1): row 23 "All in" then "All out",
// wait for a street-meet target with the Owl and the mate apart, then the first Owl–mate greeting (natural at 1.5 ru, or row 24 "Greet now"
// once they are the closest pair within 1.5 ru). Page instrumentation (window.__tppGreet) only records; every input is a real click.
import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { lines, getState, setDebug, debugOpen, evidenceRoot } from './harness.mjs';

const capturesDir = join(evidenceRoot, 'captures'), rowsDir = join(evidenceRoot, 'rows'); // review WORK-035-2-1 A7: under TPP_EVIDENCE
const GREET_EMOJI = { friendly: '🎵', polite: '🙂', surprised: '😮' };
const RADIUS_PX = 1.5 * 240, APPROACH_MS = 90000, NATURAL_MS = 90000;
const PAIR = ['owl', 'owl-mate'], KEY = 'owl-mate|owl';
const isPair = e => e && [e.petA, e.petB].sort().join() === [...PAIR].sort().join();

/** Records greeting.played, every bubble show, every game.sound.play and every ♥ burst with performance.now(). */
const instrument = page => page.evaluate(() => {
  const { game, store } = window.__tpp, rec = window.__tppGreet ??= { events: [], shows: [], sounds: [], bursts: [], wrapped: new WeakSet() };
  if (!rec.installed) {
    rec.installed = true;
    store.subscribe('greeting.played', event => rec.events.push({ ...event, at: performance.now() }));
    const play = game.sound.play.bind(game.sound);
    game.sound.play = (key, config) => { rec.sounds.push({ key, detune: config?.detune ?? 0, volume: config?.volume ?? null, at: performance.now() }); return play(key, config); };
    new MutationObserver(list => { for (const m of list) {
      for (const n of m.addedNodes) if (n.classList?.contains('tpp-glyph-burst')) rec.bursts.push({ added: performance.now(), glyphs: [...n.querySelectorAll('.tpp-glyph')].map(g => g.textContent), node: n });
      for (const n of m.removedNodes) { const b = rec.bursts.find(x => x.node === n); if (b) b.removed = performance.now(); }
    } }).observe(document.getElementById('panels'), { childList: true });
  }
  const street = game.scene.getScene('Street');
  for (const [petId, { bubble }] of street.streetPets.pets) {
    if (rec.wrapped.has(bubble)) continue;
    rec.wrapped.add(bubble);
    const show = bubble.show.bind(bubble);
    bubble.show = b => { rec.shows.push({ petId, class: b.class, glyph: b.glyph ?? null, at: performance.now() }); show(b); };
  }
});
const record = page => page.evaluate(() => { const r = window.__tppGreet; return { now: performance.now(), events: r.events, shows: r.shows, sounds: r.sounds,
  bursts: r.bursts.map(b => ({ added: b.added, removed: b.removed ?? null, glyphs: b.glyphs })) }; });
const pose = page => page.evaluate(ids => {
  const { game, store } = window.__tpp, state = store.getState(), street = game.scene.getScene('Street');
  return Object.fromEntries(ids.map(id => { const s = street.streetPets.pets.get(id)?.sprite, b = state.pets[id].behaviour;
    return [id, { x: b.x, y: b.y, phase: b.phase, facing: b.facing, target: b.target?.wanderPointId ?? null, flipX: s?.flipX ?? null, drawn: !!s }]; }));
}, ['dog', 'owl', 'owl-mate']);
const apart = p => Math.hypot(p.owl.x - p['owl-mate'].x, p.owl.y - p['owl-mate'].y);

/** A dialogue that opens from a debug row keeps the key from closing the panel: fall back to the panel's own close backdrop. */
async function closeDebug(page) {
  await setDebug(page, false);
  if (await debugOpen(page)) await page.locator('.tpp-debugPanel [data-action="close"]').first().dispatchEvent('click');
  await page.waitForTimeout(300);
}
/** Debug row by label, button by index, then the panel closed even when the row opened a dialogue. */
async function clickRow(page, label, index, select) {
  await setDebug(page, true);
  const row = page.locator('.tpp-debug-row').filter({ has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) }).first();
  if (select) await row.locator('select').selectOption(select);
  await row.locator('button:not([role=switch])').nth(index).click();
  await page.waitForTimeout(300); await closeDebug(page);
}

async function fulfilMate(page, drain) {
  await clickRow(page, 'Fulfil active want', 0, 'owl-mate');
  // The vignette and the Heart moment (≤ 4 s at Big) both end before the next fulfil.
  await drain(20000); await page.waitForTimeout(4500); await drain(8000);
}

export async function greetingBeats({ page, beat, still, mark, rowButton, drain }) {
  await closeDebug(page);
  mkdirSync(rowsDir, { recursive: true }); mkdirSync(capturesDir, { recursive: true });
  // g1: the mate's want 3 `greet-the-owl` active.
  for (let i = 0; i < 3 && (await getState(page)).pets['owl-mate'].fulfilledWantIds.length < 2; i++) await fulfilMate(page, drain);
  const g1 = await getState(page);
  const activeId = await page.evaluate(() => { const { content, store } = window.__tpp, s = store.getState(), mate = s.pets['owl-mate'];
    return content.pets['owl-mate'].wants.find(w => !mate.fulfilledWantIds.includes(w.id))?.id ?? null; });
  beat('g1 setup: row 22 "Fulfil active want" (owl-mate) ×2 with each vignette and Heart moment drained → the mate\'s active want is greet-the-owl',
    activeId === 'greet-the-owl' && g1.pets['owl-mate'].hearts === 2 && g1.scene.kind === 'street' && !g1.dialogue.current,
    'greet-the-owl active; mate 2 Hearts; street; no dialogue', { activeId, hearts: g1.pets['owl-mate'].hearts, fulfilled: g1.pets['owl-mate'].fulfilledWantIds });

  // g2: All in → All out; a pet heads for street-meet with the pair apart; then the first Owl–mate greeting.
  await rowButton('Pets outside', 2); await page.waitForTimeout(800);
  await rowButton('Pets outside', 1); await page.waitForTimeout(400);
  await instrument(page);
  mark('greetApproach');
  const t0 = Date.now();
  let heading = null, method = null, event = null, closest = null;
  while (Date.now() - t0 < APPROACH_MS && !event) {
    const p = await pose(page), r = await record(page);
    event = r.events.find(isPair) ?? null;
    if (event) { method ??= 'natural'; break; }
    const d = apart(p);
    heading ??= PAIR.find(id => p[id].target === 'street-meet') && d > RADIUS_PX ? { petId: PAIR.find(id => p[id].target === 'street-meet'), distancePx: Math.round(d), ms: Date.now() - t0 } : null;
    const dogNear = Math.min(Math.hypot(p.dog.x - p.owl.x, p.dog.y - p.owl.y), Math.hypot(p.dog.x - p['owl-mate'].x, p.dog.y - p['owl-mate'].y));
    if (heading && d <= RADIUS_PX && (!p.dog.drawn || dogNear > d) && ['idle', 'walking'].includes(p.owl.phase) && ['idle', 'walking'].includes(p['owl-mate'].phase)) {
      closest = { distancePx: Math.round(d), dogNearPx: Math.round(dogNear), ms: Date.now() - t0 };
      method = 'debug row 24 (pair within 1.5 ru after the street-meet heading)';
      await clickRow(page, 'Greet now', 0);
      const after = await record(page);
      event = after.events.find(isPair) ?? null;
      if (!event) method = null;
    }
    if (!event) await page.waitForTimeout(100);
  }
  if (!event) return beat('g2 greeting: Owl and mate greet after a street-meet heading', false, 'greeting.played {owl, owl-mate}', { heading, closest, timedOutMs: APPROACH_MS });
  const lag = (await record(page)).now - event.at;
  mark('greetEvent'); const eventWall = Date.now() - lag;
  const p2 = await pose(page);
  copyFileSync(await still(capturesDir, 'greeting-a-1080', `g2: frame ≈ ${Math.round(lag)} ms after greeting.played (${method})`), join(capturesDir, 'greeting-a-1080.png'));
  const left = p2.owl.x <= p2['owl-mate'].x ? 'owl' : 'owl-mate', right = left === 'owl' ? 'owl-mate' : 'owl';
  await page.waitForTimeout(Math.max(0, 200 - ((await record(page)).now - event.at)));
  copyFileSync(await still(capturesDir, 'greeting-both-1080', 'g3/g4: ≈ +200 ms, both bubbles and the ♥ burst rising'), join(capturesDir, 'greeting-both-1080.png'));
  beat('g2 greeting: after a pet heads for street-meet with the pair > 1.5 ru apart, greeting.played names owl-mate (petA) and owl; both in meeting; the left pet faces right, the right pet left (state and flipX)',
    heading && event.petA === 'owl-mate' && event.petB === 'owl' && p2.owl.phase === 'meeting' && p2['owl-mate'].phase === 'meeting'
    // Both pets at the same x (both on street-meet): faceToward keeps each facing (WORK-036-1 sim), so no left/right to check.
    && (p2.owl.x === p2['owl-mate'].x || (p2[left].facing === 'right' && p2[right].facing === 'left' && p2[left].flipX === false && p2[right].flipX === true)),
    'heading first; petA owl-mate; meeting; facing each other', { method, heading, closest, event, pose: p2, lagMs: Math.round(lag) });

  await page.waitForTimeout(1200);
  const r = await record(page);
  const showsOf = id => r.shows.filter(s => s.petId === id && s.class === 'greeting' && s.at >= event.at - 5);
  const a = showsOf(event.petA)[0], b = showsOf(event.petB)[0];
  beat('g3 bubbles: petA\'s greeting bubble within one frame of the event, petB\'s at 120 ± 50 ms; glyphs = GREET_EMOJI[emote]',
    a && b && a.at - event.at <= 34 && Math.abs(b.at - event.at - 120) <= 50 && a.glyph === GREET_EMOJI[event.emoteA] && b.glyph === GREET_EMOJI[event.emoteB],
    'A ≤ 34 ms, B 120 ± 50 ms, glyphs match', { a: a && { ...a, dtMs: Math.round(a.at - event.at) }, b: b && { ...b, dtMs: Math.round(b.at - event.at) }, emotes: [event.emoteA, event.emoteB] });
  const bursts = r.bursts.filter(x => x.added >= event.at - 5 && x.added <= event.at + 1000);
  beat('g4 burst: one .tpp-glyph-burst with four ♥ appears and is removed', bursts.length === 1 && bursts[0].glyphs.join('') === '♥♥♥♥' && bursts[0].removed > bursts[0].added,
    'one burst, 4 ♥, removed', { bursts: bursts.map(x => ({ glyphs: x.glyphs, addedMs: Math.round(x.added - event.at), removedMs: x.removed ? Math.round(x.removed - event.at) : null })) });
  const sounds = r.sounds.filter(s => s.key === 'sfx/reaction' && s.at >= event.at - 5 && s.at <= event.at + 1000);
  const soundRows = { event, sounds: sounds.map(s => ({ ...s, dtMs: Math.round(s.at - event.at) })), allSoundsAround: r.sounds.filter(s => s.at >= event.at - 50 && s.at <= event.at + 1000) };
  writeFileSync(join(rowsDir, 'greeting-sound.json'), `${JSON.stringify(soundRows, null, 2)}\n`);
  beat('g5 sound: exactly two sfx/reaction plays for the greeting, detune 0 then 400, 120 ± 50 ms apart (VERIFY-WORK-036-2-08: no event-timed duplicate)',
    sounds.length === 2 && sounds[0].detune === 0 && sounds[1].detune === 400 && Math.abs(sounds[1].at - sounds[0].at - 120) <= 50,
    '2 plays, 0 / 400, 120 ± 50 ms', soundRows);

  // g6: the mate's want in the same dispatch (Q9(a)), its third Heart on the street, the vignette, exhaustion.
  mark('heartStart');
  await page.waitForTimeout(900);
  await still(capturesDir, 'greeting-heart-1080', 'g6: the mate\'s third Heart moment on the street after the greeting');
  const cool1 = (await getState(page)).greetings[KEY]?.cooldownMs ?? null;
  await page.waitForTimeout(600);
  const cool2 = (await getState(page)).greetings[KEY]?.cooldownMs ?? null;
  await page.waitForTimeout(3500);
  mark('heartEnd');
  const all = await lines(page);
  const greetLines = all.filter(l => l.type === 'greeting.played' && isPair(l));
  const at = greetLines.at(-1);
  const slice = at ? all.slice(all.lastIndexOf(at)) : [];
  const fulfilled = slice.find(l => l.type === 'want.fulfilled' && l.petId === 'owl-mate' && l.wantId === 'greet-the-owl');
  const heart = slice.find(l => l.type === 'heart.earned' && l.petId === 'owl-mate');
  const opened = slice.find(l => l.type === 'dialogue.opened');
  const exhausted = slice.find(l => l.type === 'wants.exhausted' && l.petId === 'owl-mate');
  const end = exhausted ? slice.indexOf(exhausted) + 1 : slice.length;
  writeFileSync(join(rowsDir, 'greeting-want.json'), `${JSON.stringify({ state: { mate: (await getState(page)).pets['owl-mate'], greetings: (await getState(page)).greetings }, log: slice.slice(0, end) }, null, 2)}\n`);
  beat('g6 the mate\'s want (Q9(a)): in the greeting\'s dispatch want.fulfilled {owl-mate, greet-the-owl}, heart.earned {hearts 3}; the vignette opens; wants.exhausted {owl-mate}',
    fulfilled && fulfilled.t === at.t && heart?.hearts === 3 && !!opened && !!exhausted,
    'fulfilled same t; hearts 3; dialogue.opened; exhausted', { greeting: at, fulfilled, heart, opened: opened && { t: opened.t, script: opened.script?.source ?? opened.script }, exhausted });
  beat(`g7 cooldown: greetings['${KEY}'].cooldownMs > 0 and falling between two reads`, cool1 > 0 && cool2 > 0 && cool2 < cool1, '> 0 and falling', { cool1, cool2 });
  await drain(20000); await page.waitForTimeout(1500); await drain(8000);

  // g8: a natural greeting from proximity (bounded, non-blocking): Dog and Owl outside, no debug arm.
  await rowButton('Pets outside', 1); await page.waitForTimeout(300);
  const natural = method === 'natural' ? { pair: [event.petA, event.petB], fromG2: true } : null;
  let found = natural;
  const n0 = Date.now(), seen = (await record(page)).events.length;
  while (!found && Date.now() - n0 < NATURAL_MS) {
    await page.waitForTimeout(500);
    const ev = (await record(page)).events.slice(seen);
    if (ev.length) found = { pair: [ev[0].petA, ev[0].petB], timeToGreetMs: Date.now() - n0 };
  }
  beat('g8 natural greeting (bounded, non-blocking): within 90 s a proximity greeting.played, or skipped at the ceiling', true,
    'ok with the time, or skipped with the reason', found ? { status: 'ok', ...found } : { status: 'skipped', reason: 'no proximity greeting within 90 s (random wander by seed)' });
  return { eventWall };
}

/** Loop rows for m5-trace's loop table: [name, from, to, target, maxMs]. */
export const greetingLoops = marks => [
  ['greeting', marks.greetEvent - 1500, marks.greetEvent + 2500, 'WORK-036-2 g2–g5: the Owl–mate greeting beat (video only; the sound rows are rows/greeting-sound.json)', 6000],
  ['greeting-heart', marks.greetEvent - 500, marks.heartEnd, 'WORK-036-2 g6: the greeting into the mate\'s third Heart on the street', 9000],
];

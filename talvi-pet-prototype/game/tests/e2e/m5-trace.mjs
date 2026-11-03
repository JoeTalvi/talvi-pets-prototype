// WORK-035-2 M5 trace (MILESTONE-011, gate Q18): Dog and Owl on the street (DEC-045) on the Playwright library (chromium-1243, no install).
//   TPP_BASE=http://127.0.0.1:5218 TPP_EVIDENCE=<lane evidence dir>/m5-trace TPP_WORK=WORK-035-2 TPP_MILESTONE=MILESTONE-011 node tests/e2e/m5-trace.mjs
// Seed: <EV>/m5-seed.real.json, generated here (make-fixture) from tests/view/capture/mate-arrived.steps.json + one Dog Heart
// (debugFulfilActiveWant dog): Dog 1 Heart, Owl 2, the mate arrived, standing on the street. Strict boot, 1920×1080, real inputs (keyboard,
// canvas taps, debug row 23 "Pets outside" by label); window.__tpp only to read. One continuous CDP screencast cut into loops by marks.
// Beats: 1 boot → 2 roll (out of the Dog room) → 3 "All out" (three sprites, depth, taps) → 4 meeting point → 5 never in two places →
// 6 "All in" / "Roll" → 7 reload; then the 1920×823 window (still + wander loop). WORK-037-3 / WORK-036-2 extend the marked section at the end.
// Exports for later lanes: beat, still, mark, streetView, rowButton, SEED (see the bottom of the file).
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { GAME_DIR, base, evidenceRoot, sha, launch, boot, waitScene, lines, getState, steer, shot, encode,
  startStreamRecording, domRead, errorsSummary, writeJson, setDebug, WORK, MILESTONE } from './lib/harness.mjs';
import { greetingBeats, greetingLoops } from './lib/m5-greeting.mjs';

mkdirSync(evidenceRoot, { recursive: true }); // review WORK-036-2-1 A3: a cold evidence folder must not ENOENT
const loopsDir = join(evidenceRoot, '..', 'loops'), stillsDir = join(evidenceRoot, '..', 'stills');
export const SEED = join(evidenceRoot, 'm5-seed.real.json');
const SEED_STEPS = join(evidenceRoot, 'm5-seed.steps.json');
if (!existsSync(SEED)) {
  const steps = JSON.parse(readFileSync(join(GAME_DIR, 'tests/view/capture/mate-arrived.steps.json'), 'utf8'));
  const drain = { action: { type: 'advanceDialogue' }, repeat: 'drain' };
  steps.steps.push({ action: { type: 'debugFulfilActiveWant', petId: 'dog' } }, drain, { action: { type: 'tick', dtMs: 0, move: { x: 0, y: 0 } } }, drain);
  writeFileSync(SEED_STEPS, `${JSON.stringify(steps, null, 2)}\n`);
  execFileSync('npx', ['tsx', 'tools/make-fixture.ts', '--steps', SEED_STEPS, '--out', SEED], { cwd: GAME_DIR, stdio: 'pipe' });
}
const SEED_TEXT = readFileSync(SEED, 'utf8');
const QUERY = '';
const PAIR_PX = 360, MEET_MS = 40000;
const beats = [], marks = {}, traceStart = Date.now();
export const mark = name => { marks[name] = Date.now(); return marks[name]; };
let page, browser, stream, win;
export function beat(name, ok, expected, found, extra = {}) {
  beats.push({ beat: name, expected, found, ok: Boolean(ok), wall: new Date().toISOString(), elapsedMs: Date.now() - traceStart, ...extra });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  return ok;
}
export async function still(dir, point, note, p = page, extra = {}) {
  return shot(p, browser, dir, point, { target: `${base}/${QUERY}`, seededSave: 'm5-seed.real.json, trace session', note, dom: await domRead(p), ...extra });
}
/** The drawn street pets and the sim's view of them, in one read. */
export const streetView = (p = page) => p.evaluate(async () => {
  const { game, store, content } = window.__tpp, state = store.getState();
  const { streetPets, rollOutside } = await import('/src/sim/rules/streetPresence.ts');
  const street = game.scene.isActive('Street') ? game.scene.getScene('Street') : null;
  const sprites = street ? Object.fromEntries([...street.streetPets.pets].map(([id, { sprite, bubble }]) => [id,
    { x: sprite.x, y: sprite.y, depth: sprite.depth, by: state.pets[id].behaviour.y, phase: state.pets[id].behaviour.phase,
      target: state.pets[id].behaviour.target, bubble: bubble.current() ? { y: bubble.y, text: bubble.current().text } : null }])) : null;
  const rolls = Object.fromEntries(['dog', 'owl'].map(id => [id, rollOutside(state.session.seed, id, state.streetVisits)]));
  return { scene: state.scene, drawn: street ? [...street.streetPets.pets.keys()] : null, selected: streetPets(content, state).map(e => e.petId),
    outside: Object.fromEntries(Object.entries(state.pets).map(([id, pet]) => [id, pet.outside])), hearts: Object.fromEntries(Object.entries(state.pets).map(([id, pet]) => [id, pet.hearts])),
    streetVisits: state.streetVisits, petsOutside: state.session.petsOutside, seed: state.session.seed, rolls, sprites,
    interiorPet: game.scene.isActive('Interior') ? game.scene.getScene('Interior').pet?.petId ?? null : null };
});
const eqSet = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
/** Debug row helpers: rows by their <label> text, buttons by index (template order), real clicks. */
const debugRow = (label, p) => p.locator('.tpp-debug-row').filter({ has: p.locator('label', { hasText: new RegExp(`^${label}$`) }) }).first();
export async function rowButton(label, index, p = page) { await setDebug(p, true); await debugRow(label, p).locator('button:not([role=switch])').nth(index).click(); await p.waitForTimeout(300); await setDebug(p, false); }
const OUTSIDE = { roll: 0, all: 1, none: 2 };
async function drain(ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms && (await getState(page)).dialogue.current) {
    const box = page.locator('[data-panel="dialogue"]');
    if (await box.isVisible()) await box.click({ position: { x: 300, y: 60 } });
    await page.waitForTimeout(380);
  }
}
const pointOf = (x, y, p = page) => p.evaluate(([x, y]) => {
  const { game } = window.__tpp, cam = game.scene.getScene('Street').cameras.main, r = game.canvas.getBoundingClientRect(), s = r.width / 1920;
  return { x: r.left + (x - cam.scrollX) * s, y: r.top + (y - cam.scrollY) * s };
}, [x, y]);
/** The B1-safe approach into the Starter House from below (m3-trace lines 519–520). */
async function enterDogRoom() {
  await steer(page, 475, 965, () => { const s = window.__tpp.store.getState(); return (Math.abs(s.avatar.x - 475) < 30 && s.avatar.y > 940) || s.scene.kind === 'interior'; }, 40000);
  await steer(page, 475, 895, () => window.__tpp.store.getState().scene.roomId === 'dog-room', 30000);
  await waitScene(page, 'Interior', 900); await drain();
}
async function walkOut() {
  await steer(page, 693, 575, () => window.__tpp.store.getState().scene.kind === 'street', 30000);
  await waitScene(page, 'Street', 900); await drain();
}
const outsideLines = async (from) => (await lines(page, 'pet.outside')).filter(l => l.t >= from);
const nowT = () => page.evaluate(() => window.__tpp.log.lines().at(-1)?.t ?? 0);

async function beatBoot() {
  win = await boot(browser, { save: SEED_TEXT, query: QUERY }); page = win.page;
  await waitScene(page, 'Street', 1200);
  stream = await startStreamRecording(page, join(evidenceRoot, 'stream'), { maxWidth: 1920, maxHeight: 1080, quality: 70 });
  const v = await streetView();
  beat('1 boot from the m5 seed: Street, zero console errors, Dog 1 Heart / Owl 2, drawn = streetPets', v.scene.kind === 'street' && !win.errors.consoleErrors.length && !win.errors.pageErrors.length
    && v.hearts.dog >= 1 && v.hearts.owl >= 1 && eqSet(v.drawn, v.selected) && v.drawn.includes('owl-mate'), 'street; no errors; hearts ≥ 1; drawn = selected', { view: v, errors: win.errors });
}
async function beatRoll() {
  await enterDogRoom();
  const before = await streetView();
  await walkOut();
  const v = await streetView();
  beat('2 roll: walk out of the Dog room → streetVisits +1; Dog inside (just-left); Owl = rollOutside(seed, owl, visits); drawn = streetPets',
    v.streetVisits === before.streetVisits + 1 && v.outside.dog === false && v.outside.owl === v.rolls.owl && eqSet(v.drawn, v.selected) && v.drawn.includes('owl-mate'),
    'visits +1; dog false; owl = roll; drawn = selected', { before: { streetVisits: before.streetVisits, scene: before.scene }, view: v });
}
/** WORK-036-2 attempt 2 (FORK, re-pinned to the as-built sim + view): with seed 1234 the Dog and the mate meet (WORK-036-1
 * 'meeting') the instant All out applies, and the mate's meeting spot sits under the joystick's capture square, which claims
 * any pointer on it (StreetScene.pointerDown). Before a tap, wait (bounded) until the pet is out of 'meeting' and pick a point
 * inside its hit box (PetSprite.hitContains) outside that square; the assertion (a fresh pet.tapped and a bubble above) is kept. */
const tapPoint = (petId, p = page) => p.evaluate(id => {
  const { game, store } = window.__tpp, street = game.scene.getScene('Street'), cam = street.cameras.main;
  const sprite = street.streetPets.pets.get(id)?.sprite;
  if (!sprite) return { phase: null, at: null };
  const phase = store.getState().pets[id].behaviour.phase;
  const tuning = window.__tpp.content.tuning.joystick, half = tuning.baseDiameter / 2 + 12, centre = street.joystick.centre();
  const under = (x, y) => street.joystick.base?.visible !== false && Math.abs(x - cam.scrollX - centre.x) <= half && Math.abs(y - cam.scrollY - centre.y) <= half;
  const size = sprite.bubbleOffset - 8, { x, y } = sprite;
  const candidates = [[x, y - 40], [x + size * 0.4, y - 40], [x - size * 0.4, y - 40], [x, y - size * 0.8], [x + size * 0.4, y - size * 0.8]];
  const at = candidates.find(([cx, cy]) => sprite.hitContains(cx, cy) && !under(cx, cy)) ?? null;
  return { phase, at, xy: [x, y] };
}, petId);
async function tapPetBeat(petId, ms = 20000) {
  const t0 = Date.now(); let pick = await tapPoint(petId);
  while (Date.now() - t0 < ms && (pick.phase === 'meeting' || !pick.at)) { await page.waitForTimeout(150); pick = await tapPoint(petId); }
  const waitedMs = Date.now() - t0;
  const at = await pointOf(...(pick.at ?? [pick.xy?.[0] ?? 0, (pick.xy?.[1] ?? 40) - 40]));
  const from = await nowT();
  await page.mouse.click(at.x, at.y, { delay: 30 });
  const tapped = await page.waitForFunction(([id, t]) => window.__tpp.log.lines().some(l => l.type === 'pet.tapped' && l.petId === id && l.t >= t),
    [petId, from], { timeout: 2500 }).then(() => true, () => false);
  await page.waitForTimeout(250);
  const after = (await streetView()).sprites[petId];
  return { petId, tapped, from, waitedMs, phase: pick.phase, at: pick.at, bubble: after?.bubble ?? null, above: !!after?.bubble && after.bubble.y < after.y };
}
async function beatAllOut() {
  mark('overrideStart');
  await rowButton('Pets outside', OUTSIDE.all);
  const v = await streetView();
  const depthOk = v.sprites && Object.values(v.sprites).every(s => s.depth === s.y && Math.abs(s.y - s.by) <= 4);
  await still(stillsDir, 'street-three-pets-1080', 'row 23 All out: Dog, Owl and the mate on the street');
  const taps = [];
  for (const petId of ['dog', 'owl', 'owl-mate']) { taps.push(await tapPetBeat(petId)); await page.waitForTimeout(400); }
  beat('3 override "All out" (row 23 by label): three sprites, each depth = its base y (= behaviour y); a tap on each → pet.tapped {petId} and that pet\'s bubble above it',
    v.petsOutside === 'all' && eqSet(v.drawn, ['dog', 'owl', 'owl-mate']) && eqSet(v.drawn, v.selected) && depthOk && taps.every(t => t.tapped && t.above),
    'all; 3 drawn; depth = y; 3 taps with bubbles above', { view: v, taps });
}
async function beatMeeting() {
  mark('wanderStart');
  const t0 = Date.now(); let targeted = null, pair = null;
  while (Date.now() - t0 < MEET_MS && !(targeted && pair)) {
    const v = await streetView();
    const ids = Object.keys(v.sprites ?? {});
    targeted ??= ids.find(id => v.sprites[id].target?.wanderPointId === 'street-meet') ? { petId: ids.find(id => v.sprites[id].target?.wanderPointId === 'street-meet'), ms: Date.now() - t0 } : null;
    for (let i = 0; i < ids.length && !pair; i++) for (let j = i + 1; j < ids.length && !pair; j++) {
      const a = v.sprites[ids[i]], b = v.sprites[ids[j]], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d <= PAIR_PX) pair = { pets: [ids[i], ids[j]], distancePx: Math.round(d), ms: Date.now() - t0, at: { [ids[i]]: { x: a.x, y: a.y }, [ids[j]]: { x: b.x, y: b.y } } };
    }
    await page.waitForTimeout(250);
  }
  if (Date.now() - marks.wanderStart < 20000) await page.waitForTimeout(20000 - (Date.now() - marks.wanderStart));
  mark('wanderEnd');
  beat(`4 meeting point: within ${MEET_MS / 1000} s a street pet targets street-meet and one pair comes within ${PAIR_PX} px (logged for WORK-036)`,
    targeted && pair, 'a street-meet target and a pair ≤ 360 px', { targeted, pair });
}
async function beatNeverTwice() {
  const out = await streetView();
  const from = await nowT();
  await enterDogRoom();
  const inside = await streetView();
  await still(stillsDir, 'dog-inside-after-entry-1080', 'the Dog was outside (All out); after entering the Dog room it is inside');
  const flips = (await outsideLines(from)).filter(l => l.petId === 'dog');
  await rowButton('Pets outside', OUTSIDE.roll);
  await walkOut();
  const back = await streetView();
  beat('5 never in two places: Dog drawn outside → enter the Dog room → interior shows the Dog, dog.outside false, pet.outside {dog,false} once; row 23 Roll inside → walk out → the Dog not drawn, outside stays false',
    out.drawn.includes('dog') && inside.interiorPet === 'dog' && inside.outside.dog === false && flips.length === 1 && flips[0].outside === false
    && back.petsOutside === 'roll' && !back.drawn.includes('dog') && back.outside.dog === false && eqSet(back.drawn, back.selected),
    'dog drawn → interior dog, one flip → street without dog', { out: out.drawn, inside: { interiorPet: inside.interiorPet, outside: inside.outside }, flips, back });
}
async function beatAllIn() {
  mark('toggleStart');
  await rowButton('Pets outside', OUTSIDE.all); await page.waitForTimeout(2200);
  const all = await streetView();
  await rowButton('Pets outside', OUTSIDE.none); await page.waitForTimeout(2200);
  const none = await streetView();
  await rowButton('Pets outside', OUTSIDE.roll); await page.waitForTimeout(2200);
  const roll = await streetView();
  mark('toggleEnd');
  await enterDogRoom(); await walkOut();
  const next = await streetView();
  beat('6 override "All in" → only the mate drawn; "Roll" keeps the set until the next arrival, which rolls again (Owl = rollOutside, Dog just left)',
    eqSet(all.drawn, ['dog', 'owl', 'owl-mate']) && eqSet(none.drawn, ['owl-mate']) && eqSet(roll.drawn, ['owl-mate']) && roll.petsOutside === 'roll'
    && next.streetVisits === roll.streetVisits + 1 && next.outside.dog === false && next.outside.owl === next.rolls.owl && eqSet(next.drawn, next.selected),
    'all 3 → none 1 → roll 1 → next arrival rolled', { all: all.drawn, none: none.drawn, roll: roll.drawn, next });
}
async function beatReload() {
  await rowButton('Pets outside', OUTSIDE.all); await page.waitForTimeout(1500);
  const before = await streetView();
  await page.reload(); await waitScene(page, 'Street', 1500);
  const after = await streetView();
  beat('7 reload: streetVisits, session.petsOutside and each outside survive; the drawn set matches',
    after.streetVisits === before.streetVisits && after.petsOutside === before.petsOutside && eqSet(Object.entries(after.outside), Object.entries(before.outside))
    && eqSet(after.drawn, before.drawn) && eqSet(after.drawn, after.selected), 'unchanged across reload', { before, after });
}
async function window823() {
  const saved = await page.evaluate(() => localStorage.getItem('tpp.save'));
  const w = await boot(browser, { height: 823, save: saved, query: QUERY });
  await waitScene(w.page, 'Street', 1500);
  const rec = await startStreamRecording(w.page, join(evidenceRoot, 'stream-823'), { maxWidth: 1920, maxHeight: 823, quality: 70 });
  // Fork (g) (WORK-035-1): two pets on street-meet overlap; wait (≤ 15 s) until every pair is > 80 px apart so the still shows three pets.
  const apart = view => { const list = Object.values(view.sprites ?? {}); return list.every((a, i) => list.slice(i + 1).every(b => Math.hypot(a.x - b.x, a.y - b.y) > 80)); };
  let v = await streetView(w.page);
  for (const t0 = Date.now(); !apart(v) && Date.now() - t0 < 15000; v = await streetView(w.page)) await w.page.waitForTimeout(250);
  const band = await w.page.evaluate(() => { const cam = window.__tpp.game.scene.getScene('Street').cameras.main; return { top: cam.scrollY, bottom: cam.scrollY + cam.height }; });
  const inside = Object.values(v.sprites ?? {}).every(s => s.y <= band.bottom && s.y - 111 >= band.top);
  await still(stillsDir, 'street-three-pets-823', 'All out at 1920×823: every pet inside the visible band', w.page);
  const t0 = Date.now(); await w.page.waitForTimeout(20000);
  const frames = await rec.stop();
  const loop = encode(loopsDir, 'street-pets-wander-823', frames.filter(f => f.t >= t0 - 200), { target: 'three street pets wandering at 1920×823', viewport: { width: 1920, height: 823 } }, { maxMs: 20000, crf: 26 });
  beat('823: three pets drawn, every pet inside the visible band; 20 s wander loop', eqSet(v.drawn, ['dog', 'owl', 'owl-mate']) && inside && !!loop.outputs,
    '3 drawn, inside the band, loop encoded', { drawn: v.drawn, band, apart: apart(v), sprites: v.sprites, loop: loop.outputs ?? loop.gap, errors: w.errors });
  rmSync(join(evidenceRoot, 'stream-823'), { recursive: true, force: true });
  await w.context.close();
}

browser = await launch();
const report = { work: WORK, milestone: MILESTONE, sha, base, seed: SEED, beats, captured_at: null };
try {
  await beatBoot();
  await beatRoll();
  await beatAllOut();
  await beatMeeting();
  await beatNeverTwice();
  await beatAllIn();
  await beatReload();
  await window823();
  // --- WORK-037-3 / WORK-036-2 beats ---
  // Append beats here (or import from tests/e2e/lib/m5-outfits.mjs); `page`, `beat`, `still`, `mark`, `streetView`, `rowButton` are in scope.
  await greetingBeats({ page, beat, still, mark, rowButton, drain }); // WORK-036-2 g1–g8
} catch (error) {
  beat('trace aborted', false, 'no exception', String(error?.stack ?? error).slice(0, 800));
}
const frames = stream ? await stream.stop() : [];
const between = (a, b) => frames.filter(f => f.t >= a && f.t <= b);
report.loops = [];
for (const [name, a, b, target, maxMs] of [
  ['street-pets-wander-1080', marks.wanderStart, marks.wanderEnd, 'three street pets wandering incl. a walk to street-meet (1920×1080)', 22000],
  ['pets-outside-override-1080', marks.toggleStart - 300, marks.toggleEnd + 300, 'row 23 All out → All in → Roll (1920×1080)', 12000],
  ...greetingLoops(marks), // WORK-036-2
]) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) { report.loops.push({ name, gap: 'beat not reached (no marks)' }); continue; }
  const sc = encode(loopsDir, name, between(a, b), { target, viewport: { width: 1920, height: 1080 }, seededSave: 'm5-seed.real.json' }, { maxMs, crf: 26 });
  report.loops.push({ name, outputs: sc.outputs ?? null, gap: sc.gap ?? null, durationMs: sc.durationMs });
}
rmSync(join(evidenceRoot, 'stream'), { recursive: true, force: true });
const all = page ? await lines(page).catch(() => []) : [];
report.errors = win ? errorsSummary(win.errors, all) : null;
const clean = !!report.errors && !report.errors.consoleErrors.length && !report.errors.pageErrors.length;
beat('zero console and page errors in the trace window', clean, 'none', report.errors);
report.captured_at = new Date().toISOString();
report.elapsedMs = Date.now() - traceStart;
report.marks = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, new Date(v).toISOString()]));
await browser.close();
// int-MILESTONE-011 union (6): the WORK-037-3 outfit beats (tests/e2e/m5-outfit.mjs) run after the greeting beats, in their own
// session seeded from ack-phase-4 (the outfits need an incomplete Pet House), so one m5 run covers roll, override, meeting point,
// greeting and outfits. One browser at a time: this trace's browser is closed first. Report: <TPP_EVIDENCE>/m5/trace-report.json.
const outfitRun = spawnSync(process.execPath, [join(GAME_DIR, 'tests/e2e/m5-outfit.mjs')], { cwd: GAME_DIR, env: process.env, stdio: 'inherit' });
beat('WORK-037-3 outfit beats (m5-outfit.mjs) pass', outfitRun.status === 0, 'exit 0', { status: outfitRun.status, report: join(evidenceRoot, 'm5', 'trace-report.json') });
report.ok = beats.every(b => b.ok);
writeJson(join(evidenceRoot, 'trace-report.json'), report);
console.log(JSON.stringify({ ok: report.ok, elapsedMs: report.elapsedMs, failed: beats.filter(b => !b.ok).map(b => b.beat), loops: report.loops.map(l => [l.name, !!l.outputs]) }, null, 1));
process.exit(report.ok ? 0 : 1);

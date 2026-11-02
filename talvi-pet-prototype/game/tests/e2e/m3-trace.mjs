// WORK-025-3 M3 trace (MILESTONE-007 outcome, in-run half) on the Playwright library (chromium-1243, no install).
//   TPP_BASE=http://127.0.0.1:5205 TPP_EVIDENCE=<lane evidence dir> TPP_WORK=WORK-025-3 TPP_MILESTONE=MILESTONE-007 node tests/e2e/m3-trace.mjs
// Seed: <EV>/session-opening.real.json (npm run fixture -- --scenario session-opening). Strict boot (no ?lenient=1), 1920×1080, real inputs
// (keyboard, canvas and panel taps, the debug rows by label); window.__tpp only to read. One continuous CDP screencast cut into loops by marks.
// Beat order (the reset clears the log, so every arm the reader must see in the final export runs after it): seed + five SFX + first tap →
// tester label → TEST-008 reset "Start frozen" + one real 120 s wait → Playtest restored → TEST-003 (street) → TEST-004 (street "?") →
// walk into the Starter House → TEST-001 → want-panel "2 charms" (WORK-033-2) → TEST-005/006 → scarcity block (place lamp → "none left" → inert
// click → remove → "×1") → strip reaction (remove the Heart bed → 😢, bed back, row 19 still) (WORK-033-2) → TEST-007 → garden site
// (WORK-034-3: row 20 unlock → walk out → street Decorate → 2 outdoor placements → Done → the mate's site arrival → input unfreezes → wander → 1 remove) → mute → exports
// (Download, Copy, Share hidden / stub) → R-9 → errors → storage + reload → quota (own context) → tier 1 save reset (own context, WORK-033-2). Writes trace-report.json, trace-log.jsonl, storage-reads.json, rows/*, exports/*, loops/*, captures/*.
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { GAME_DIR, base, evidenceRoot, sha, launch, boot, waitScene, lines, getState, count, first, strip, eq, until, waitLine, tapSlot, steer, joystickHold,
  domRead, shot, encode, startStreamRecording, exportLog, writeJson, setDebug, WORK, MILESTONE } from './lib/harness.mjs';

const loopsDir = join(evidenceRoot, 'loops'), capturesDir = join(evidenceRoot, 'captures'), rowsDir = join(evidenceRoot, 'rows'), exportsDir = join(evidenceRoot, 'exports');
const SEED = join(evidenceRoot, 'session-opening.real.json');
if (!existsSync(SEED)) throw new Error(`seed save missing: ${SEED} (npm run fixture -- --scenario session-opening --out <EV>/session-opening.real.json)`);
const SEED_TEXT = readFileSync(SEED, 'utf8');
const QUERY = '';
const SFX = ['sfx/place', 'sfx/heart', 'sfx/complete', 'sfx/reaction', 'sfx/phase-pop'];
const FROZEN_WAIT_MS = Number(process.env.TPP_FROZEN_WAIT_MS ?? 120000);
const beats = [], marks = {}, traceStart = Date.now();
const mark = name => { marks[name] = Date.now(); return marks[name]; };
let page, browser, stream, all = [];
const refresh = async () => { all = await lines(page); return all; };
const rows = {};
function beat(name, ok, expected, found, extra = {}) {
  beats.push({ beat: name, expected, found, ok: Boolean(ok), t: extra.line?.t ?? null, wall: new Date().toISOString(), elapsedMs: Date.now() - traceStart, ...extra, line: undefined });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  return ok;
}
const row = (id, value) => { rows[id] = { id, work: WORK, milestone: MILESTONE, sha, env: 'ENV-MAC-CH (chromium-1243 headless, 1920×1080)', captured_at: new Date().toISOString(), ...value }; };
async function still(point, note, extra = {}) {
  return shot(page, browser, capturesDir, point, { target: `${base}/${QUERY}`, seededSave: 'session-opening.real.json, trace session', note, dom: await domRead(page), ...extra });
}
const linesAfter = (type, t, m = {}) => all.filter(l => l.type === type && l.t >= t && Object.entries(m).every(([k, v]) => JSON.stringify(l[k]) === JSON.stringify(v)));
const lastT = () => all.at(-1)?.t ?? 0;
/** WORK-034-3 (review WORK-034-2-1 A1): a log-index cursor. Several records can share one `t` (one dispatch, one frame), so
 * `linesAfter(type, lastT())` also counts the records of the action that set `lastT`; `linesSince` counts only records appended
 * after the cursor was taken. */
const cursor = () => all.length;
const linesSince = (type, from, m = {}) => all.slice(from).filter(l => l.type === type && Object.entries(m).every(([k, v]) => JSON.stringify(l[k]) === JSON.stringify(v)));

async function tapBox(limit = 12) {
  let taps = 0;
  while (taps < limit && (await getState(page)).dialogue.current) {
    const box = page.locator('[data-panel="dialogue"]');
    if (await box.isVisible()) { await box.click({ position: { x: 300, y: 60 } }); taps++; }
    await page.waitForTimeout(380);
  }
  return taps;
}
async function drainAll(quietMs = 1500, ms = 25000) {
  let taps = 0, quietSince = Date.now(); const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await getState(page)).dialogue.current) { taps += await tapBox(); quietSince = Date.now(); }
    else if (Date.now() - quietSince >= quietMs) break;
    await page.waitForTimeout(150);
  }
  return taps;
}
async function dismissToast() {
  const t = page.locator('[data-panel="toast"]');
  if (await t.count() && await t.isVisible()) { await t.click({ force: true }).catch(() => {}); await page.waitForTimeout(300); }
}
const toggleEnabled = () => until(page, () => !document.querySelector('.tpp-design-toggle').disabled, null, 12000);
async function designOn() { await toggleEnabled(); if ((await getState(page)).mode !== 'design') { await page.click('.tpp-design-toggle'); await page.waitForTimeout(450); } }
async function designOff() { await toggleEnabled(); if ((await getState(page)).mode === 'design') { await page.click('.tpp-design-toggle'); await page.waitForTimeout(450); } }
async function place(slotId, typeId, p = page) {
  await designOn();
  await tapSlot(p, slotId);
  await until(p, () => !document.querySelector('.tpp-chooser').hidden, null, 3000);
  await p.click(`.tpp-charm-card[data-type-id="${typeId}"]`);
  await p.waitForTimeout(300);
}
/** Debug row helpers: rows by their <label> text, buttons by index (template order), real clicks. */
const debugRow = (label, p = page) => p.locator('.tpp-debug-row').filter({ has: p.locator('label', { hasText: new RegExp(`^${label}$`) }) }).first();
async function rowButton(label, index, p = page) { await setDebug(p, true); await debugRow(label, p).locator('button:not([role=switch])').nth(index).click(); await p.waitForTimeout(250); }
async function rowSwitch(label, p = page) { await setDebug(p, true); await debugRow(label, p).locator('button[role=switch]').first().click(); await p.waitForTimeout(250); }
async function rowInterval(ms) { await setDebug(page, true); const r = debugRow('Event interval'); await r.locator('input').first().fill(String(ms)); await r.locator('button', { hasText: 'Apply' }).first().click(); await page.waitForTimeout(250); }
const applied = (type, extraMatch = () => true, afterT = -Infinity) => all.find(l => l.type === 'debug.applied' && l.t >= afterT && l.action?.type === type && extraMatch(l.action)) ?? null;

// ---- seed, five SFX, first tap ---------------------------------------------------------------------------------------------------
async function seedBoot() {
  await waitScene(page, 'Interior', 1200);
  mark('seed');
  const s = await getState(page);
  const audio = await page.evaluate(ids => ({ exists: ids.map(id => [id, window.__tpp.game.cache.audio.exists(id)]), loader: window.__tpp.game.scene.getScene('Boot').loaderTotals ?? null, lockedBeforeTap: window.__tpp.game.sound.locked ?? null }), SFX);
  await refresh();
  const ss = all.filter(l => l.type === 'session.started'), header = ss[0];
  const fields = ['build', 'schemaVersion', 'seed', 'cadence', 'feedPresentation', 'testerLabel', 'userAgent'];
  beat('seed: session-opening — scene dog-room, Dog introduced, Hearts 0, Pet House phase 0, session.started ×1 with every header field (strict boot)',
    s.scene.roomId === 'dog-room' && s.pets.dog.hearts === 0 && s.projects['pet-house'].acknowledgedPhase === 0 && ss.length === 1 && fields.every(f => f in header),
    `scene dog-room; hearts 0; acknowledgedPhase 0; session.started ×1 with ${fields.join(', ')}; query ''`,
    { scene: s.scene, hearts: s.pets.dog.hearts, project: s.projects['pet-house'], introduced: s.pets.dog.introduced ?? null, sessionStarted: header, query: QUERY }, { line: header });
  // first tap: a real click on an empty part of the canvas (the floor centre), then sound.locked again (DEC-034 first-tap unlock)
  const r = await page.evaluate(() => window.__tpp.game.canvas.getBoundingClientRect());
  await page.mouse.click(r.left + r.width * 0.5, r.top + r.height * 0.12, { delay: 40 });
  await page.waitForTimeout(500);
  const lockedAfter = await page.evaluate(() => window.__tpp.game.sound.locked ?? null);
  await refresh();
  const tap = first(all, 'input.tap'), locked = all.filter(l => l.type === 'audio.locked');
  const pres = { sfx: Object.fromEntries(audio.exists), loader: audio.loader, soundLockedBeforeTap: audio.lockedBeforeTap, soundLockedAfterTap: lockedAfter,
    audioLockedLines: locked.map(strip), firstInputTap: strip(tap) };
  beat('seed: five SFX cached (sfx/place, heart, complete, reaction, phase-pop), Boot totalFailed 0; audio.locked ≤ 1 and before the first input.tap; sound.locked false after it (VERIFY-PRES-011 ENV-MAC-CH)',
    audio.exists.every(([, v]) => v) && audio.loader?.totalFailed === 0 && locked.length <= 1 && (!locked.length || (tap && locked[0].t <= tap.t)) && tap && lockedAfter === false,
    'cache.audio.exists ×5 true; loaderTotals.totalFailed 0; audio.locked ≤ 1, t ≤ first input.tap; game.sound.locked false', pres, { line: tap });
  row('pres-011', { verify: 'VERIFY-PRES-011', ...pres });
}

// ---- tester label ---------------------------------------------------------------------------------------------------------------
async function testerLabel() {
  await setDebug(page, true);
  await page.waitForTimeout(300);
  await still('debug-panel-arms-1080', 'the debug panel open over the Dog room: every arm row (2, 5, 8, 9, 10, 10b, 11, 12, 13)');
  const input = debugRow('Tester label').locator('input').first();
  await input.fill('m3-trace'); await input.press('Enter'); await page.waitForTimeout(300);
  await refresh();
  const a = applied('debugSetTesterLabel', x => x.text === 'm3-trace');
  beat('tester label: row 11 "m3-trace" → debug.applied {debugSetTesterLabel, text m3-trace}', a && (await getState(page)).session.testerLabel === 'm3-trace',
    "debug.applied { action: { type: 'debugSetTesterLabel', text: 'm3-trace' } }; session.testerLabel m3-trace", { applied: a && { ...strip(a), action: a.action } }, { line: a });
}

// ---- TEST-008: reset "Start frozen" and one real 120 s wait --------------------------------------------------------------------
async function test008() {
  mark('resetStart');
  await setDebug(page, true);
  const slot = debugRow('Reset save');
  await slot.locator('[data-action=reset]').click(); await page.waitForTimeout(300);
  await slot.locator('[data-field=frozen]').check(); await page.waitForTimeout(150);
  await slot.locator('[data-action=reset-yes]').click();
  await waitLine(page, 'session.started', {}, 8000);
  await page.waitForTimeout(1500);
  await waitScene(page, 'Street', 600);
  mark('resetDone');
  await refresh();
  const ss = all.filter(l => l.type === 'session.started'), header = ss.at(-1);
  const reset = first(all, 'state.reset');
  const s0 = await getState(page);
  beat('TEST-008: row 12 Reset → Yes with "Start frozen" → state.reset, a fresh session.started {cadence null, testerLabel m3-trace} (the log restarts with the header)',
    ss.length === 1 && header.cadence === null && header.testerLabel === 'm3-trace' && s0.session.eventIntervalMs === null,
    "the reset log holds session.started ×1 with cadence null and testerLabel 'm3-trace'; session.eventIntervalMs null",
    { header, stateReset: strip(reset), resetLogged: reset ? 'state.reset in the log' : 'state.reset precedes log.reset(header) (mec-010 §5.3): the line is cleared with the ring; read from the store reset instead', scene: s0.scene, eventIntervalMs: s0.session.eventIntervalMs }, { line: header });
  // the real wait: stills and state reads only
  const before = s0.feed;
  await still('frozen-120s-start', 'TEST-008: the fresh street right after Reset with "Start frozen"; the 120 s wall-clock wait starts');
  const wallStart = Date.now();
  mark('frozenWaitStart');
  const samples = [];
  while (Date.now() - wallStart < FROZEN_WAIT_MS) {
    await page.waitForTimeout(Math.min(15000, FROZEN_WAIT_MS - (Date.now() - wallStart)));
    const st = await getState(page); samples.push({ atMs: Date.now() - wallStart, feed: st.feed, cents: st.projects['pet-house'].currentCents });
  }
  const waitedMs = Date.now() - wallStart;
  mark('frozenWaitEnd');
  await still('frozen-120s-end', `TEST-008: the street after ${Math.round(waitedMs / 1000)} s frozen — no donation arrived`);
  await refresh();
  const after = (await getState(page)).feed;
  const roundups = linesAfter('roundup.fired', 0);
  const f = { waitedMs, roundupFired: roundups.length, feedBefore: before, feedAfter: after, samples, wait: 'page.waitForTimeout in ≤ 15 s slices (wall clock), no fast-forward' };
  beat('TEST-008: one real 120 s wait → zero roundup.fired, feed.sinceLastEventMs and eventCount unchanged (VERIFY-MEC-010-013)',
    waitedMs >= 120000 && roundups.length === 0 && before.sinceLastEventMs === after.sinceLastEventMs && before.eventCount === after.eventCount, '≥ 120000 ms waited; roundup.fired 0; feed unchanged', f);
  row('mec-010-013', { verify: 'VERIFY-MEC-010-013', header, ...f, stills: ['captures/frozen-120s-start-NNN.png', 'captures/frozen-120s-end-NNN.png'] });
  // restore the playtest cadence (row 2 Playtest)
  const t = lastT();
  await rowButton('Event interval', 0);
  await refresh();
  const a = applied('debugSetEventInterval', x => x.ms === 20000, t);
  beat('TEST-008 end: row 2 Playtest → debug.applied {debugSetEventInterval 20000}', a && (await getState(page)).session.eventIntervalMs === 20000, 'debug.applied {debugSetEventInterval, ms 20000}', { applied: a && a.action }, { line: a });
  await setDebug(page, false);
  await drainAll(1200);
}

// ---- TEST-003 on the street: trickle + custom 2000 → round-up with no toast, the bar glides ------------------------------------
async function test003() {
  mark('arms');
  const t = lastT();
  await rowButton('Feed presentation', 1);
  await rowInterval(2000);
  await setDebug(page, false);
  await refresh();
  const trickle = applied('debugSetFeedPresentation', x => x.mode === 'trickle', t), custom = applied('debugSetEventInterval', x => x.ms === 2000, t);
  const got = await waitLine(page, 'roundup.fired', {}, 8000);
  const glide = [];
  for (let i = 0; i < 8; i++) { const d = await domRead(page); const st = await getState(page); glide.push({ barCents: Number(d.hudStreet?.barCents ?? NaN), currentCents: st.projects['pet-house'].currentCents, toastVisible: d.toast?.visible ?? false }); await page.waitForTimeout(150); }
  await still('trickle-bar-glide-1080', 'TEST-003 trickle: a round-up fired, no toast, the street bar glides');
  await refresh();
  const rf = linesAfter('roundup.fired', t);
  const moving = glide.some((g, i) => i && g.barCents !== glide[0].barCents) || glide.at(-1).barCents === glide.at(-1).currentCents;
  const f = { trickle: trickle?.action ?? null, custom: custom?.action ?? null, roundupFired: rf.map(strip).slice(0, 3), glide, sessionFeedPresentation: (await getState(page)).session.feedPresentation };
  beat('TEST-003: row 10b Trickle + row 2 custom 2000 → debug.applied ×2; roundup.fired; no toast shown; the street bar\'s barCents glides toward currentCents (VERIFY-MEC-010-015 playable half)',
    trickle && custom && got && rf.length >= 1 && glide.every(g => !g.toastVisible) && moving, 'debug.applied {debugSetFeedPresentation trickle}, {debugSetEventInterval 2000}; roundup.fired ≥ 1; toast hidden; barCents moving toward currentCents', f, { line: rf[0] });
  row('mec-010-015', { verify: 'VERIFY-MEC-010-015 (browser, playable half)', ...f });
  const t2 = lastT();
  await rowButton('Event interval', 0);
  await rowButton('Feed presentation', 0);
  await setDebug(page, false);
  await refresh();
  const back = applied('debugSetEventInterval', x => x.ms === 20000, t2) && applied('debugSetFeedPresentation', x => x.mode === 'events', t2);
  beat('TEST-003 end: back to Playtest (20000) and Events', back && (await getState(page)).session.feedPresentation === 'events', 'debug.applied {20000}, {events}', { session: (await getState(page)).session });
  mark('trickleEnd');
  await page.waitForTimeout(400); await dismissToast();
}

// ---- TEST-004 on the street: jump a phase, the HUD "?" opens the reveal panel ----------------------------------------------------
async function test004() {
  mark('revealStart');
  const t = lastT();
  await rowButton('Jump to next phase', 0);
  await setDebug(page, false);
  await waitLine(page, 'phase.reached', {}, 5000);
  await drainAll(1200);
  await dismissToast();
  await until(page, () => { const l = document.querySelector('.tpp-hudStreet .tpp-reveal-link'); return l && !l.disabled && l.offsetParent !== null; }, null, 6000);
  await page.locator('.tpp-hudStreet .tpp-reveal-link').click();
  await until(page, () => !document.querySelector('.tpp-revealPanel').hidden, null, 3000);
  await page.waitForTimeout(500);
  await still('reveal-panel-test-004-1080', 'TEST-004: the reveal panel opened from the street HUD "?" after one phase');
  await page.locator('.tpp-revealPanel .tpp-close').click();
  await page.waitForTimeout(400);
  mark('revealEnd');
  await refresh();
  const pr = linesAfter('phase.reached', t), open = linesAfter('ui.revealPanel', t, { open: true }), close = linesAfter('ui.revealPanel', t, { open: false });
  beat('TEST-004: row 5 Jump to next phase → phase.reached; HUD "?" → ui.revealPanel {open true} → close {open false}', pr.length && open.length && close.length && close[0].t >= open[0].t,
    'phase.reached; ui.revealPanel {open: true} then {open: false}', { phaseReached: pr.map(strip), open: strip(open[0]), close: strip(close[0]) }, { line: open[0] });
}

// ---- the fixed opening again: walk into the Starter House ----------------------------------------------------------------------
async function enterDogRoom() {
  mark('walkIn');
  await drainAll(800);
  // WORK-032-1: approach starter-front (425..525 x 880..930) from below, then walk up into it.
  await steer(page, 475, 965, () => { const s = window.__tpp.store.getState(); return (Math.abs(s.avatar.x - 475) < 30 && s.avatar.y > 940) || s.scene.kind === 'interior'; }, 40000);
  await steer(page, 475, 895, () => window.__tpp.store.getState().scene.roomId === 'dog-room', 30000);
  await waitScene(page, 'Interior', 800);
  await drainAll(1500);
  mark('inside');
  const s = await getState(page);
  beat('walk into the Starter House (door 425..525 x 880..930, from below) → scene dog-room; intro drained', s.scene.roomId === 'dog-room' && !s.dialogue.current, 'scene dog-room; no dialogue open', { scene: s.scene, avatar: s.avatar });
}

// ---- TEST-001 inside: row 8 off and on --------------------------------------------------------------------------------------
async function test001() {
  mark('starsStart');
  const t = lastT();
  await rowSwitch('Stars display');
  await setDebug(page, false); await page.waitForTimeout(300);
  const hidden = await page.evaluate(() => { const s = document.querySelector('.tpp-hudInterior .tpp-stars'); return !s || s.hidden || getComputedStyle(s).display === 'none' || s.offsetParent === null; });
  await still('stars-hidden-1080', 'TEST-001 arm: the Stars bar hidden (row 8 off)');
  await rowSwitch('Stars display');
  await setDebug(page, false); await page.waitForTimeout(300);
  const shown = await page.evaluate(() => { const s = document.querySelector('.tpp-hudInterior .tpp-stars'); return !!s && !s.hidden && s.offsetParent !== null; });
  mark('starsEnd');
  await refresh();
  const off = linesAfter('stars.visibilityChanged', t, { visible: false }), on = linesAfter('stars.visibilityChanged', t, { visible: true });
  beat('TEST-001: row 8 off → stars.visibilityChanged {visible false}, Stars bar hidden in the DOM; on → {visible true}, shown', off.length && on.length && hidden && shown,
    'stars.visibilityChanged {false} then {true}; .tpp-stars hidden then visible', { off: strip(off[0]), on: strip(on[0]), domHidden: hidden, domShown: shown }, { line: off[0] });
}

// ---- TEST-007: the desktop joystick with the mouse ----------------------------------------------------------------------------
async function test007() {
  mark('joyStart');
  const t = lastT();
  const before = (await getState(page)).avatar;
  const r = await joystickHold(page, 60, 0, x0 => window.__tpp.store.getState().avatar.x > x0 + 40, before.x, 1500);
  await page.waitForTimeout(400);
  mark('joyEnd');
  await refresh();
  const st = linesAfter('input.joystick', t, { phase: 'start' }), en = linesAfter('input.joystick', t, { phase: 'end' });
  beat('TEST-007: a joystick drag with the mouse → input.joystick {phase start} / {phase end, ms}; input.tap and input.drag present in the log (touch variant: WORK-025-2 phone-stills record)',
    st.length && en.length && typeof en[0].ms === 'number' && count(all, 'input.tap') >= 1 && count(all, 'input.drag') >= 0,
    'input.joystick start + end {ms}; input.tap ≥ 1; input.drag counted', { start: strip(st[0]), end: strip(en[0]), joystick: r, avatarBefore: before, avatarAfter: (await getState(page)).avatar, inputTap: count(all, 'input.tap'), inputDrag: count(all, 'input.drag'),
      touchVariant: 'runs/RUN-003/evidence/WORK-025-2 (phone-stills touchDrag record)' }, { line: st[0] });
}

// ---- TEST-005 / TEST-006: the Dog bed → reaction, want 1, Heart 1 ----------------------------------------------------------------
async function test005006() {
  mark('bedStart');
  const t = lastT();
  await place('large-1', 'dog-bed');
  await waitLine(page, 'heart.earned', {}, 10000);
  await page.waitForTimeout(600);
  await still('bed-heart-1080', 'TEST-005/006: the Dog bed placed at large-1, want 1 fulfilled, Heart 1');
  await drainAll(1500);
  await designOff();
  mark('bedEnd');
  await refresh();
  const react = linesAfter('pet.reacted', t), wf = linesAfter('want.fulfilled', t), h = linesAfter('heart.earned', t), unl = linesAfter('items.granted', t);
  const after = await getState(page), dogBedCopies = after.inventory.counts['dog-bed'];
  beat('TEST-005/006: place the Dog bed (large-1) → pet.reacted; want 1 fulfilled → heart.earned (Hearts 1), items.granted; vignette drained',
    react.length && wf.length && h[0]?.hearts === 1 && unl.length && !after.dialogue.current && dogBedCopies === 0, 'pet.reacted; want.fulfilled; heart.earned {hearts 1}; items.granted; inventory.counts[dog-bed] 0',
    { reacted: react.map(strip).slice(0, 3), fulfilled: strip(wf[0]), heart: strip(h[0]), unlocked: unl.map(strip), 'inventory.counts[dog-bed]': dogBedCopies }, { line: h[0] });
}

// ---- WORK-033-2: the Dog's first want reads "Reward: 2 charms: Rug and Cushion" (before the bed; the TEST-005/006 beat is unmoved) --
async function wantPanelLabel() {
  await until(page, () => { const p = document.querySelector('.tpp-wantPanel'); return p && !p.hidden && p.offsetParent !== null; }, null, 5000);
  const reward = await page.evaluate(() => document.querySelector('.tpp-wantPanel .tpp-want-reward')?.textContent ?? null);
  await still('want-panel-2-charms-1080', 'WORK-033-2 (DEC-043): the Dog\'s first want panel reads "Reward: 2 charms: Rug and Cushion"', { rewardLine: reward });
  beat('"n charms": the Dog\'s first want panel reward line reads "Reward: 2 charms: Rug and Cushion" (VERIFY-MEC-009-026 browser half)',
    reward === 'Reward: 2 charms: Rug and Cushion', 'Reward: 2 charms: Rug and Cushion', { rewardLine: reward });
}

// ---- WORK-033-2 scarcity block (DEC-043): place → "none left" → inert click → remove → "×1" again --------------------------------
const cardsRead = () => page.evaluate(() => [...document.querySelectorAll('.tpp-chooser .tpp-charm-card')].map(c => ({ typeId: c.dataset.typeId,
  label: c.querySelector('.tpp-charm-copies')?.textContent ?? null, ariaDisabled: c.getAttribute('aria-disabled'), action: c.dataset.action ?? null })));
const emptySmall = (s, except = []) => ['floor-1', 'floor-2', 'floor-3', 'floor-4', 'floor-5', 'floor-6', 'floor-7']
  .filter(id => !s.rooms['dog-room'].placements[id] && !except.includes(id));
async function openChooser(slotId) { await tapSlot(page, slotId); return until(page, () => !document.querySelector('.tpp-chooser').hidden, null, 3000); }
async function closeChooser() { await page.locator('.tpp-chooser .tpp-dismiss-backdrop').click({ position: { x: 40, y: 40 } }); await page.waitForTimeout(300); }
async function removeAt(slotId) {
  await tapSlot(page, slotId);
  await until(page, () => { const s = document.querySelector('.tpp-replaceRemove'); return s && s.offsetParent !== null; }, null, 3000);
  await page.locator('.tpp-replaceRemove [data-action="remove"]').click();
  await page.waitForTimeout(400);
}
async function scarcity() {
  await designOn();
  mark('scarcityStart');
  const t = lastT();
  const [lampSlot, otherSlot] = emptySmall(await getState(page));
  await place(lampSlot, 'lamp');
  const afterPlace = (await getState(page)).inventory.counts;
  beat('scarcity: Decorate → place lamp at an empty small slot → charm.placed; inventory.counts.lamp 0', afterPlace.lamp === 0 && (await refresh(), linesAfter('charm.placed', t, { typeId: 'lamp' }).length === 1),
    'charm.placed {lamp}; counts.lamp 0', { slotId: lampSlot, counts: afterPlace });
  await openChooser(otherSlot);
  await page.waitForTimeout(250);
  const cards = await cardsRead(), counts = (await getState(page)).inventory.counts;
  await still('chooser-none-left-1080', 'WORK-033-2: the chooser after the only lamp is placed — lamp greyed "none left" at its grant position, the others "×n"', { cards });
  const lamp = cards.find(c => c.typeId === 'lamp');
  const others = cards.filter(c => c.typeId !== 'lamp');
  const othersOk = others.length > 0 && others.every(c => (counts[c.typeId] > 0 ? c.label === `×${counts[c.typeId]}` && c.action === 'place' : c.label === 'none left'));
  beat('scarcity: another empty small slot → the chooser lists lamp greyed "none left" (aria-disabled, no place action) and every other card "×n" = copies in hand',
    lamp && lamp.label === 'none left' && lamp.ariaDisabled === 'true' && lamp.action === null && othersOk, 'lamp {none left, aria-disabled true}; others ×n', { slotId: otherSlot, cards, counts });
  await refresh();
  const tc = cursor();
  // a real pointer click; force skips Playwright's actionability check, which treats aria-disabled as "not enabled"
  await page.locator('.tpp-chooser .tpp-charm-card[data-type-id="lamp"]').click({ force: true });
  await page.waitForTimeout(500);
  await refresh();
  const inert = linesSince('charm.placed', tc).length === 0 && linesSince('action.rejected', tc).length === 0 && !(await page.evaluate(() => document.querySelector('.tpp-chooser').hidden));
  beat('scarcity: clicking the greyed lamp card → no charm.placed, no action.rejected; the chooser stays open', inert, 'no charm.placed; no action.rejected', { after: all.slice(tc).map(strip) });
  await closeChooser();
  await removeAt(lampSlot);
  await openChooser(otherSlot);
  await page.waitForTimeout(250);
  const restored = await cardsRead(), countsBack = (await getState(page)).inventory.counts;
  mark('scarcityEnd');
  const lampBack = restored.find(c => c.typeId === 'lamp');
  beat('scarcity: remove the lamp → charm.removed; counts.lamp 1; its card shows "×1" again at the same position (place → remove → count restored)',
    countsBack.lamp === 1 && lampBack?.label === '×1' && lampBack.action === 'place' && restored.findIndex(c => c.typeId === 'lamp') === cards.findIndex(c => c.typeId === 'lamp'),
    'counts.lamp 1; lamp card ×1, placeable, same index', { cards: restored, counts: countsBack });
  await closeChooser();
  row('mec-004-015', { verify: 'VERIFY-MEC-004-009 / 015 / 016 (browser half)', placedAt: lampSlot, chooserAt: otherSlot, noneLeftCards: cards, restoredCards: restored });
}

// ---- WORK-033-2 strip reaction (DEC-043 / OQ-26): remove the Heart bed → charm.stripped → Done → 😢 + a line, once ---------------
async function stripReaction() {
  await designOn();
  mark('stripStart');
  const t = lastT();
  await removeAt('large-1');
  await refresh();
  const removed = linesAfter('charm.removed', t, { slotId: 'large-1' }), stripped = linesAfter('charm.stripped', t, { typeId: 'dog-bed' });
  const kinds = all.filter(l => l.t >= t).map(l => l.type);
  beat('strip: remove the Dog bed (it earned Heart 1) → charm.removed then charm.stripped {dog-bed}; strippedPending [dog-bed]',
    removed.length === 1 && stripped.length === 1 && kinds.indexOf('charm.stripped') > kinds.indexOf('charm.removed'),
    'charm.removed {large-1} then charm.stripped {roomId dog-room, slotId large-1, typeId dog-bed, petId dog}', { removed: strip(removed[0]), stripped: strip(stripped[0]), pending: (await getState(page)).pets.dog.strippedPending });
  await designOff();
  const td = Date.now();
  const got = await waitLine(page, 'pet.reacted', { reaction: 'stripped' }, 15000);
  const bubble = await page.evaluate(() => window.__tpp.game.scene.getScene('Interior').bubble?.current() ?? null);
  await still('stripped-reaction-1080', 'WORK-033-2: the Dog looks for its bed — one 😢 and a stripped line', { bubble });
  await page.waitForTimeout(2500);
  mark('stripEnd');
  await refresh();
  const st = await getState(page), reacted = linesAfter('pet.reacted', t, { reaction: 'stripped' });
  const ok = got && reacted.length === 1 && reacted[0].typeId === 'dog-bed' && typeof reacted[0].line === 'string' && reacted[0].line.length > 0
    && bubble?.text === '😢' && bubble?.class === 'stripped' && st.pets.dog.strippedPending.length === 0 && st.pets.dog.hearts === 1;
  beat('strip: Done → within 15 s pet.reacted {dog, stripped, typeId dog-bed, line non-null} once; the 😢 bubble visible; strippedPending empty; Hearts still 1 (VERIFY-MEC-007-019/020 browser half)',
    ok, 'pet.reacted {stripped} ×1 with a line; bubble 😢 class stripped; strippedPending []; hearts 1',
    { reacted: reacted.map(strip), bubble, waitedMs: Date.now() - td, strippedPending: st.pets.dog.strippedPending, hearts: st.pets.dog.hearts }, { line: reacted[0] });
  row('mec-007-019', { verify: 'VERIFY-MEC-007-019 / 020 (browser half)', reacted: reacted.map(strip), bubble, hearts: st.pets.dog.hearts });
  const tb = lastT();
  await place('large-1', 'dog-bed');
  await drainAll(1200);
  await designOff();
  await refresh();
  const back = (await getState(page)).rooms['dog-room'].placements['large-1'] === 'dog-bed';
  beat('strip: put the bed back → charm.placed {large-1 dog-bed}; no further stripped reaction', back && linesAfter('charm.placed', tb, { typeId: 'dog-bed' }).length === 1, 'large-1 holds dog-bed', { placements: (await getState(page)).rooms['dog-room'].placements });
  // the TEST-002 arm's row, shown (not used: the trace keeps the default scarcity)
  await setDebug(page, true);
  await debugRow('Grant copies').scrollIntoViewIfNeeded();
  const grantRow = await debugRow('Grant copies').evaluate(r => ({ options: r.querySelectorAll('select option').length, count: r.querySelector('input').value, button: r.querySelector('button').textContent }));
  await still('debug-grant-copies-1080', 'WORK-033-2: debug row 19 "Grant copies" (the TEST-002 arm)', { grantRow });
  await setDebug(page, false);
  beat('debug row 19 "Grant copies" present after row 18 with a type select, a count input (default 1) and Grant', grantRow.options > 0 && grantRow.count === '1' && grantRow.button === 'Grant', 'select options > 0; count 1; Grant', grantRow);
}

// ---- WORK-034-3 garden site + the Owl's mate (DEC-044/045, gate fork 11): unlock (row 20) → walk out → Decorate on the street →
// two outdoor placements by real taps (Stars 0 → 4 → 8, counts −1 each) → Done → space.arrivalStarted → the walk → arrival.finished,
// pet.arrived → the mate wanders; want.activated {owl-mate, 0}; input unfreezes; one remove (count +1, Stars 8 → 4) ------------------
const streetSlotPoint = slotId => page.evaluate(slotId => {
  const street = window.__tpp.game.scene.getScene('Street'), outline = street.outlines.get(slotId);
  const pts = outline.polygon.points, c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
  const rect = window.__tpp.game.canvas.getBoundingClientRect(), scale = rect.width / 1920, cam = street.cameras.main;
  return { x: rect.left + (c.x - cam.scrollX) * scale, y: rect.top + (c.y - cam.scrollY) * scale };
}, slotId);
async function tapStreetSlot(slotId) { const pt = await streetSlotPoint(slotId); await page.mouse.click(pt.x, pt.y, { delay: 40 }); await page.waitForTimeout(350); }
const siteHud = () => page.evaluate(() => {
  const toggle = document.querySelector('.tpp-site-toggle'), pill = document.querySelector('.tpp-site-pill');
  const vis = el => !!el && !el.hidden && el.offsetParent !== null;
  return { toggle: vis(toggle) ? toggle.textContent : null, stars: vis(pill) ? pill.querySelector('[data-string-key="tpp.stars.label"]').textContent : null,
    moreHomes: document.querySelector('.tpp-more-homes') !== null };
});
const siteView = () => page.evaluate(() => {
  const street = window.__tpp.game.scene.getScene('Street');
  return { art: street.siteArt.get('garden')?.texture.key ?? null, outlinesShown: [...street.outlines.values()].filter(o => o.visible).map(o => o.slotId),
    charms: [...street.charms.keys()], pet: street.pet ? { petId: street.pet.petId, x: street.pet.x, y: street.pet.y, anim: street.pet.anims.currentAnim?.key ?? null } : null,
    walking: street.arrival ? { petId: street.arrival.arrival.petId, fades: street.arrival.fades } : null };
});
async function placeOutdoor(slotId) {
  await tapStreetSlot(slotId);
  await until(page, () => !document.querySelector('.tpp-chooser').hidden, null, 3000);
  const typeId = await page.evaluate(() => [...document.querySelectorAll('.tpp-chooser .tpp-charm-card[data-action="place"]')]
    .map(c => c.dataset.typeId).find(id => !Object.values(window.__tpp.store.getState().spaces.garden.placements).includes(id)) ?? null);
  return typeId;
}
async function gardenSite() {
  await drainAll(800);
  mark('gardenStart');
  await rowButton('Unlock garden', 0); await setDebug(page, false);
  await refresh();
  const unlocked = linesAfter('space.unlocked', 0, { siteId: 'garden' });
  await steer(page, 693, 575, () => window.__tpp.store.getState().scene.kind === 'street', 30000);
  await waitScene(page, 'Street', 900);
  await drainAll(800); await dismissToast();
  const v0 = await siteView(), h0 = await siteHud(), s0 = await getState(page);
  await still('site-unlocked-hud-1080', 'WORK-034-3: the street with the garden unlocked (base art), Decorate and the site Stars on the HUD', { view: v0, hud: h0, spaces: s0.spaces });
  beat('garden: row 20 Unlock garden → space.unlocked {garden}; walk out → the street shows world/site-garden-base, HUD Decorate + "0 / 24 ★"; no "More homes coming"',
    unlocked.length === 1 && v0.art === 'world/site-garden-base' && h0.toggle === 'Decorate' && h0.stars === '0 / 24 ★' && !h0.moreHomes && s0.spaces.garden.unlocked,
    'space.unlocked ×1; art base; Decorate; 0 / 24 ★', { view: v0, hud: h0, unlocked: unlocked.map(strip) });
  // Decorate (real click) → 6 outlines at the site only
  await refresh(); const td = cursor();
  await page.click('.tpp-site-toggle'); await page.waitForTimeout(450);
  const v1 = await siteView();
  mark('placementStart');
  const counts0 = (await getState(page)).inventory.counts;
  const first = await placeOutdoor('garden-small-1');
  await still('site-design-outlines-1080', 'WORK-034-3: street design mode — tint, the six garden outlines, the chooser open over garden-small-1', { view: await siteView() });
  await page.click(`.tpp-chooser .tpp-charm-card[data-type-id="${first}"]`); await page.waitForTimeout(500);
  const s1 = await getState(page), h1 = await siteHud();
  const second = await placeOutdoor('garden-small-2');
  await page.click(`.tpp-chooser .tpp-charm-card[data-type-id="${second}"]`); await page.waitForTimeout(500);
  mark('placementEnd');
  const s2 = await getState(page), h2 = await siteHud(), v2 = await siteView();
  await still('site-placed-8stars-1080', 'WORK-034-3: two charms at the garden, site Stars 8 / 24', { view: v2, hud: h2 });
  await refresh();
  const placed = linesSince('charm.placed', td).filter(l => l.siteId === 'garden'), starsCh = linesSince('space.stars.changed', td, { siteId: 'garden' });
  beat('garden: Decorate → design mode, outlines at the 6 garden slots only; tap garden-small-1 → chooser → card → charm.placed {siteId garden}; again at garden-small-2 → Stars 0 → 4 → 8; counts −1 each',
    s1.mode === 'design' && v1.outlinesShown.length === 6 && v1.outlinesShown.every(id => id.startsWith('garden-')) && first && second && first !== second && placed.length === 2
      && h1.stars === '4 / 24 ★' && h2.stars === '8 / 24 ★' && s1.inventory.counts[first] === counts0[first] - 1 && s2.inventory.counts[second] === counts0[second] - 1 && h2.toggle === 'Done',
    'outlines 6 (garden); charm.placed ×2 {garden}; 4 / 24 ★ then 8 / 24 ★; counts −1 each', { outlines: v1.outlinesShown, first, second, placed: placed.map(strip), starsChanged: starsCh.map(strip), hud: [h1, h2], counts: { before: counts0, afterFirst: s1.inventory.counts, afterSecond: s2.inventory.counts } });
  // Done → the site arrival
  await refresh(); const ta = cursor();
  mark('arrivalStart');
  await page.click('.tpp-site-toggle');
  await waitLine(page, 'space.arrivalStarted', { siteId: 'garden', petId: 'owl-mate' }, 5000);
  const walking = await siteView();
  const arrived = await waitLine(page, 'pet.arrived', { petId: 'owl-mate', siteId: 'garden' }, 20000);
  await page.waitForTimeout(150);
  mark('arrivalEnd');
  const vA = await siteView();
  await still('mate-arrived-1080', 'WORK-034-3: the Owl\'s mate at its spawn after the arrival walk (no fade; hand-over to the street sprite)', { view: vA });
  await drainAll(1500);
  await refresh();
  const started = linesSince('space.arrivalStarted', ta), finished = linesSince('arrival.finished', ta, { petId: 'owl-mate' }), petArrived = linesSince('pet.arrived', ta), want0 = linesSince('want.activated', ta, { petId: 'owl-mate', index: 0 });
  const sA = await getState(page);
  beat('garden: Done → space.arrivalStarted {garden, owl-mate} (as-built name, WORK-034-2 fork 1) → the walk (no fade) → arrival.finished {owl-mate} ×1, pet.arrived {owl-mate, garden} → the mate on the street; want.activated {owl-mate, index 0}',
    started.length === 1 && walking.walking?.petId === 'owl-mate' && walking.walking.fades === false && arrived && finished.length === 1 && petArrived.length === 1 && vA.pet?.petId === 'owl-mate' && !vA.walking && want0.length === 1 && sA.spaces.garden.arrivalDone,
    'space.arrivalStarted ×1; walk fades false; arrival.finished ×1; pet.arrived ×1; street pet owl-mate; want.activated {owl-mate, 0}', { walking, afterArrival: vA, started: started.map(strip), finished: finished.map(strip), petArrived: petArrived.map(strip), want: want0.map(strip) });
  // input unfreezes (review A2 MUST): siteArrival null, a real key press moves the avatar
  const before = (await getState(page)).avatar;
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight'); await page.waitForTimeout(200);
  const after = await getState(page);
  beat('garden: input unfreezes after the arrival — siteArrival null, mode play, no dialogue; a real ArrowRight hold moves the avatar',
    after.siteArrival === null && after.mode === 'play' && !after.dialogue.current && after.avatar.x > before.x, 'avatar.x increases', { before, after: after.avatar, siteArrival: after.siteArrival, mode: after.mode });
  // wander: ≥ 2 idle ↔ walk switches of the mate within 25 s
  mark('wanderStart');
  await refresh(); const tw = cursor();
  await until(page, from => window.__tpp.log.lines().slice(from).filter(l => l.type === 'pet.phaseChanged' && l.petId === 'owl-mate').length >= 4, tw, 25000).catch(() => null);
  await page.waitForTimeout(600);
  mark('wanderEnd');
  await refresh();
  const phases = linesSince('pet.phaseChanged', tw, { petId: 'owl-mate' }).map(l => `${l.from}→${l.to}`);
  const vW = await siteView();
  beat('garden: the mate idles and wanders on the street — ≥ 2 idle ↔ walk switches (pet.phaseChanged) and its sprite follows behaviour', phases.filter(p => p.includes('walking')).length >= 2 && vW.pet?.petId === 'owl-mate',
    '≥ 2 phase switches through walking', { phases, view: vW });
  // one remove (count +1, Stars 8 → 4)
  await refresh(); const tr = cursor();
  const cBefore = (await getState(page)).inventory.counts[first];
  await page.click('.tpp-site-toggle'); await page.waitForTimeout(450);
  await tapStreetSlot('garden-small-1');
  await until(page, () => { const sh = document.querySelector('.tpp-replaceRemove'); return sh && sh.offsetParent !== null; }, null, 3000);
  await page.locator('.tpp-replaceRemove [data-action="remove"]').click(); await page.waitForTimeout(450);
  const hR = await siteHud(), sR = await getState(page);
  await page.click('.tpp-site-toggle'); await page.waitForTimeout(450);
  await refresh();
  mark('gardenEnd');
  const removed = linesSince('charm.removed', tr, { siteId: 'garden', slotId: 'garden-small-1' });
  beat('garden: Decorate → tap the occupied garden-small-1 → replace/remove sheet → Remove → charm.removed {garden}; count +1; Stars 8 → 4; Done',
    removed.length === 1 && sR.inventory.counts[first] === cBefore + 1 && hR.stars === '4 / 24 ★' && (await getState(page)).mode === 'play',
    'charm.removed ×1; count +1; 4 / 24 ★', { removed: removed.map(strip), counts: { before: cBefore, after: sR.inventory.counts[first] }, hud: hR });
  row('t2-site', { verify: 'VERIFY-T2-SITE-101..106 (browser half)', first, second, phases, view: vW });
}

// ---- mute (row 10) both ways ------------------------------------------------------------------------------------------------------
async function mute() {
  const t = lastT();
  await rowSwitch('Mute SFX'); await rowSwitch('Mute SFX'); await setDebug(page, false);
  await refresh();
  const m = linesAfter('audio.muteChanged', t);
  beat('row 10 Mute SFX on → off → audio.muteChanged {true}, {false}', m.length >= 2 && m[0].muted === true && m[1].muted === false, 'audio.muteChanged ×2', { lines: m.map(strip) });
  rows['pres-011'].muteChanged = m.map(strip);
}

// ---- exports: Download, Copy, Share hidden without canShare, taken with a stub ----------------------------------------------
async function exportsBeat() {
  mkdirSync(exportsDir, { recursive: true });
  mark('exportsStart');
  await refresh();
  const preLast = all.at(-1);
  await setDebug(page, true);
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), debugRow('Export log').locator('button').nth(0).click()]);
  const dlPath = join(exportsDir, dl.suggestedFilename()); await dl.saveAs(dlPath);
  await page.waitForTimeout(400);
  const dlLines = readFileSync(dlPath, 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l));
  await refresh();
  const dlRec = all.at(-1);
  const download = { file: dlPath, suggestedFilename: dl.suggestedFilename(), lines: dlLines.length, fileLastLine: strip(dlLines.at(-1)), preExportLastLine: strip(preLast), nextLine: strip(dlRec) };
  const okDl = dlRec.type === 'log.exported' && dlRec.method === 'download' && dlRec.lines === dlLines.length && dlLines.at(-1).t >= preLast.t && dlLines.at(-1).type !== 'log.exported';
  // Copy (clipboard permissions granted on the context)
  const tc = lastT();
  await debugRow('Export log').locator('button').nth(1).click();
  await waitLine(page, 'log.exported', { method: 'copy' }, 5000);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  await refresh();
  const cpRec = linesAfter('log.exported', tc, { method: 'copy' })[0];
  const clipLines = clip.split('\n').filter(Boolean);
  writeFileSync(join(exportsDir, 'copy-clipboard.jsonl'), `${clip}\n`);
  const copy = { clipboardLines: clipLines.length, record: strip(cpRec), lastClipLine: clipLines.length ? JSON.parse(clipLines.at(-1)) : null };
  const okCp = cpRec && cpRec.lines === clipLines.length && clipLines.length >= dlLines.length + 1;
  // Share: hidden when canShare is absent (re-evaluated on every open), visible + taken with a stub
  await setDebug(page, false);
  const nativeCanShare = await page.evaluate(() => typeof navigator.canShare === 'function' ? navigator.canShare({ files: [new File([''], 'x.jsonl', { type: 'application/x-ndjson' })] }) : 'absent');
  await page.evaluate(() => { Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true, writable: true }); });
  await setDebug(page, true);
  const shareHidden = await debugRow('Export log').locator('button').nth(2).evaluate(b => b.hidden);
  await still('export-share-hidden-1080', 'Export row with navigator.canShare absent: Download · Copy only (Share hidden)');
  await setDebug(page, false);
  await page.evaluate(() => { window.__shared = []; Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true, writable: true }); Object.defineProperty(navigator, 'share', { value: async d => { window.__shared.push(d.files?.map(f => [f.name, f.size, f.type])); }, configurable: true, writable: true }); });
  await setDebug(page, true);
  const shareVisible = !(await debugRow('Export log').locator('button').nth(2).evaluate(b => b.hidden));
  await still('export-share-stub-visible-1080', 'Export row with the canShare/share stub: Download · Copy · Share');
  const ts = lastT();
  await debugRow('Export log').locator('button').nth(2).click();
  await waitLine(page, 'log.exported', { method: 'share' }, 5000);
  await refresh();
  const shRec = linesAfter('log.exported', ts, { method: 'share' })[0];
  const shared = await page.evaluate(() => window.__shared);
  await setDebug(page, false);
  mark('exportsEnd');
  const share = { chromiumNativeCanShareFiles: nativeCanShare, hiddenWithoutCanShare: shareHidden, visibleWithStub: shareVisible, sharedFiles: shared, record: strip(shRec),
    note: 'chromium-1243 headless reports canShare true natively (WORK-025-1 FLAG 1), so "absent" is forced by redefining navigator.canShare before the panel opens; the real Share is the user\'s iPhone check, not-run (insecure context over LAN)' };
  beat('exports: Download via row 13 → file arrives, its last line is the latest pre-export record, then log.exported {download, lines N} is the next line', okDl, 'download event; file last line = pre-export last line; next line log.exported {method download, lines = file lines}', download, { line: dlRec });
  beat('exports: Copy (granted clipboard) → clipboard text has the exported lines, log.exported {copy} follows', okCp, 'clipboard lines = log.exported.lines; log.exported {method copy}', copy, { line: cpRec });
  beat('exports: Share hidden without canShare; visible with the stub; click → log.exported {share}', shareHidden && shareVisible && shRec && shared.length === 1, 'hidden true; visible; log.exported {method share}; one share call with a .jsonl file', share, { line: shRec });
  row('mec-010-011', { verify: 'VERIFY-MEC-010-011', download, copy, share, deviceCells: { 'ENV-MAC-SA': 'not-run (user, dry-run session)', 'ENV-IPH': 'not-run (user, dry-run session); Share/Copy not-run (insecure context over LAN)' } });
}

// ---- R-9: save.written counted (answer (a): 0 by design, Q18) -------------------------------------------------------------------
async function r9() {
  await refresh();
  const n = count(all, 'save.written');
  const f = { saveWritten: n, answer: '(a) routine save.written is not recorded by design (play-session Q18, APPROVAL-017; foundation §4.4)', gated: false };
  row('r-9', { ...f, verdict: n === 0 ? 'by design (Q18): 0 lines' : `observed ${n} (unexpected under (a)); counted, not gated` });
  beat('R-9: save.written counted — expected 0 by design (Q18), not gated', true, 'counted (0 expected); never gates', f);
}

const report = { kind: 'state read', work: WORK, milestone: MILESTONE, sha, base, query: QUERY, seed: 'session-opening.real.json (npm run fixture -- --scenario session-opening, regenerated on the merged head)', captured_at: null, chromium: null, notes: [], beats };
browser = await launch();
report.chromium = browser.version();
const streamDir = mkdtempSync(join(tmpdir(), 'tpp-m3-stream-'));
let w;
try {
  w = await boot(browser, { height: 1080, save: SEED_TEXT, query: QUERY, contextOptions: { permissions: ['clipboard-read', 'clipboard-write'] } });
  page = w.page;
  stream = await startStreamRecording(page, streamDir);
  for (const fn of [seedBoot, testerLabel, test008, test003, test004, enterDogRoom, test001, wantPanelLabel, test005006, scarcity, stripReaction, test007, gardenSite, mute, exportsBeat, r9]) {
    try { await fn(); } catch (error) { beat(`${fn.name}: no uncaught error`, false, 'the beat runs', String(error).slice(0, 800)); }
  }
  mark('traceEnd');
  await stream.stop();
  await refresh();
  const end = await page.evaluate(() => ({ save: localStorage.getItem('tpp.save'), log: localStorage.getItem('tpp.log'), state: window.__tpp.store.getState() }));
  report.exported = await exportLog(page, join(evidenceRoot, 'trace-log.jsonl'));
  const rejected = all.filter(l => l.type === 'action.rejected'), assetErr = all.filter(l => l.type === 'asset.loadError'), appErr = all.filter(l => l.type === 'app.error');
  report.errors = { consoleErrors: w.errors.consoleErrors, pageErrors: w.errors.pageErrors, assetLoadErrors: assetErr, appErrors: appErr.map(strip), actionRejected: rejected.map(l => ({ ...strip(l), action: l.action })),
    excludedByDesign: ['the stubbed navigator.share (no real share sheet)', 'the quota context (own window; records log.quota, not app.error)'] };
  beat('errors: zero console errors, page errors, asset.loadError, app.error; no action.rejected from real inputs', !w.errors.consoleErrors.length && !w.errors.pageErrors.length && !assetErr.length && !appErr.length && !rejected.length, 'all empty', report.errors);
  await w.context.close();
  // storage: tpp.save parses and equals the in-memory state on reload; the tpp.log mirror holds the session lines
  const saved = JSON.parse(end.save), mirror = (end.log ?? '').split('\n').filter(Boolean).map(t => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
  const r1 = await boot(browser, { height: 1080, save: end.save, query: QUERY });
  await r1.page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.getScenes(true).some(s => ['Street', 'Interior'].includes(s.scene.key)), null, { timeout: 30000 });
  const reloaded = await r1.page.evaluate(() => ({ state: window.__tpp.store.getState(), loaded: window.__tpp.log.lines().filter(l => l.type === 'save.loaded' || l.type === 'save.discarded') }));
  await r1.context.close();
  const cmp = Object.fromEntries(Object.keys(saved.state ?? {}).map(k => [k, eq(saved.state[k], reloaded.state[k])]));
  const storage = { kind: 'state read', work: WORK, sha, captured_at: new Date().toISOString(),
    endOfTrace: { bytes: end.save.length, schemaVersion: saved.schemaVersion, reload: { saveLoaded: reloaded.loaded, perKeyEqual: cmp }, inMemoryDiffKeys: Object.keys(end.state).filter(k => !eq(end.state[k], saved.state?.[k])) },
    logMirror: { lines: mirror.length, sessionStarted: count(mirror, 'session.started'), saveWritten: count(mirror, 'save.written'), heartEarned: count(mirror, 'heart.earned'), logExported: count(mirror, 'log.exported'), firstType: mirror[0]?.type ?? null } };
  writeJson(join(evidenceRoot, 'storage-reads.json'), storage);
  const stable = Object.entries(cmp).filter(([k]) => !['feed', 'pets', 'session'].includes(k));
  beat('storage: tpp.save parses (schemaVersion 2) and equals the in-memory state on reload (tick-driven feed/pets/session excepted); the tpp.log mirror holds the session lines',
    saved.schemaVersion === 2 && stable.every(([, v]) => v) && storage.logMirror.sessionStarted === 1 && storage.logMirror.firstType === 'session.started' && storage.logMirror.heartEarned >= 1,
    'schemaVersion 2; per-key equal; mirror starts with session.started and holds heart.earned', { perKeyEqual: cmp, logMirror: storage.logMirror });
  // quota (own context): Storage.setItem throws QuotaExceededError once for tpp.log
  const q = await boot(browser, { height: 1080, save: SEED_TEXT, query: QUERY, init: () => {
    const orig = Storage.prototype.setItem; let thrown = false;
    Storage.prototype.setItem = function (k, v) { if (k === 'tpp.log' && !thrown) { thrown = true; window.__quotaThrown = Date.now(); throw new DOMException('quota', 'QuotaExceededError'); } return orig.call(this, k, v); };
  } });
  await waitScene(q.page, 'Interior', 2500);
  await q.page.waitForTimeout(1500);
  const qp = page; page = q.page;
  let placed = false;
  try { await place('large-1', 'dog-bed'); placed = (await getState(page)).rooms['dog-room'].placements['large-1'] === 'dog-bed'; } catch (error) { report.notes.push(`quota placement: ${String(error).slice(0, 200)}`); }
  await page.waitForTimeout(1200);
  await shot(page, browser, capturesDir, 'quota-continues-1080', { target: `${base}/${QUERY}`, seededSave: 'session-opening.real.json', note: 'quota context: one QuotaExceededError on the tpp.log mirror; the game continues (the bed placed)' });
  const ql = await lines(page), qs = await getState(page);
  const qThrown = await page.evaluate(() => window.__quotaThrown ?? null);
  page = qp;
  const quota = { thrown: qThrown !== null, logQuota: ql.filter(l => l.type === 'log.quota').map(strip), appError: ql.filter(l => l.type === 'app.error').map(strip), placed, ticksAfter: qs.feed, consoleErrors: q.errors.consoleErrors, pageErrors: q.errors.pageErrors,
    forced: 'addInitScript wraps Storage.prototype.setItem to throw DOMException QuotaExceededError once for key tpp.log' };
  await q.context.close();
  row('mec-010-014', { verify: 'VERIFY-MEC-010-014 (browser half)', ...quota });
  beat('quota: one forced QuotaExceededError on the tpp.log mirror → exactly one log.quota; the game continues (a placement succeeds); no app.error (VERIFY-MEC-010-014 browser half)',
    quota.thrown && quota.logQuota.length === 1 && placed && !quota.appError.length && !quota.pageErrors.length, 'log.quota ×1; placement large-1 dog-bed; app.error 0', quota);
  // WORK-033-2 save reset (own context): a tier 1 save (schemaVersion 1) is discarded and a fresh state is saved at schemaVersion 2
  const tier1 = readFileSync(join(GAME_DIR, 'tests/fixtures/save-bad/schema-1-tier1.json'), 'utf8');
  const sr = await boot(browser, { height: 1080, save: tier1, query: QUERY });
  await waitScene(sr.page, 'Street', 1500);
  const saveReset = await sr.page.evaluate(async () => {
    for (let i = 0; i < 40 && JSON.parse(localStorage.getItem('tpp.save') ?? '{}').schemaVersion !== 2; i++) await new Promise(r => setTimeout(r, 100));
    const saved = JSON.parse(localStorage.getItem('tpp.save') ?? 'null');
    return { discarded: window.__tpp.log.lines().filter(l => l.type === 'save.discarded').map(({ t, type, reason }) => ({ t, type, reason })),
      scene: window.__tpp.store.getState().scene, savedSchemaVersion: saved?.schemaVersion ?? null, savedScene: saved?.state?.scene ?? null };
  });
  const saveResetErrors = { consoleErrors: sr.errors.consoleErrors, pageErrors: sr.errors.pageErrors };
  await sr.context.close();
  const tier1Version = JSON.parse(tier1).schemaVersion;
  row('save-reset', { verify: 'WORK-033-1 fork default 7 (browser half)', fixture: 'tests/fixtures/save-bad/schema-1-tier1.json', fixtureSchemaVersion: tier1Version, ...saveReset, ...saveResetErrors });
  beat('save reset: a tier 1 save (schema-1-tier1.json) in tpp.save → save.discarded {reason schemaVersion}; scene street; a fresh state saved at schemaVersion 2',
    tier1Version === 1 && saveReset.discarded.length === 1 && saveReset.discarded[0].reason === 'schemaVersion' && saveReset.scene.kind === 'street' && saveReset.savedSchemaVersion === 2 && !saveResetErrors.pageErrors.length,
    'save.discarded {schemaVersion} ×1; scene street; tpp.save schemaVersion 2', { ...saveReset, ...saveResetErrors });
} finally { await browser.close(); }

// rows/*.json and the arms table
const armIds = { 'TEST-001': 'TEST-001:', 'TEST-003': 'TEST-003:', 'TEST-004': 'TEST-004:', 'TEST-005/006': 'TEST-005/006:', 'TEST-007': 'TEST-007:', 'TEST-008': 'TEST-008: row 12' };
rows.arms = { id: 'arms', work: WORK, milestone: MILESTONE, sha, verify: 'VERIFY-MEC-010-007 (rules) + trace beats', arms: Object.fromEntries(Object.entries(armIds).map(([k, p]) => { const b = beats.find(x => x.beat.startsWith(p)); return [k, b ? { ok: b.ok, beat: b.beat, found: b.found } : null]; })) };
for (const [id, value] of Object.entries(rows)) writeJson(join(rowsDir, `${id}.json`), value);

const frames = stream ? stream.frames() : [];
const between = (a, b) => frames.filter(f => f.t >= a && f.t <= b);
const LOOPS = [
  ['trace-arms-stars-trickle', marks.arms, marks.trickleEnd, 'rows 10b and 2 → round-up with no toast, the bar glides (TEST-003)'],
  ['trace-stars', marks.starsStart - 300, marks.starsEnd + 300, 'row 8 off → on (TEST-001)'],
  ['trace-reveal-panel', marks.revealStart, marks.revealEnd + 300, 'row 5 → phase → "?" → panel → close (TEST-004)'],
  ['trace-bed-heart', marks.bedStart, marks.bedEnd, 'Dog bed → reaction → want 1 → Heart 1 (TEST-005/006)'],
  ['trace-joystick', marks.joyStart - 300, marks.joyEnd + 300, 'desktop joystick drag (TEST-007)'],
  ['trace-reset-frozen', marks.resetStart - 300, marks.resetDone + 1500, 'row 12 Reset → Start frozen → fresh street (TEST-008)'],
  ['trace-exports', marks.exportsStart, marks.exportsEnd + 300, 'Download · Copy · Share hidden · Share stub'],
  ['scarcity-chooser', marks.scarcityStart, marks.scarcityEnd + 600, 'WORK-033-2: place the only lamp → "none left" in the chooser → inert click → remove → "×1" again'],
  ['stripped-reaction', marks.stripStart, marks.stripEnd, 'WORK-033-2: remove the Heart bed → Done → the Dog\'s 😢 and a stripped line'],
  ['site-placement', marks.placementStart - 300, marks.placementEnd + 300, 'WORK-034-3: tap a garden outline → chooser → placed → site Stars (×2)'],
  ['mate-arrival', marks.arrivalStart - 300, marks.arrivalEnd + 600, 'WORK-034-3: Done → the mate walks the garden arrivalPath → 🎵 → hand-over to the street sprite (no fade)'],
  ['mate-wander', marks.wanderStart, marks.wanderEnd, 'WORK-034-3: the mate idles and wanders on the street'],
];
report.loops = [];
for (const [name, a, b, target] of LOOPS) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) { report.loops.push({ name, gap: 'beat not reached (no marks)' }); continue; }
  const lo = b - a > 12000 ? b - 12000 : a;
  const sc = encode(loopsDir, name, between(lo, b), { target, viewport: { width: 1920, height: 1080 }, screencast: '1280×720 JPEG q70, one continuous stream', seededSave: 'session-opening.real.json', window: { from: new Date(lo).toISOString(), to: new Date(b).toISOString() } }, { maxMs: 12000, crf: 26 });
  report.loops.push({ name, outputs: sc.outputs ?? null, gap: sc.gap ?? null, durationMs: sc.durationMs, sourceFps: sc.sourceFps });
}
if (frames.length) {
  // the 120 s wait trimmed to its first and last 5 s
  const cut = Number.isFinite(marks.frozenWaitStart) && Number.isFinite(marks.frozenWaitEnd) ? frames.filter(f => f.t < marks.frozenWaitStart + 5000 || f.t > marks.frozenWaitEnd - 5000) : frames;
  let shift = 0; const trimmed = cut.map((f, i) => { if (i && f.t - cut[i - 1].t > 5000) shift += f.t - cut[i - 1].t - 100; return { ...f, t: f.t - shift }; });
  const full = encode(loopsDir, 'trace-full', trimmed, { target: 'the whole M3 trace (the 120 s frozen wait trimmed to its first and last 5 s)', viewport: { width: 1920, height: 1080 }, marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, new Date(v).toISOString()])) },
    { maxMs: 60 * 60 * 1000, crf: 30, scale: '960:540', fps: 15 });
  report.traceFull = { outputs: full.outputs ?? null, gap: full.gap ?? null, durationMs: full.durationMs };
}
rmSync(streamDir, { recursive: true, force: true });
report.captured_at = new Date().toISOString();
report.elapsedMs = Date.now() - traceStart;
report.marks = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, { wall: new Date(v).toISOString(), elapsedMs: v - traceStart }]));
report.ok = beats.every(b => b.ok);
writeJson(join(evidenceRoot, 'trace-report.json'), report);
console.log(JSON.stringify({ ok: report.ok, elapsedMs: report.elapsedMs, failed: beats.filter(b => !b.ok).map(b => b.beat), loops: report.loops.map(l => [l.name, !!l.outputs]) }, null, 1));
process.exit(report.ok ? 0 : 1);

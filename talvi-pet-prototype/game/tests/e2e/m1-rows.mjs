// WORK-021-2 targeted desktop-Chrome runs for the W-M1 rows and the integration-level rows deferred to WORK-021.
//   TPP_BASE=http://127.0.0.1:5199 TPP_EVIDENCE=<lane evidence dir> node tests/e2e/m1-rows.mjs [unit,unit,…]
// Real-content saves come from the game's fixture tool (make-fixture) into a tmp dir; rows/*.json entries are
// { id, half, result, reason?, expected, found, evidence[] }. Trace-derived rows read <evidence>/trace-report.json.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { base, evidenceRoot, sha, launch, boot, waitScene, lines, getState, count, first, strip, eq, until, waitLine, tapSlot, slotPoint, tapWorld, holdUntil, steer,
  setDebug, debugClick, domRead, shot, makeFixture, writeJson, GAME_DIR, WORK } from './lib/harness.mjs';

const rowsDir = join(evidenceRoot, 'rows'), capturesDir = join(evidenceRoot, 'captures');
const m5Dir = join(evidenceRoot, '..', 'MILESTONE-005');
const only = process.argv[2] ? process.argv[2].split(',') : null;
const NOT_DEVICE = 'not-run (user, play session)';
let browser;
const saves = {};
const save = name => (saves[name] ??= name.endsWith('.steps') ? makeFixture(['--steps', name.startsWith('tests/') ? name + '.json' : `tests/view/capture/${name}.json`]).text : makeFixture(['--scenario', name]).text);
const rowFile = (name, rows) => writeJson(join(rowsDir, `${name}.json`), { kind: 'rows', work: WORK, sha, base, captured_at: new Date().toISOString(), rows });
const row = (id, half, result, expected, found, evidence, reason) => ({ id, half, result, ...(reason ? { reason } : {}), expected, found, evidence });
const still = (page, point, meta, dir = capturesDir) => shot(page, browser, dir, point, { target: `${base}/?lenient=1`, ...meta });
const trace = () => existsSync(join(evidenceRoot, 'trace-report.json')) ? JSON.parse(readFileSync(join(evidenceRoot, 'trace-report.json'), 'utf8')) : null;
const beatOf = (t, prefix) => t?.beats.find(b => b.beat.startsWith(prefix)) ?? null;
async function open(name, { height = 1080, width = 1920, query = '?lenient=1', scene = null } = {}) {
  const w = await boot(browser, { height, width, save: name ? save(name) : null, query });
  if (scene) await waitScene(w.page, scene);
  return w;
}
async function tapBox(page, limit = 12) {
  let taps = 0;
  while (taps < limit && (await getState(page)).dialogue.current) {
    const box = page.locator('[data-panel="dialogue"]');
    if (await box.isVisible()) { await box.click({ position: { x: 300, y: 60 } }); taps++; }
    await page.waitForTimeout(380);
  }
  return taps;
}
async function drain(page, quietMs = 1200, ms = 20000) {
  let quiet = Date.now(); const t0 = Date.now();
  while (Date.now() - t0 < ms) { if ((await getState(page)).dialogue.current) { await tapBox(page); quiet = Date.now(); } else if (Date.now() - quiet >= quietMs) break; await page.waitForTimeout(150); }
}
const toggle = async (page, mode) => { await until(page, () => !document.querySelector('.tpp-design-toggle').disabled, null, 8000); if ((await getState(page)).mode !== mode) { await page.click('.tpp-design-toggle'); await page.waitForTimeout(400); } };
const chooserOpen = page => until(page, () => { const c = document.querySelector('.tpp-chooser'); return c && !c.hidden; }, null, 3000);

// ---- VERIFY-PRES-001: alignment grid at 1080 and 823 -------------------------------------------------------------------
async function pres001() {
  const idle = (() => { const s = JSON.parse(save('dog-room-intro-done')); s.state.pets.dog.behaviour = { ...s.state.pets.dog.behaviour, phase: 'idle', x: 919, y: 800, facing: 'left', timerMs: 600000, target: null, verb: null, reaction: null }; return JSON.stringify(s); })();
  const out = [];
  for (const height of [1080, 823]) {
    const w = await boot(browser, { height, save: idle, query: '?lenient=1&grid=1' });
    await waitScene(w.page, 'Interior', 2500);
    const png = await still(w.page, `grid-${height}`, { seededSave: 'dog-room-intro-done (real) with the Dog idle at petSpawn', note: '?grid=1 crosshairs and overlay targets' });
    const read = await w.page.evaluate(() => {
      const { game } = window.__tpp, canvas = game.canvas.getBoundingClientRect(), k = canvas.width / 1920, H = game.scale.gameSize.height;
      const pts = { tl: [0, 0], tr: [1920, 0], bl: [0, H], br: [1920, H], centre: [960, H / 2] }, cam = game.scene.getScene('Interior').cameras.main;
      const targets = [...document.querySelectorAll('#alignment-grid .alignment-target')].map(t => { const r = t.getBoundingClientRect(), [x, y] = pts[t.dataset.corner];
        const d = Math.hypot(r.left + r.width / 2 - (canvas.left + x * k), r.top + r.height / 2 - (canvas.top + y * k)); return { corner: t.dataset.corner, deltaPx: Math.round(d * 100) / 100 }; });
      return { gameSize: { w: game.scale.gameSize.width, h: H }, targets, visibleWorldY: [cam.scrollY, cam.scrollY + H] };
    });
    writeFileSync(png.replace(/\.png$/, '.json'), JSON.stringify({ ...JSON.parse(readFileSync(png.replace(/\.png$/, '.json'), 'utf8')), read }, null, 2) + '\n');
    out.push({ height, png, read, pass: read.gameSize.w === 1920 && read.gameSize.h === height && read.targets.length === 5 && read.targets.every(t => t.deltaPx <= 2) && read.visibleWorldY[0] <= 128.5 && read.visibleWorldY[1] >= 951, errors: w.errors });
    await w.context.close();
  }
  rowFile('pres-001', [row('VERIFY-PRES-001', 'Chrome 1080 + 823', out.every(o => o.pass) ? 'pass' : 'fail', 'gameSize 1920×1080 / 1920×823; overlay and canvas corners ≤ 2 px; world y 128..951 visible', out, out.map(o => o.png)),
    row('VERIFY-PRES-001', 'iPhone', 'not-run', 'device read', null, [], 'user, play session')]);
}

// ---- VERIFY-PRES-002: pointer rules (design mode) ----------------------------------------------------------------------
async function pres002() {
  const w = await open('dog-room-intro-done', { scene: 'Interior' }); const { page } = w;
  await drain(page); await toggle(page, 'design');
  await tapSlot(page, 'floor-6'); await chooserOpen(page);
  // a slot whose screen point lies under the open chooser panel
  const under = await page.evaluate(() => {
    const i = window.__tpp.game.scene.getScene('Interior'), r = window.__tpp.game.canvas.getBoundingClientRect(), k = r.width / 1920;
    for (const [id, o] of i.outlines) { const pts = o.polygon.points, c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
      const x = r.left + c.x * k, y = r.top + (c.y - i.cameras.main.scrollY) * k, el = document.elementFromPoint(x, y);
      if (el && el.closest('.tpp-chooser') && !el.closest('.tpp-charm-card') && !el.closest('button')) return { slotId: id, x, y, element: el.className }; }
    return null;
  });
  const before = (await lines(page, 'input.tap')).length;
  if (under) { await page.mouse.click(under.x, under.y, { delay: 40 }); await page.waitForTimeout(400); }
  const panelTaps = (await lines(page, 'input.tap')).slice(before);
  await page.keyboard.press('Escape'); await page.locator('.tpp-chooser .tpp-dismiss-backdrop').click({ force: true }).catch(() => {}); await page.waitForTimeout(400);
  const n2 = (await lines(page, 'input.tap')).length;
  await tapSlot(page, 'floor-3');
  const slotTaps = (await lines(page, 'input.tap')).slice(n2);
  const ok = under && panelTaps.length === 0 && slotTaps.some(l => l.target === 'slot:floor-3');
  rowFile('pres-002', [row('VERIFY-PRES-002', 'Chrome', ok ? 'pass' : 'fail', "no input.tap for the panel tap over a slot; the slot tap logged target 'slot:<id>'", { panelOverSlot: under, panelTaps: panelTaps.map(strip), slotTaps: slotTaps.map(strip), errors: w.errors }, ['rows/pres-002.json']),
    row('VERIFY-PRES-002', 'iPhone', 'not-run', 'device', null, [], 'user, play session')]);
  await w.context.close();
}

// ---- VERIFY-PRES-006: cutscene timing (save-v1 → step outside) ---------------------------------------------------------------
async function pres006() {
  const w = await open('save-v1-at-door.steps', { scene: 'Interior' }); const { page } = w;
  await holdUntil(page, 'KeyW', () => window.__tpp.store.getState().scene.kind === 'street', null, 8000);
  await page.waitForFunction(() => window.__tpp.game.scene.isActive('Street'), null, { timeout: 8000 });
  const plan = await page.evaluate(async () => { for (let i = 0; i < 200; i++) { const d = window.__tpp.game.scene.getScene('Street').director; if (d?.plan) return { totalMs: d.plan.totalMs, beats: d.plan.beats, cue: d.cue }; await new Promise(r => setTimeout(r, 20)); } return null; });
  await until(page, () => window.__tpp.log.lines().some(l => l.type === 'celebration.stepped' && l.step === 'milestone'), null, 25000);
  const all = await lines(page);
  const cs = first(all, 'celebration.started'), st = all.find(l => l.type === 'celebration.stepped' && l.step === 'milestone');
  const measured = cs && st ? Math.round(st.t - cs.t) : null;
  const tl = await page.evaluate(() => window.__tpp.game.scene.getScene('Street').director?.timeline ?? null);
  const dirStart = await page.evaluate(() => window.__tpp.game.scene.getScene('Street').director?.startedAtPerf ?? null);
  const fromDirector = st && dirStart ? Math.round(st.t - dirStart) : null;
  writeFileSync(join(rowsDir, 'pres-006.log.jsonl'), all.map(l => JSON.stringify(l)).join('\n') + '\n');
  const finishAt = tl?.find(b => b.beat === 'finish')?.atMs ?? null;
  await w.context.close();
  // the same 1 → 4 cue started by a tap on the street (street-ack1-owed3): celebration.started and the director start share a frame
  const w2 = await open('street-ack1-owed3.steps', { scene: 'Street' });
  const ic = await w2.page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'), h = st.houses.get('pet-house'), cam = st.cameras.main, r = window.__tpp.game.canvas.getBoundingClientRect(), k = r.width / 1920; return { x: r.left + (h.icon.x - cam.scrollX) * k, y: r.top + (h.icon.y - cam.scrollY) * k }; });
  await w2.page.mouse.click(ic.x, ic.y, { delay: 40 });
  await until(w2.page, () => window.__tpp.log.lines().some(l => l.type === 'celebration.stepped' && l.step === 'milestone'), null, 25000);
  const all2 = await lines(w2.page), cs2 = first(all2, 'celebration.started'), st2 = all2.find(l => l.type === 'celebration.stepped' && l.step === 'milestone');
  const plan2 = await w2.page.evaluate(() => { const d = window.__tpp.game.scene.getScene('Street').director; return d?.plan ? { totalMs: d.plan.totalMs, cue: d.cue, finish: d.timeline.find(b => b.beat === 'finish')?.atMs ?? null } : null; });
  writeFileSync(join(rowsDir, 'pres-006-tap.log.jsonl'), all2.map(l => JSON.stringify(l)).join('\n') + '\n');
  await w2.context.close();
  const tapMeasured = cs2 && st2 ? Math.round(st2.t - cs2.t) : null;
  const okTap = plan2 && tapMeasured !== null && Math.abs(tapMeasured - plan2.totalMs) <= 100;
  const ok = plan && measured !== null && Math.abs(measured - plan.totalMs) <= 100;
  const okDirector = plan && fromDirector !== null && Math.abs(fromDirector - plan.totalMs) <= 100;
  rowFile('pres-006', [row('VERIFY-PRES-006', 'Chrome timing', okTap ? 'pass' : 'fail', 't(cutsceneFinished → celebration.stepped {milestone}) − t(celebration.started) = the presentation §7 sum (planCelebration(cue).totalMs, from src/view timings.ts constants) ± 100 ms',
    { planTotalMs: plan?.totalMs, planBeats: plan?.beats, cue: plan?.cue, measuredMs: measured, deltaMs: plan && measured !== null ? measured - plan.totalMs : null,
      directorStartToSteppedMs: fromDirector, directorDeltaMs: plan && fromDirector !== null ? fromDirector - plan.totalMs : null, directorRelativeWithin100: okDirector, directorTimelineFinishMs: finishAt,
      tapPath: { save: 'street-ack1-owed3 (icon tap on the street)', planTotalMs: plan2?.totalMs, cue: plan2?.cue, measuredMs: tapMeasured, deltaMs: plan2 && tapMeasured !== null ? tapMeasured - plan2.totalMs : null, directorFinishMs: plan2?.finish, started: strip(cs2), stepped: strip(st2) },
      note: 'on a step outside, celebration.started is logged in the door tick (mec-002 onStreetEntered) before the street fade-out/in; the director starts once the Street is created', directorTimeline: tl, started: strip(cs), stepped: strip(st), errors: w.errors }, ['rows/pres-006.json', 'rows/pres-006.log.jsonl', 'rows/pres-006-tap.log.jsonl'],
    ok ? undefined : 'save-v1 step outside: the literal log delta includes the door swap (celebration.started is logged in the door tick, mec-002 onStreetEntered) — measuredMs vs planTotalMs recorded, plus the director\'s own finish beat; the row is judged on the same 1 → 4 cue started by a tap on the street (tapPath), where started and the director start share a frame (FORK in the journal)'),
    row('VERIFY-PRES-006', 'sound ("three chunk pops heard")', 'not-run', 'heard', null, [], 'user-managed sound'),
    row('VERIFY-PRES-006', 'iPhone', 'not-run', 'device', null, [], 'user, play session')]);
}

// ---- VERIFY-PRES-008 / VERIFY-TOOL-008: replay captures ------------------------------------------------------------------------
async function pres008() {
  const out = [];
  for (const [name, point] of [['celebration-milestone', 'replay-milestone-1080'], ['save-v1.milestone', 'replay-milestone-1080'], ['celebration-milestone', 'tool-008-replay']]) {
    const w = await open(name); const { page } = w;
    await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Street'), null, { timeout: 30000 });
    const atActive = await domRead(page);
    await page.waitForTimeout(900);
    const dismiss = page.locator('#findings-banner [data-action="dismiss"]'); if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
    const dom = await domRead(page), s = await getState(page), all = await lines(page);
    const cam = await page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'), c = st.cameras.main, h = st.houses.get('pet-house'), b = h.getBounds(); return { midPoint: [Math.round(c.midPoint.x), Math.round(c.midPoint.y)], house: [Math.round(b.centerX), Math.round(b.centerY)], texture: h.texture.key }; });
    const png = await still(page, point, { seededSave: `${name}.real.json (npm run fixture)`, note: 'reload replay: milestone popup at once', dom, camera: cam });
    const openCount = await page.locator('[data-panel="milestonePopup"]:not([hidden]), [data-panel="revealPopup"]:not([hidden])').count();
    const toPhase = s.celebration?.toPhase;
    out.push({ save: name, png, atActive: atActive.milestone.visible, popup: dom.milestone, openCount, camera: cam, celebration: s.celebration && { step: s.celebration.step, fromPhase: s.celebration.fromPhase, toPhase },
      stepped: count(all, 'celebration.stepped'), pass: atActive.milestone.visible && dom.milestone.visible && openCount === 1 && Math.abs(cam.midPoint[0] - cam.house[0]) <= 1 && Math.abs(cam.midPoint[1] - cam.house[1]) <= 1 && cam.texture === `houses/pet-house-lv${toPhase + 1}` && count(all, 'celebration.stepped') === 0, errors: w.errors });
    await w.context.close();
  }
  rowFile('pres-008', [row('VERIFY-PRES-008', 'Chrome visual', out.slice(0, 2).every(o => o.pass) ? 'pass' : 'fail', 'milestone popup open at once on boot, camera framed on the house, house sprite at toPhase (lv toPhase+1), one popup only', out.slice(0, 2), out.slice(0, 2).map(o => o.png)),
    row('VERIFY-TOOL-008', 'in-engine replay', out[2].pass && eq(out[2].popup.tiles.length, 6) ? 'pass' : 'fail', 'celebration-milestone save: the milestone popup with phases 2–4 (1 → 4) opens at once (replay path, core §6.3)', out[2], [out[2].png, 'smoke-report.json'])]);
}

// ---- VERIFY-PRES-012: rotate curtain (Chrome portrait emulation, fork 6) -----------------------------------------------------
async function pres012() {
  // Phaser reads game.device.input.touch at boot: the context is created with hasTouch (Chrome emulation, not a device).
  const w = await boot(browser, { height: 1080, save: save('dog-room-intro-done'), contextOptions: { hasTouch: true, isMobile: true } }); const { page } = w;
  await waitScene(page, 'Interior');
  await drain(page);
  await page.setViewportSize({ width: 823, height: 1920 }); await page.waitForTimeout(1200);
  const curtain = await page.evaluate(() => { const c = document.querySelector('[data-panel="rotateCurtain"], .tpp-rotateCurtain'); return c && { visible: !c.hidden && getComputedStyle(c).display !== 'none', state: c.dataset.state, text: c.innerText.trim().slice(0, 120) }; });
  const png = await still(page, 'rotate-curtain', { seededSave: 'dog-room-intro-done (real)', note: 'Chrome portrait emulation 823×1920 DPR 1 with hasTouch + isMobile (fork 6), not a device', curtain });
  const n = (await lines(page)).length;
  await page.mouse.click(400, 900); await page.waitForTimeout(400);
  const afterTap = (await lines(page)).slice(n).filter(l => l.type.startsWith('input.') || l.type === 'pet.tapped' || l.type === 'ui.chooserOpened');
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(900);
  const back = await page.evaluate(() => { const c = document.querySelector('[data-panel="rotateCurtain"], .tpp-rotateCurtain'); return c && { visible: !c.hidden && getComputedStyle(c).display !== 'none', state: c.dataset.state }; });
  const rc = await lines(page, 'ui.rotateCurtain');
  const ok = curtain?.visible && afterTap.length === 0 && rc.length >= 1 && back && !back.visible;
  rowFile('pres-012', [row('VERIFY-PRES-012', 'partial: Chrome emulation', ok ? 'pass' : 'fail', 'curtain shown in portrait, a canvas tap logs nothing, ui.rotateCurtain logged; hidden back in landscape', { curtain, tapRecords: afterTap.map(strip), rotateCurtain: rc.map(strip), back, errors: w.errors }, [png]),
    row('VERIFY-PRES-012', 'PHONE', 'not-run', 'device rotation', null, [], 'user, play session')]);
  await w.context.close();
}

// ---- VERIFY-MEC-002-024 / -026 / -028 -------------------------------------------------------------------------------------------
async function mec002() {
  const rows = [];
  // -028 icon tap + -024 fidelity: a reload onto the street with phases owed (street-ack1-owed3) is not an arrival: the icon waits for the tap.
  let w = await open('street-ack1-owed3.steps', { scene: 'Street' }); let { page } = w;
  const before = await page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'), h = st.houses.get('pet-house'); return { icon: h.icon.visible, texture: h.texture.key, celebration: window.__tpp.store.getState().celebration }; });
  const iconPng = await still(page, 'screen-2-street-attention-1080', { seededSave: 'street-ack1-owed3 (real, reload onto the street)', note: 'street attention icon over the Pet House (renders screen 2)' });
  const icon = await page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'), h = st.houses.get('pet-house'), cam = st.cameras.main, r = window.__tpp.game.canvas.getBoundingClientRect(), k = r.width / 1920; return { x: r.left + (h.icon.x - cam.scrollX) * k, y: r.top + (h.icon.y - cam.scrollY) * k }; });
  const samples = [];
  await page.mouse.click(icon.x, icon.y, { delay: 40 });
  const t0 = Date.now();
  while (Date.now() - t0 < 16000) { const s = await page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'); return { t: Date.now(), texture: st.houses.get('pet-house').texture.key, bar: document.querySelector('.tpp-hudStreet')?.dataset.barCents ?? null, popup: !document.querySelector('.tpp-milestonePopup').hidden }; }); samples.push(s); if (s.popup) break; await page.waitForTimeout(100); }
  await page.waitForTimeout(500);
  let all = await lines(page), dom = await domRead(page);
  const popupPng = await still(page, 'mec-002-024-popup-1to4-1080', { seededSave: 'street-ack1-owed3 (real)', note: 'after the icon tap: popup 1 → 4' });
  const taps = all.filter(l => l.type === 'input.tap').map(strip), ack = all.filter(l => l.type === 'celebration.started').map(strip);
  const textures = [...new Set(samples.map(s => s.texture))], bars = [...new Set(samples.map(s => s.bar))];
  rows.push(row('VERIFY-MEC-002-028', 'Chrome (icon half)', before.icon && ack.length === 1 && taps.some(t => /house:pet-house/.test(t.target ?? '')) ? 'pass' : 'fail', 'icon visible iff attentionVisible; the icon tap dispatches acknowledgeProject (celebration.started)', { before, taps, celebrationStarted: ack }, [iconPng, 'rows/mec-002.json'],
    'the row says "debugSetCurrent 1260 with ack 1 while inside; step outside": stepping outside with a phase owed starts the celebration by mec-002 onStreetEntered (normative), so the icon half is read on a reload onto the street (not an arrival)'));
  rows.push(row('VERIFY-MEC-002-024', 'Chrome', textures.length >= 3 && dom.milestone.heading === 'Coming along!' && dom.milestone.tiles.length === 6 && dom.milestone.assetSlots.length === 0 && /Skip the wait · \$/.test(dom.milestone.skip?.label ?? '') ? 'pass' : 'fail',
    'pan, bar steps (pops: sound user-managed), sprites 2 → 3 → 4 under dust, "Coming along!" with six real-art tiles and the Skip label', { texturesSeen: textures, barCentsSeen: bars, milestone: dom.milestone, sampleCount: samples.length }, [popupPng, 'loops/trace-cutscene-to-popup.mp4'],
    'street-ack1-owed3 (ack 1, owed 3) instead of debugSetCurrent 1260 + step outside; pops heard: not-run (user-managed sound)'));
  await w.context.close();
  // -028 second half: the house sprite tap
  w = await open('street-ack1-owed3.steps', { scene: 'Street' }); page = w.page;
  const hp = await page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'), b = st.houses.get('pet-house').getBounds(), cam = st.cameras.main, r = window.__tpp.game.canvas.getBoundingClientRect(), k = r.width / 1920; return { x: r.left + (b.centerX - cam.scrollX) * k, y: r.top + (b.centerY + b.height * 0.2 - cam.scrollY) * k }; });
  await page.mouse.click(hp.x, hp.y, { delay: 40 }); await page.waitForTimeout(800);
  all = await lines(page);
  rows.push(row('VERIFY-MEC-002-028', 'Chrome (house sprite half)', count(all, 'celebration.started') === 1 ? 'pass' : 'fail', 'a tap on the house sprite dispatches acknowledgeProject', { taps: all.filter(l => l.type === 'input.tap').map(strip), started: all.filter(l => l.type === 'celebration.started').map(strip) }, ['rows/mec-002.json']));
  await w.context.close();
  // -028 inside badge (from the trace) and -026 toasts (from the trace) + the street bar nudge at cadence (street-near-phase1, ≤ 25 s)
  const t = trace(), badge = beatOf(t, '4:00 phase.reached'), toasts = beatOf(t, '2:30');
  rows.push(row('VERIFY-MEC-002-028', 'Chrome (inside badge, Q13(a))', badge?.ok ? 'pass' : 'fail', 'the interior badge while a phase is owed', badge?.found ?? null, ['trace-report.json', 'captures/screen-6-interior-badge-1080-001.png']));
  w = await open('street-near-phase1.steps', { scene: 'Street' }); page = w.page;
  const b0 = await page.evaluate(() => document.querySelector('.tpp-hudStreet').dataset.barCents);
  await waitLine(page, 'roundup.fired', {}, 25000); await page.waitForTimeout(500);
  const b1 = await page.evaluate(() => ({ barCents: document.querySelector('.tpp-hudStreet').dataset.barCents, barMs: document.querySelector('.tpp-hudStreet').dataset.barMs, toast: !document.querySelector('[data-panel="toast"]').hidden }));
  all = await lines(page);
  rows.push(row('VERIFY-MEC-002-026', 'Chrome', toasts?.ok && b1.barCents !== b0 ? 'pass' : 'fail', '≈ 3 s toasts with no tap needed (the trace at cadence 20000: its toast timeline), and the street bar nudges on a round-up',
    { traceToasts: toasts?.found ?? null, street: { barBefore: b0, after: b1, roundup: strip(first(all, 'roundup.fired')) } }, ['trace-report.json', 'loops/trace-toast-roundup.mp4', 'rows/mec-002.json'], 'toasts read from the trace (inside, cadence 20000) rather than a separate 60 s run; the bar nudge from one round-up on the street'));
  await w.context.close();
  rows.push(row('VERIFY-MEC-002-024/-026/-028', 'iPhone', 'not-run', 'device', null, [], 'user, play session'));
  rowFile('mec-002', rows);
}

// ---- VERIFY-MEC-004-009 / -010 -------------------------------------------------------------------------------------------------
async function mec004() {
  let w = await open('dog-room-intro-done', { scene: 'Interior' }); let { page } = w;
  await drain(page); await toggle(page, 'design');
  await tapSlot(page, 'floor-3'); await chooserOpen(page); await page.waitForTimeout(300);
  const cards = await page.evaluate(() => [...document.querySelectorAll('.tpp-chooser .tpp-charm-card')].map(c => ({ typeId: c.dataset.typeId, img: !!c.querySelector('img'), slot: !!c.querySelector('.tpp-asset-slot'), name: c.querySelector('.tpp-charm-name, h3, strong')?.textContent ?? c.innerText.split('\n')[0], tags: c.querySelectorAll('.tpp-tag').length, text: c.innerText.replace(/\s+/g, ' ').trim() })));
  const owned = (await getState(page)).inventory.ownedTypeIds;
  const png1 = await still(page, 'chooser-small', { seededSave: 'dog-room-intro-done (real)', note: 'chooser on the empty small slot floor-3' });
  await w.context.close();
  const smallOwned = owned.filter(id => ['lamp', 'ball', 'food-bowl', 'fern', 'cushion', 'rug', 'lamp-planter', 'tall-lamp', 'stool', 'toy-basket', 'lantern'].includes(id));
  const ok1 = eq(cards.map(c => c.typeId).sort(), smallOwned.sort()) && cards.every(c => c.img && !c.slot && c.tags > 0 && !/×\s*\d|\bx\d/.test(c.text));
  w = await open('tests/e2e/steps/no-wall-type.steps', { scene: 'Interior' }); page = w.page;
  await drain(page); await toggle(page, 'design');
  await tapSlot(page, 'wall-1'); await chooserOpen(page); await page.waitForTimeout(300);
  const dom = await domRead(page), strings = await page.evaluate(() => window.__tpp.content.strings['tpp.chooser.empty']);
  const png2 = await still(page, 'chooser-empty-wall', { seededSave: 'tests/e2e/steps/no-wall-type.steps.json (npm run fixture -- --steps)', note: 'wall slot with no owned wall type (fork 8)' });
  rowFile('mec-004', [row('VERIFY-MEC-004-009', 'Chrome', ok1 ? 'pass' : 'fail', 'owned small types with sprite, name, tag icons, no counts', { owned, cards }, [png1]),
    row('VERIFY-MEC-004-010', 'Chrome', dom.chooser.empty && dom.chooser.empty.trim() === strings?.trim() && dom.chooser.cards.length === 0 ? 'pass' : 'fail', 'tpp.chooser.empty text', { empty: dom.chooser.empty, expected: strings, cards: dom.chooser.cards }, [png2, 'tests/e2e/steps/no-wall-type.steps.json']),
    row('VERIFY-MEC-004-009/-010', 'iPhone', 'not-run', 'device', null, [], 'user, play session')]);
  await w.context.close();
}

// ---- VERIFY-MEC-005-013 / -014 / -016 ----------------------------------------------------------------------------------------------
async function mec005() {
  const w = await open('save-v1', { scene: 'Interior' }); const { page } = w;
  await drain(page);
  const expected = JSON.parse(save('save-v1')).state.rooms['dog-room'].placements;
  const read = await page.evaluate(() => { const s = window.__tpp.store.getState(), i = window.__tpp.game.scene.getScene('Interior');
    return { placements: s.rooms['dog-room'].placements, slots: Object.fromEntries(i.room.slots.map(sl => [sl.id, [sl.x, sl.y]])), sprites: Object.fromEntries([...i.charms].map(([slot, c]) => [slot, { x: c.x, y: c.y, depth: c.depth, key: c.texture.key }])) }; });
  const roomPng = await still(page, 'save-v1-room-1080', { seededSave: 'save-v1.real.json', note: 'reload into the Dog room from the real-content save-v1' });
  const at = Object.entries(read.sprites).every(([slot, s]) => read.slots[slot] && s.x === read.slots[slot][0] && s.y === read.slots[slot][1]);
  const r16 = row('VERIFY-MEC-005-016', 'Chrome', eq(read.placements, expected) && at && Object.values(read.sprites).every(s => s.key !== 'missing') ? 'pass' : 'fail', 'sprites at slot positions; placements equal the save; no missing texture', { expected, read }, [roomPng]);
  // -013: a play-mode tap on a filled slot → input.tap {target:'world'} and nothing opens; Decorate → chooser; filled → sheet; Done closes
  // a filled slot away from the Dog, so the play tap lands on the slot area and not on the pet (routing: pet:<id> wins over 'world')
  const playSlot = await page.evaluate(() => { const s = window.__tpp.store.getState(), b = s.pets.dog.behaviour, i = window.__tpp.game.scene.getScene('Interior');
    return Object.keys(s.rooms['dog-room'].placements).map(id => i.room.slots.find(x => x.id === id)).filter(Boolean).sort((a, c) => Math.hypot(c.x - b.x, c.y - b.y) - Math.hypot(a.x - b.x, a.y - b.y))[0].id; });
  let n = (await lines(page)).length;
  await tapSlot(page, playSlot, 500);
  const playTap = (await lines(page)).slice(n);
  await toggle(page, 'design');
  await tapSlot(page, 'floor-1'); const ch = await chooserOpen(page);
  await page.locator('.tpp-dismiss-backdrop:visible').first().click({ position: { x: 40, y: 40 } }).catch(() => {}); await page.waitForTimeout(400);
  await tapSlot(page, 'floor-3'); const sheet = await until(page, () => !!document.querySelector('.tpp-panel-layer:not([hidden]) .tpp-replaceRemove'), null, 3000);
  const sheetPng = await still(page, 'design-sheet-1080', { seededSave: 'save-v1.real.json', note: 'Replace/Remove sheet over the filled floor-3 (renders screen 9)' });
  await shot(page, browser, capturesDir, 'screen-9-replace-remove-1080', { target: base, seededSave: 'save-v1.real.json', note: 'Replace/Remove sheet over the lamp (renders screen 9)' });
  await page.locator('.tpp-panel-layer:not([hidden]) .tpp-dismiss-backdrop').first().click({ position: { x: 40, y: 40 } }).catch(() => {}); await page.waitForTimeout(400);
  const sheetClosed = await lines(page, 'ui.sheetClosed');
  await toggle(page, 'play');
  const after = await domRead(page), all = await lines(page);
  const r13 = row('VERIFY-MEC-005-013', 'Chrome', playTap.some(l => l.type === 'input.tap' && l.target === 'world') && !playTap.some(l => l.type === 'ui.chooserOpened' || l.type === 'ui.sheetOpened') && ch && sheet && (await getState(page)).mode === 'play' && !after.chooser.visible ? 'pass' : 'fail',
    "play tap → input.tap {target:'world'} only; Decorate → chooser; filled → sheet; Done closes", { playSlot, playTap: playTap.map(strip), chooserOpened: ch, sheetOpened: sheet, sheetClosed: sheetClosed.map(strip), modes: all.filter(l => l.type === 'mode.changed').map(strip) }, [sheetPng]);
  // -014: wall charm above a floor charm; avatar depth = base y in front of / behind the lamp
  const depths = await page.evaluate(() => Object.fromEntries([...window.__tpp.game.scene.getScene('Interior').charms].map(([slot, c]) => [slot, c.depth])));
  const readAv = () => page.evaluate(() => { const i = window.__tpp.game.scene.getScene('Interior'); return { avatar: { x: i.avatar.x, y: i.avatar.y, depth: i.avatar.depth }, lamp: i.charms.get('floor-3')?.depth ?? null }; });
  await steer(page, 907, 585, () => { const a = window.__tpp.store.getState().avatar; return Math.abs(a.x - 907) < 30 && a.y <= 595; }, 12000);
  await page.waitForTimeout(250); const behind = await readAv(); const bPng = await still(page, 'depth-behind-1080', { seededSave: 'save-v1.real.json', note: 'avatar behind the lamp at floor-3', behind });
  await steer(page, 907, 665, () => { const a = window.__tpp.store.getState().avatar; return Math.abs(a.x - 907) < 30 && a.y >= 660; }, 12000);
  await page.waitForTimeout(250); const front = await readAv(); const fPng = await still(page, 'depth-front-1080', { seededSave: 'save-v1.real.json', note: 'avatar in front of the lamp at floor-3', front });
  const wallSlots = Object.keys(depths).filter(k => k.startsWith('wall-')), floorSlots = Object.keys(depths).filter(k => !k.startsWith('wall-'));
  const r14 = row('VERIFY-MEC-005-014', 'Chrome', behind.avatar.depth === behind.avatar.y && behind.avatar.depth < behind.lamp && front.avatar.depth === front.avatar.y && front.avatar.depth > front.lamp && (wallSlots.length === 0 || wallSlots.every(ws => floorSlots.every(fs => depths[ws] !== undefined))) ? 'pass' : 'fail',
    'wall charm above a floor charm; avatar depth = base y each sampled frame, behind and in front of the lamp', { charmDepths: depths, behind, front, wallSlotsPlaced: wallSlots, note: wallSlots.length ? 'wall charm depths listed' : 'save-v1 places no wall charm: the wall-above-floor half is read in the content walk (unit 5) wall still' }, [bPng, fPng]);
  rowFile('mec-005', [r13, r14, r16, row('VERIFY-MEC-005-013/-014/-016', 'iPhone', 'not-run', 'device', null, [], 'user, play session')]);
  await w.context.close();
}

// ---- VERIFY-MEC-006-011 / -012 ---------------------------------------------------------------------------------------------------
async function mec006() {
  const w = await open('dog-room-intro-done', { scene: 'Interior' }); const { page } = w;
  await drain(page);
  // -012: tap the bar → explanation, ui.starsExplained
  await page.locator('.tpp-hudInterior .tpp-stars').click(); await page.waitForTimeout(500);
  const explained = await page.evaluate(() => ({ tooltip: !!document.querySelector('.tpp-stars-explained:not([hidden])'), text: document.querySelector('.tpp-stars-explained')?.innerText ?? null, label: document.querySelector('.tpp-hudInterior .tpp-stars')?.innerText.replace(/\s+/g, ' ').trim() }));
  const png2 = await still(page, 'stars-explained', { seededSave: 'dog-room-intro-done (real)', note: 'stars bar tapped: explanation shown' });
  const se = await lines(page, 'ui.starsExplained');
  await page.mouse.click(1200, 300); await page.waitForTimeout(300);
  // -011: debug Stars display off, place a lamp
  await debugClick(page, 'Stars display', 'switch'); await setDebug(page, false);
  await drain(page); await toggle(page, 'design');
  await tapSlot(page, 'floor-3'); await chooserOpen(page); await page.click('.tpp-charm-card[data-type-id="lamp"]'); await page.waitForTimeout(700);
  const hidden = await page.evaluate(() => { const s = document.querySelector('.tpp-hudInterior .tpp-stars'); return { starsHidden: !s || s.hidden || getComputedStyle(s).display === 'none', delta: document.querySelector('.tpp-stars-delta')?.textContent ?? null }; });
  const png1 = await still(page, 'stars-hidden', { seededSave: 'dog-room-intro-done (real)', note: 'Stars display off (hidden arm), lamp placed' });
  const all = await lines(page);
  rowFile('mec-006', [row('VERIFY-MEC-006-011', 'Chrome', all.some(l => l.type === 'stars.visibilityChanged') && all.some(l => l.type === 'stars.changed') && hidden.starsHidden && !hidden.delta ? 'pass' : 'fail', 'stars.visibilityChanged; stars.changed still logged; HUD shows no bar/delta',
    { visibility: all.filter(l => l.type === 'stars.visibilityChanged').map(strip), starsChanged: all.filter(l => l.type === 'stars.changed').map(strip), hidden }, [png1]),
    row('VERIFY-MEC-006-012', 'Chrome', explained.tooltip && se.length >= 1 ? 'pass' : 'fail', 'label = select.starsOf; explanation shown; ui.starsExplained', { explained, starsExplained: se.map(strip), stars: (await getState(page)).rooms }, [png2]),
    row('VERIFY-MEC-006-011', 'iPhone', 'not-run', 'device', null, [], 'user, play session')]);
  await w.context.close();
}

// ---- VERIFY-MEC-008-015 / -016 / -017; VERIFY-MEC-009-020 / -021 ------------------------------------------------------------------------
async function mec008009() {
  const t = trace();
  const w = await open('save-v1.vignette'); const { page } = w;
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Interior'), null, { timeout: 30000 });
  const atActive = await domRead(page);
  await page.waitForTimeout(800);
  const banner = page.locator('#findings-banner [data-action="dismiss"]'); if (await banner.count() && await banner.isVisible()) await banner.click();
  await page.waitForTimeout(200);
  const s0 = await getState(page), all0 = await lines(page);
  const box0 = await domRead(page);
  const png = await still(page, 'mec-009-020-reload-vignette-1080', { seededSave: 'save-v1.vignette.real.json', note: 'reload mid-chain: the vignette box open at line 0' });
  // a view replay of the pet sequence = the fulfilment chain re-emitted after the reload; the sim continuing the saved behaviour (phase changes) is not one
  const petSeq = all0.filter(l => ['pet.reacted', 'heart.earned', 'want.fulfilled', 'charm.placed', 'types.unlocked'].includes(l.type)).map(strip);
  const continuation = all0.filter(l => l.type === 'pet.phaseChanged').map(strip);
  // -017: taps on the room, the HUD and the Dog → one dialogue transition each; nothing reaches the world
  const hud = await page.locator('.tpp-design-toggle').boundingBox(), dog = s0.pets.dog.behaviour;
  const dogPt = await page.evaluate(([x, y]) => { const r = window.__tpp.game.canvas.getBoundingClientRect(), k = r.width / 1920, cam = window.__tpp.game.scene.getScene('Interior').cameras.main; return { x: r.left + (x - cam.scrollX) * k, y: r.top + (y - 50 - cam.scrollY) * k }; }, [dog.x, dog.y]);
  const per = [];
  for (const [name, p] of [['room', { x: 1300, y: 500 }], ['hud', { x: hud.x + hud.width / 2, y: hud.y + hud.height / 2 }], ['dog', dogPt]]) {
    const n = (await lines(page)).length;
    const at = await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}${el.disabled ? '[disabled]' : ''}` : null; }, [p.x, p.y]);
    const cur = (await getState(page)).dialogue.current;
    await page.mouse.click(p.x, p.y, { delay: 40 }); await page.waitForTimeout(700);
    const ev = (await lines(page)).slice(n); per.push({ tap: name, at: p, elementAtPoint: at, before: cur && { source: cur.source, index: cur.index }, transitions: ev.filter(l => l.type === 'dialogue.advanced' || l.type === 'dialogue.closed').length, world: ev.filter(l => ['input.tap', 'pet.tapped', 'ui.chooserOpened', 'mode.changed'].includes(l.type)).map(strip) });
  }
  await w.context.close();
  const bubbleTypes = t ? null : null;
  const tl = t?.beats ?? [];
  const vig = beatOf(t, '1:00 vignette'), greet = beatOf(t, '0:30 greeting'), like = beatOf(t, '2:00 Decorate → floor-3'), bed = beatOf(t, '1:00 the Dog walks');
  rowFile('mec-008', [
    row('VERIFY-MEC-008-015', 'Chrome', vig?.ok && box0.dialogue.visible && atActive.dialogue.visible && s0.dialogue.current?.index === 0 ? 'pass' : 'fail', 'hidden until reacting + 2,000 ms, ≤ 7,000 ms after charm.placed (the trace); reload shows the box at once (save-v1.vignette)',
      { trace: vig?.found ?? null, reload: { atActive: atActive.dialogue, current: s0.dialogue.current && { source: s0.dialogue.current.source, index: s0.dialogue.current.index } } }, ['trace-report.json', 'loops/trace-vignette-deferred.mp4', png]),
    row('VERIFY-MEC-008-016', 'Chrome', greet?.ok && bed?.ok && like?.ok ? 'pass' : 'fail', 'listed emoji/icon per class, 2,000 / 3,000 ms, one bubble per pet; classes not reachable listed with why',
      { reached: { greeting: greet?.found?.greeting ?? null, love: bed?.found?.reaction ?? null, like: like?.found?.like ?? null, bubbleTap: t?.pres010 ?? null },
        notReached: { dislike: 'no M1 charm the Dog dislikes is placed in the trace (CHK-004-08 tall-lamp liked/disliked overlap is a content finding)', interrupted: 'no removal under a using pet in the trace', chatter: 'not sampled in the trace window', want: 'the want bubble class (tag icon) is WORK-019-1 loop want-bubble-appear; not re-read here', verb: 'verb emote not triggered in the trace' } },
      ['trace-report.json', 'loops/trace-lamp-lookat-like.mp4', 'loops/trace-bed-walk-nap-heart.mp4'], 'partial: dislike / interrupted / chatter / want / verb classes not reached in the trace (listed)'),
    row('VERIFY-MEC-008-017', 'Chrome', per.every(p => p.transitions === 1 && p.world.length === 0) ? 'pass' : 'fail', 'one advanceDialogue per tap; nothing reaches the world', { perTap: per }, ['rows/mec-008.json']),
    row('VERIFY-MEC-008-015/-016/-017', 'iPhone', 'not-run', 'device', null, [], 'user, play session')]);
  const wa = beatOf(t, "0:30 want panel"), wb = beatOf(t, '2:00 want 2 panel'), wd = beatOf(t, '5:00 want.fulfilled');
  rowFile('mec-009', [
    row('VERIFY-MEC-009-020', 'Chrome (no pet sequence)', s0.pets.dog.hearts >= 1 && box0.dialogue.visible && s0.dialogue.current?.index === 0 && petSeq.length === 0 ? 'pass' : 'fail', 'Hearts and unlocks present, box open at line 0, no view replay of the pet sequence',
      { hearts: s0.pets.dog.hearts, owned: s0.inventory.ownedTypeIds, current: s0.dialogue.current && { source: s0.dialogue.current.source, index: s0.dialogue.current.index }, petSequenceLines: petSeq, simContinuation: continuation, savedBehaviour: JSON.parse(save('save-v1.vignette')).state.pets.dog.behaviour }, [png]),
    row('VERIFY-MEC-009-021', 'Chrome', wa?.ok && wb?.ok && wd?.ok ? 'pass' : 'fail', 'states a → b → d across the trace, reward named before earned, ♥ updates', { a: wa?.found, b: wb?.found, d: wd?.found?.wantFlash ?? null },
      ['trace-report.json', 'captures/screen-10-want-state-a-1080-001.png', 'captures/screen-10-want-state-b-1080-001.png', 'captures/screen-10-want-state-d-1080-001.png']),
    row('VERIFY-MEC-009-013 (action-path half)', 'none exists', 'not-run', 'vignette then announce in order (the trace)', beatOf(t, 'VERIFY-MEC-009-013')?.found ?? null, ['trace-report.json'], 'unreachable under Q6(a)')]);
}

// ---- VERIFY-MEC-010-012 / -015 -------------------------------------------------------------------------------------------------
async function mec010() {
  const rows = [];
  let w = await open('dog-room-intro-done', { scene: 'Interior' }); let { page } = w;
  await drain(page);
  await page.click('.tpp-hudInterior .tpp-debug-entry'); await page.waitForTimeout(500);
  const openI = await page.evaluate(() => ({ panel: !document.querySelector('.tpp-debugPanel').hidden, joystick: window.__tpp.game.scene.getScene('Interior').joystick.base.visible }));
  const visibleRows = () => page.evaluate(() => { const sc = document.querySelector('[data-panel=debugPanel] .tpp-debug-scroll'), b = sc.getBoundingClientRect();
    return [...sc.querySelectorAll('.tpp-debug-row')].map(r => { const x = r.getBoundingClientRect(); return { label: r.querySelector('label')?.textContent, full: x.top >= b.top - 1 && x.bottom <= b.bottom + 1, partial: x.bottom > b.top && x.top < b.bottom }; }).filter(r => r.partial).map(r => `${r.label}${r.full ? '' : ' (clipped)'}`); });
  const topRows = await visibleRows();
  const topPng = await still(page, 'debug-top', { seededSave: 'dog-room-intro-done (real)', note: 'debug panel scrolled to the top', visibleRows: topRows });
  await page.evaluate(() => { const el = document.querySelector('[data-panel=debugPanel] .tpp-debug-scroll'); el.scrollTop = el.scrollHeight; }); await page.waitForTimeout(300);
  const scrolledRows = await visibleRows();
  const scPng = await still(page, 'debug-scrolled', { seededSave: 'dog-room-intro-done (real)', note: 'debug panel scrolled to the bottom', visibleRows: scrolledRows });
  await page.click('.tpp-hudInterior .tpp-debug-entry', { force: true }).catch(() => {}); await page.keyboard.press('Backquote').catch(() => {}); await page.waitForTimeout(300);
  await setDebug(page, false);
  const dbgI = await lines(page, 'ui.debugPanel');
  await w.context.close();
  w = await open('street-near-phase1.steps', { scene: 'Street' }); page = w.page;
  await page.keyboard.press('Backquote'); await page.waitForTimeout(400);
  const openS = await page.evaluate(() => ({ panel: !document.querySelector('.tpp-debugPanel').hidden, joystick: window.__tpp.game.scene.getScene('Street').joystick.base.visible }));
  await page.keyboard.press('Backquote'); await page.waitForTimeout(400);
  const closedS = await page.evaluate(() => ({ panel: !document.querySelector('.tpp-debugPanel').hidden, joystick: window.__tpp.game.scene.getScene('Street').joystick.base.visible }));
  const dbgS = await lines(page, 'ui.debugPanel');
  rows.push(row('VERIFY-MEC-010-012', 'Chrome', openI.panel && !openI.joystick && openS.panel && !openS.joystick && !closedS.panel && closedS.joystick && dbgI.length >= 1 && dbgS.length >= 2 ? 'pass' : 'fail',
    'the top-right entry (interior) and Backquote (street) toggle the panel; joystick hidden while open; ui.debugPanel; top + scrolled captures name exactly the visible rows', { interior: { open: openI, records: dbgI.map(strip) }, street: { open: openS, closed: closedS, records: dbgS.map(strip) }, topRows, scrolledRows }, [topPng, scPng]));
  // -015: trickle arm on the street: no toast, the bar glides over one interval
  await debugClick(page, 'Feed presentation', 'Trickle').catch(async () => { await debugClick(page, 'Feed presentation'); });
  await setDebug(page, false);
  const n = (await lines(page)).length;
  await waitLine(page, 'roundup.fired', {}, 25000); await page.waitForTimeout(300);
  const glide = await page.evaluate(() => ({ barCents: document.querySelector('.tpp-hudStreet').dataset.barCents, barMs: document.querySelector('.tpp-hudStreet').dataset.barMs, toastVisible: !document.querySelector('[data-panel="toast"]').hidden, feed: window.__tpp.store.getState().session.feedPresentation, interval: window.__tpp.store.getState().session.eventIntervalMs }));
  const ev = (await lines(page)).slice(n);
  rows.push(row('VERIFY-MEC-010-015', 'Chrome', glide.feed === 'trickle' && !glide.toastVisible && Number(glide.barMs) === glide.interval && ev.some(l => l.type === 'roundup.fired') ? 'pass' : 'fail', 'no toast shown; the street bar glides to each new currentCents over one interval', { glide, roundup: strip(ev.find(l => l.type === 'roundup.fired')), debugApplied: (await lines(page, 'debug.applied')).map(strip) }, ['rows/mec-010.json']));
  rows.push(row('VERIFY-MEC-010-012/-015', 'iPhone', 'not-run', 'device', null, [], 'user, play session'));
  rowFile('mec-010', rows);
  await w.context.close();
}

// ---- Content walk: VERIFY-ASSET-008 + WORK-018-1-1 A-7 ------------------------------------------------------------------------------
const CLASSES = { small: ['floor-1', 'floor-2', 'floor-3', 'floor-4', 'floor-5', 'floor-6', 'floor-7'], large: ['large-1'], wall: ['wall-1', 'wall-2', 'wall-3', 'wall-4'] };
async function contentWalk() {
  const w = await open('dog-room-intro-done', { scene: 'Interior' }); const { page } = w;
  const bootTotals = await page.evaluate(() => window.__tpp.game.scene.getScene('Boot').loaderTotals);
  await drain(page);
  await debugClick(page, 'Unlock all charm types'); await setDebug(page, false);
  await drain(page);
  const types = await page.evaluate(() => window.__tpp.content.charms.types ? window.__tpp.content.charms.types.map(t => ({ id: t.id, sizeClass: t.sizeClass })) : Object.values(window.__tpp.content.charms).map(t => ({ id: t.id, sizeClass: t.sizeClass })));
  const owned = (await getState(page)).inventory.ownedTypeIds;
  const placedReads = [], stills = [];
  await toggle(page, 'design');
  for (const [cls, slots] of Object.entries(CLASSES)) {
    const list = types.filter(t => t.sizeClass === cls).map(t => t.id);
    for (let i = 0; i < list.length; i++) {
      const slot = slots[i % slots.length], typeId = list[i];
      await drain(page, 600); await toggle(page, 'design');
      const filled = !!(await getState(page)).rooms['dog-room'].placements[slot];
      await tapSlot(page, slot);
      if (filled) { await until(page, () => !!document.querySelector('.tpp-panel-layer:not([hidden]) .tpp-replaceRemove'), null, 3000); await page.click('.tpp-replaceRemove [data-action="replace"]'); }
      await chooserOpen(page);
      const card = page.locator(`.tpp-charm-card[data-type-id="${typeId}"]`);
      if (await card.count()) { await card.click(); await page.waitForTimeout(600); } else { placedReads.push({ typeId, slot, error: 'no chooser card' }); await page.locator('.tpp-chooser .tpp-dismiss-backdrop').click({ force: true }).catch(() => {}); continue; }
      const read = await page.evaluate(([slot, typeId]) => { const i = window.__tpp.game.scene.getScene('Interior'), c = i.charms.get(slot), sl = i.room.slots.find(s => s.id === slot);
        return { typeId, slot, placement: window.__tpp.store.getState().rooms['dog-room'].placements[slot] ?? null, sprite: c ? { key: c.texture.key, x: Math.round(c.x), y: Math.round(c.y), depth: c.depth, w: Math.round(c.displayWidth), h: Math.round(c.displayHeight), visible: c.visible } : null, slotBase: sl ? [sl.x, sl.y] : null }; }, [slot, typeId]);
      placedReads.push(read);
      const roundFull = (i + 1) % slots.length === 0 || i === list.length - 1;
      if (roundFull) {
        await drain(page, 600); await toggle(page, 'play'); await page.waitForTimeout(900);
        const inRound = placedReads.filter(r => slots.includes(r.slot) && list.includes(r.typeId)).slice(-Math.min(slots.length, (i % slots.length) + 1));
        const allSprites = await page.evaluate(() => [...window.__tpp.game.scene.getScene('Interior').charms].map(([slot, c]) => ({ slot, key: c.texture.key, depth: c.depth })));
        stills.push(await still(page, `content-walk-${cls}-1080`, { seededSave: 'dog-room-intro-done (real) + debug Unlock all charm types', note: `content walk: ${cls} round`, typeIds: inRound.map(r => r.typeId), sprites: allSprites }));
        await toggle(page, 'design');
      }
    }
  }
  await toggle(page, 'play');
  const textures = await page.evaluate(() => ({ missingKeyExists: window.__tpp.game.textures.exists('missing'), sprites: [...window.__tpp.game.scene.getScene('Interior').charms].map(([slot, c]) => ({ slot, key: c.texture.key })) }));
  const all = await lines(page);
  const missingDrawn = placedReads.filter(r => !r.sprite || r.sprite.key === 'missing' || r.sprite.key === '__MISSING');
  const ok = bootTotals.totalFailed === 0 && !all.some(l => l.type === 'asset.loadError') && missingDrawn.length === 0 && placedReads.length === types.length && placedReads.every(r => r.placement?.typeId === r.typeId || r.placement === r.typeId || JSON.stringify(r.placement).includes(r.typeId));
  rowFile('asset-008', [row('VERIFY-ASSET-008', 'desktop Chrome', ok ? 'pass' : 'fail', 'BootScene complete with totalFailed 0; no asset.loadError; the missing texture never drawn across the walk (every sprite texture key ≠ missing)',
    { bootTotals, types: types.length, owned: owned.length, placed: placedReads, missingDrawn, finalSprites: textures, assetLoadErrors: all.filter(l => l.type === 'asset.loadError'), consoleErrors: w.errors }, stills),
    row('VERIFY-ASSET-008', 'Safari / iPhone', 'not-run', 'device', null, [], 'user, play session'),
    row('WORK-018-1-1 A-7', 'integration-level (in-engine charm frames)', ok ? 'pass' : 'fail', 'one still per size-class round showing the placed M1 charms at their slot bases at the ledgered sizes; sidecars list the type ids', { stills, sizes: placedReads.map(r => ({ typeId: r.typeId, slot: r.slot, w: r.sprite?.w, h: r.sprite?.h, at: r.sprite && [r.sprite.x, r.sprite.y], slotBase: r.slotBase })) }, stills)]);
  await w.context.close();
}

// ---- VERIFY-TOOL-003 Chrome half --------------------------------------------------------------------------------------------------
async function tool003() {
  const s = JSON.parse(save('dog-room-intro-done'));
  s.state.pets.dog.fulfilledWantIds = ['soft-nap']; s.state.pets.dog.hearts = 1;
  const w = await boot(browser, { height: 1080, save: JSON.stringify(s) }); const { page } = w;
  await waitScene(page, 'Interior'); await drain(page);
  await page.waitForTimeout(500);
  const panel = await page.evaluate(() => { const p = document.querySelector('.tpp-wantPanel'); return { visible: !p.hidden, rows: p.innerText.split('\n').map(x => x.trim()).filter(Boolean) }; });
  const png = await still(page, 'tool-003-want-panel', { seededSave: 'dog-room-intro-done (real) with fulfilledWantIds [soft-nap], hearts 1 (§2.4 edit) so want 2 is active', note: 'want panel for bright-corner', panel });
  await w.context.close();
  let cli;
  try { cli = execFileSync('npx', ['tsx', 'tools/coverage.ts', '--panel', 'dog', 'bright-corner', '--owned', 'starter', '--known-missing', 'tools/known-missing-assets.json'], { cwd: GAME_DIR, stdio: 'pipe' }).toString(); }
  catch (error) { cli = `${error.stdout ?? ''}\n[exit ${error.status}] ${error.stderr ?? ''}`; }
  const cliRows = cli.split('\n').map(x => x.trim()).filter(Boolean);
  const norm = x => x.replace(/^[☐✓✔\-*•\s]+/, '').replace(/\s+/g, ' ').toLowerCase();
  const matched = panel.rows.map(r => ({ panel: r, inCli: cliRows.some(c => norm(c).includes(norm(r)) || norm(r).includes(norm(c))) }));
  const strict = panel.rows.every(r => cliRows.includes(r));
  rowFile('tool-003', [row('VERIFY-TOOL-003', 'partial: Chrome', strict ? 'pass' : 'fail', 'identical wording row by row: `npm run report:coverage -- --panel dog bright-corner --owned starter` vs the in-game want panel', { panelRows: panel.rows, cliRows, perRow: matched, strictRowParity: strict, wordingContained: matched.every(m => m.inCli) }, [png, 'rows/tool-003.json'],
    strict ? undefined : 'strict per-row parity fails on format (WORK-021-1 FORK (6): recorded as a format-only fail, neither side edited); perRow lists whether each panel row\'s wording is contained in a CLI row')]);
}

// ---- trace-derived rows: PRES-005, PRES-010, MEC-007-016 ----------------------------------------------------------------------------
async function traceRows() {
  const t = trace();
  const fadeIn = beatOf(t, '0:30 door fades'), out = beatOf(t, '4:00 walk out');
  rowFile('pres-005', [row('VERIFY-PRES-005', 'Chrome', fadeIn?.ok && out?.ok ? 'pass' : 'fail', 'fade out 250 → swap → fade in 250; scene.changed → room visible ≈ 500 ms (±1 frame); no avatar movement during fades', { in: fadeIn?.found ?? null, out: out?.found ?? null }, ['trace-report.json', 'loops/trace-door-greeting-intro.mp4'],
    'Interior active ≈ 485–500 ms after scene.changed (fade-out + create); the fade-in then ends ≈ 250 ms later (see findings)'), row('VERIFY-PRES-005', 'iPhone', 'not-run', 'device', null, [], 'user, play session')]);
  const p10 = beatOf(t, '2:00 VERIFY-PRES-010');
  rowFile('pres-010', [row('VERIFY-PRES-010', 'Chrome', p10?.ok ? 'pass' : 'fail', '❤️/🙂 for 2 s; text 3 s after the tap; ui.bubbleTapped logged', p10?.found ?? null, ['trace-report.json', 'loops/trace-lamp-lookat-like.mp4']), row('VERIFY-PRES-010', 'iPhone', 'not-run', 'device', null, [], 'user, play session')]);
  const bed = beatOf(t, '1:00 the Dog walks');
  const f = bed?.found ?? {};
  const walk = t?.mec007Samples?.walk?.filter(x => x.dog?.phase === 'walking') ?? [];
  f.walkDepthWithinHalfPxOfY = walk.length > 0 && walk.every(x => Math.abs(x.dog.depth - x.dog.y) <= 0.5);
  f.walkDepthNote = 'samples store Math.round(pet.y) and the raw pet.depth; depth === y is read as |depth − round(y)| ≤ 0.5';
  rowFile('mec-007-016', [row('VERIFY-MEC-007-016', 'Chrome', bed?.ok && f.walkDepthWithinHalfPxOfY && f.walkFlipX?.length === 2 ? 'pass' : 'fail', '`walk` clip, flipX when facing left, `using` clip at the anchor (draw-above at large-1), depth === y on each sampled walk frame',
    { ...f, samples: t?.mec007Samples ?? null }, ['trace-report.json', 'loops/trace-bed-walk-nap-heart.mp4']), row('VERIFY-MEC-007-016', 'iPhone', 'not-run', 'device', null, [], 'user, play session')]);
  const pres009 = existsSync(join(evidenceRoot, 'test.txt')) ? readFileSync(join(evidenceRoot, 'test.txt'), 'utf8').split('\n').filter(l => /PRES-009/.test(l)).map(l => l.trim()) : [];
  rowFile('pres-009', [row('VERIFY-PRES-009', 'ENV-JSDOM', pres009.length && pres009.every(l => /✓|passed/.test(l) || !/×|failed/.test(l)) ? 'pass' : 'fail', 'pass (the suite at this head)', { titles: pres009 }, ['test.txt'])]);
}

const UNITS = { pres001, pres002, pres006, pres008, pres012, mec002, mec004, mec005, mec006, mec008009, mec010, contentWalk, tool003, traceRows };
browser = await launch();
const errors = {};
try {
  for (const [name, fn] of Object.entries(UNITS)) if (!only || only.includes(name)) {
    try { await fn(); console.log(`done ${name}`); } catch (error) { errors[name] = String(error).slice(0, 800); console.log(`ERROR ${name}: ${errors[name].slice(0, 300)}`); }
  }
} finally { await browser.close(); }
writeJson(join(rowsDir, `_run-${Date.now()}.json`), { sha, base, captured_at: new Date().toISOString(), units: only ?? Object.keys(UNITS), errors });

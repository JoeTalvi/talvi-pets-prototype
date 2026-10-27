// WORK-023-3 W-M2 rows + the M1 rows the M2 code touches, on the lane head (Playwright library, chromium-1243 by executablePath; no install).
//   TPP_BASE=http://127.0.0.1:5207 TPP_EVIDENCE=<EV> TPP_WORK=WORK-023-3 TPP_MILESTONE=MILESTONE-006 node tests/e2e/m2-rows.mjs
// Reads <EV>/trace-report.json (m2-trace.mjs) for the trace-path rows; measures VERIFY-PRES-007's second path (ack-phase-4 + debug "Set current progress" 1500 + icon)
// and VERIFY-PRES-008 (reload at the milestone popup) live. Strict boot. Writes <EV>/rows/*.json; exit 0 iff every gated row passes.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { evidenceRoot, sha, launch, boot, waitScene, lines, getState, count, until, debugClick, setDebug, domRead, writeJson, shot, WORK } from './lib/harness.mjs';

const EV = evidenceRoot, rowsDir = join(EV, 'rows');
const trace = JSON.parse(readFileSync(join(EV, 'trace-report.json'), 'utf8'));
const B = re => trace.beats.find(b => re.test(b.beat)) ?? null;
const IPHONE = 'not-run (user, MILESTONE-007)', SOUND = 'not-run (user-managed sound)', ANDROID = 'recorded, not gated';
const src = { trace: join(EV, 'trace-report.json'), log: join(EV, 'trace-log.jsonl') };
const rows = {};
const put = (file, row) => { rows[file] = row; writeJson(join(rowsDir, file), { work: WORK, sha, traceSha: trace.sha, source: src, iphone: IPHONE, android: ANDROID, ...row }); };

async function tapIcon(page) {
  await until(page, () => window.__tpp.game.scene.getScene('Street').houses.get('pet-house').icon.visible, null, 5000);
  const p = await page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'), h = st.houses.get('pet-house'), cam = st.cameras.main, r = window.__tpp.game.canvas.getBoundingClientRect(), k = r.width / 1920;
    return { x: r.left + (h.icon.x - cam.scrollX) * k, y: r.top + (h.icon.y - cam.scrollY) * k }; });
  await page.mouse.click(p.x, p.y, { delay: 40 });
}

async function pres007Path2(browser) {
  const w = await boot(browser, { height: 1080, save: readFileSync(join(EV, 'ack-phase-4.real.json'), 'utf8'), query: '' });
  await waitScene(w.page, 'Street');
  await debugClick(w.page, 'Set current progress', null, 1500); await setDebug(w.page, false);
  await tapIcon(w.page);
  await until(w.page, () => !document.querySelector('.tpp-milestonePopup').hidden, null, 20000);
  const cut = await w.page.evaluate(() => { const d = window.__tpp.game.scene.getScene('Street').director, m = document.querySelector('.tpp-milestonePopup');
    return { timeline: d.timeline.map(b => ({ ...b })), plan: { totalMs: d.plan.totalMs }, title: m.querySelector('.tpp-heading')?.textContent, skip: !!m.querySelector('.tpp-skip:not([hidden])') }; });
  // VERIFY-PRES-008: reload with the milestone popup open → one popup, no second celebration.stepped
  // the save is written on its own cadence: wait until the persisted celebration step is 'milestone' before reading it
  const persisted = await until(w.page, () => { try { return JSON.parse(localStorage.getItem('tpp.save')).state.celebration?.step === 'milestone'; } catch { return false; } }, null, 15000, 100);
  const save = await w.page.evaluate(() => localStorage.getItem('tpp.save'));
  await w.context.close();
  const r = await boot(browser, { height: 1080, save, query: '' });
  await waitScene(r.page, 'Street', 900);
  const dom = await domRead(r.page), l = await lines(r.page), s = await getState(r.page);
  const reload = { persistedAtMilestone: persisted, popupVisible: dom.milestone.visible, popupCount: await r.page.evaluate(() => [...document.querySelectorAll('.tpp-milestonePopup')].filter(e => !e.hidden).length),
    stepped: count(l, 'celebration.stepped'), started: l.filter(x => x.type === 'celebration.started').map(x => ({ replay: x.replay, toPhase: x.toPhase })), step: s.celebration?.step ?? null, consoleErrors: r.errors.consoleErrors };
  await r.context.close();
  return { cut, reload, consoleErrors: w.errors.consoleErrors };
}


/** Overlay px (client rect ÷ overlay scale; the WORK-021-3 / WORK-023-1 method) for screens 5 and 12 at 1080 and 823 from the arrival-held-box seed. */
const geometryRead = page => page.evaluate(() => {
  const root = document.querySelector('#panels').parentElement, scale = Number(getComputedStyle(root).getPropertyValue('--overlay-scale')) || 1, o = root.getBoundingClientRect();
  const box = el => { if (!el || el.hidden) return null; const r = el.getBoundingClientRect(); if (!r.width) return null; return { x: Math.round((r.left - o.left) / scale), y: Math.round((r.top - o.top) / scale), w: Math.round(r.width / scale), h: Math.round(r.height / scale) }; };
  const p = document.querySelector('.tpp-revealPanel');
  return { overlayScale: scale, overlay: { w: Math.round(o.width / scale), h: Math.round(o.height / scale) },
    hudStreet: box(document.querySelector('.tpp-hudStreet')), moreHomes: box(document.querySelector('.tpp-more-homes')), revealLink: box(document.querySelector('.tpp-reveal-link')),
    dialogue: box(document.querySelector('[data-panel="dialogue"]')),
    panel: p.hidden ? null : { body: box(p.querySelector('.tpp-reveal-panel')), image: box(p.querySelector('.tpp-reveal-image')), close: box(p.querySelector('.tpp-close')), rows: [...p.querySelectorAll('.tpp-reveal-info .tpp-clue')].map(box) } };
});
async function geometry(browser) {
  const out = {};
  for (const height of [1080, 823]) {
    const w = await boot(browser, { height, save: readFileSync(join(EV, 'arrival-held-box.real.json'), 'utf8'), query: '' });
    await waitScene(w.page, 'Street', 0);
    await until(w.page, () => window.__tpp.game.scene.getScene('Street').arrival?.bubble?.current() != null, null, 8000);
    const atDoor = await geometryRead(w.page);
    if (height === 823) await shot(w.page, browser, join(EV, 'captures'), 'screen-5-street-arrival-823', { note: 'arrival at the door, 1920×823', save: 'arrival-held-box.real.json' });
    await until(w.page, () => window.__tpp.store.getState().arrival === null, null, 8000);
    for (let i = 0; i < 12 && (await getState(w.page)).dialogue.current; i++) { await w.page.locator('[data-panel="dialogue"]').click({ position: { x: 300, y: 60 } }); await w.page.waitForTimeout(350); }
    await w.page.waitForTimeout(600);
    await w.page.locator('.tpp-reveal-link').click();
    await until(w.page, () => !document.querySelector('.tpp-revealPanel').hidden, null, 3000);
    await w.page.waitForTimeout(500);
    const panel = await geometryRead(w.page);
    if (height === 823) await shot(w.page, browser, join(EV, 'captures'), 'screen-12-reveal-823', { note: 'reveal panel arrived, 1920×823', save: 'arrival-held-box.real.json' });
    out[height] = { screen5: atDoor, screen12: panel, consoleErrors: w.errors.consoleErrors };
    await w.context.close();
  }
  return out;
}

const at = (tl, n) => tl?.find(b => b.beat === n)?.atMs ?? null;
function pres007(p2) {
  const chain = trace.chain45?.director, path1 = { timeline: chain?.timeline ?? null, planTotalMs: chain?.plan?.totalMs ?? null };
  const judge = (tl, total) => { const swap = at(tl, 'completionSwap'), fin = at(tl, 'finish'), conf = at(tl, 'confetti');
    return { finishAfterCompletionSwapMs: swap !== null && fin !== null ? Math.round(fin - swap) : null, finishMinusConfettiMs: conf !== null && fin !== null ? Math.round(fin - conf) : null, finishVsPlanMs: fin !== null ? Math.round(fin - total) : null,
      ok: swap !== null && conf !== null && fin !== null && Math.abs(fin - swap - 2050) <= 100 && Math.abs(fin - conf - 1750) <= 100 && Math.abs(fin - total) <= 100 }; };
  const j1 = judge(path1.timeline, path1.planTotalMs), j2 = judge(p2.cut.timeline, p2.cut.plan.totalMs);
  const titleBeat = B(/Project Complete!" with no Skip/);
  return { id: 'VERIFY-PRES-007', half: 'Chrome desktop 1920x1080', path1: { name: 'trace chained 4 → 5 after Skip', ...path1, ...j1, noPanBack: B(/same dispatch/)?.found?.cameraAtChainStart ?? null, popup: titleBeat?.found?.milestone?.heading ?? null },
    path2: { name: 'ack-phase-4 + debug Set current progress 1500 + icon', timeline: p2.cut.timeline, planTotalMs: p2.cut.plan.totalMs, ...j2, popup: p2.cut.title, skipShown: p2.cut.skip },
    note: 'timings.ts completionBeats: completionSwap → bloom 300 → confetti (confetti + flash start together) → hold 1750 → finish; plan total 4620',
    result: j1.ok && j2.ok && p2.cut.title === 'Project Complete!' && !p2.cut.skip && titleBeat?.ok ? 'pass' : 'fail' };
}

const browser = await launch();
let p2;
let geo;
try { p2 = await pres007Path2(browser); geo = await geometry(browser); } finally { await browser.close(); }
writeJson(join(EV, 'geometry.json'), { kind: 'state read', work: WORK, sha, method: 'getBoundingClientRect ÷ --overlay-scale (overlay px)', save: 'arrival-held-box.real.json', ...geo });

put('pres-007.json', pres007(p2));
const chainBeat = B(/same dispatch/), arrival = B(/arrival.started → walk/), reveal = B(/reveal beat: card 5/), panel = B(/reveal panel from the HUD icon/);
put('mec-002-025.json', { id: 'VERIFY-MEC-002-025', half: 'Chrome desktop 1920x1080 (both halves from the trace)',
  skipHalf: { skip: B(/Skip → completeNow.taken/)?.found ?? null, secondCutscene: chainBeat?.found ?? null, projectComplete: B(/Project Complete!" with no Skip/)?.found ?? null },
  arrivalHalf: arrival?.found ?? null, revealPopup: reveal?.found?.final ?? null, loops: [join(EV, 'loops/trace-skip-chain-completion.mp4'), join(EV, 'loops/trace-arrival-walk.mp4')],
  stills: [join(EV, 'captures/screen-3-project-complete-1080-001.png'), join(EV, 'captures/screen-5-street-arrival-1080-001.png')], heard: SOUND,
  result: [B(/Skip → completeNow.taken/), chainBeat, B(/Project Complete!" with no Skip/), reveal, arrival].every(b => b?.ok) ? 'pass' : 'fail' });
const three = B(/three cards \(Phase 2, 3, 4/);
put('mec-003-010.json', { id: 'VERIFY-MEC-003-010', half: 'Chrome desktop 1920x1080', popupAfterSkip: three?.found ?? null, panelAfterArrival: panel?.found ?? null,
  lockedPanelHalf: 'the four-cards + one locked "Arrives with phase 5" panel is the pre-completion state; the trace skips straight to completion, so that half stays the WORK-023-1 row (runs/RUN-002/evidence/WORK-023-1/rows/mec-003-010.json)',
  stills: [join(EV, 'captures/screen-4-reveal-popup-1080-001.png'), join(EV, 'captures/screen-12-reveal-1080-001.png')], result: three?.ok && panel?.ok ? 'pass' : 'fail' });
put('mec-003-011.json', { id: 'VERIFY-MEC-003-011', half: 'Chrome desktop 1920x1080', beat: reveal?.found ?? null, marks: trace.revealBeat?.marks ?? null, panelAfter: panel?.found ?? null,
  loop: join(EV, 'loops/trace-reveal-beat.mp4'), still: join(EV, 'captures/screen-4-reveal-complete-1080-001.png'), result: reveal?.ok && panel?.ok ? 'pass' : 'fail' });
const walkOut = B(/walk out → street: no celebration/), tap = B(/tap the house → celebration.started/);
put('mec-002.json', { id: 'VERIFY-MEC-002-017 + VERIFY-MEC-002-024 + VERIFY-MEC-002-028', rows: {
  'VERIFY-MEC-002-017': { rule: 'no celebration on street arrival; the tap starts it (mec-002 amendment 2026-10-26)', walkOut: walkOut?.found ?? null, tap: tap?.found ?? null, result: walkOut?.ok && tap?.ok ? 'pass' : 'fail' },
  'VERIFY-MEC-002-024': { rule: 'six tiles with real art and "Skip the wait · $"', popup: B(/six tiles/)?.found ?? null, result: B(/six tiles/)?.ok ? 'pass' : 'fail' },
  'VERIFY-MEC-002-028': { rule: 'attention icon after walking out', icon: walkOut?.found?.iconVisible ?? null, result: walkOut?.found?.iconVisible === true ? 'pass' : 'fail' } },
  result: walkOut?.ok && tap?.ok && B(/six tiles/)?.ok ? 'pass' : 'fail' });
put('pres-006.json', { id: 'VERIFY-PRES-006', half: 'Chrome desktop 1920x1080, tap path 1 → 4', measured: tap?.found ?? null, director: trace.chain14?.director ?? null,
  result: tap?.ok ? 'pass' : 'fail' });
put('pres-008.json', { id: 'VERIFY-PRES-008', half: 'Chrome desktop 1920x1080', save: 'ack-phase-4 + debug 1500 + icon, milestone popup open, tpp.save read', reload: p2.reload,
  result: p2.reload.popupVisible && p2.reload.popupCount === 1 && p2.reload.stepped === 0 && !p2.reload.consoleErrors.length ? 'pass' : 'fail' });
const held = B(/held phase\/completion boxes/);
put('mec-008.json', { id: 'VERIFY-MEC-008-015 + VERIFY-MEC-008-017', half: 'Chrome desktop 1920x1080 (the held boxes on the trace)', held: held?.found ?? null,
  result: held?.ok ? (held.found?.held ? 'pass' : 'not-run (content optional, mec-008 §2.5)') : 'fail' });
const owlEntry = B(/walk into pet-front/), perch = B(/first want fulfilled \(perch-branch/);
put('mec-007-016-owl.json', { id: 'VERIFY-MEC-007-016', pet: 'owl', half: 'Chrome desktop 1920x1080', streetWalk: arrival?.found?.atStart ?? null, entry: owlEntry?.found ?? null, perch: perch?.found ?? null,
  loops: [join(EV, 'loops/trace-arrival-walk.mp4'), join(EV, 'loops/trace-owl-perch-heart.mp4')], result: arrival?.ok && owlEntry?.ok && perch?.ok ? 'pass' : 'fail' });
// timings: every M2 motion beat vs its production / presentation number (± 100 ms)
const st = Object.fromEntries((trace.arrival?.stamps ?? []).map(s => [s.beat, s])), plan = trace.arrival?.atStart?.plan;
const t14 = trace.chain14?.director, t45 = trace.chain45?.director;
const entries = [
  ['1 → 4 chain on the tap path (cutscene to the milestone step)', t14?.plan?.totalMs ?? 6660, tap?.found?.cutsceneMs ?? null, 'planCelebration(1 → 4) totalMs; presentation §7.4'],
  ['1 → 4 chain finish beat (director.timeline)', t14?.plan?.totalMs ?? 6660, at(t14?.timeline, 'finish'), 'planCelebration totalMs'],
  ['chained 4 → 5 completing chain finish', 4620, at(t45?.timeline, 'finish'), 'presentation §7.4 / DEC-032 4620'],
  ['4 → 5: confetti → finish (popup +1750)', 1750, at(t45?.timeline, 'finish') !== null && at(t45?.timeline, 'confetti') !== null ? at(t45.timeline, 'finish') - at(t45.timeline, 'confetti') : null, 'CONFETTI_HOLD 1750'],
  ['reveal beat: silhouette hold', 1500, trace.revealBeat?.holdMs ?? null, 'mec-003 §2 completion beat 1500'],
  ['reveal beat: resolve', 800, trace.revealBeat?.resolveMs ?? null, 'mec-003 §2 resolve 800'],
  ['arrival: walk to the door (480 px/s)', plan?.doorMs ?? null, st.door?.atMs ?? null, 'presentation §7.6 walk at 480 px/s'],
  ['arrival: 🎵 at the door', plan ? plan.fadeMs - plan.doorMs : 2000, st.fade && st.greeting ? st.fade.atMs - st.greeting.atMs : null, 'bubbleMs 2000'],
  ['arrival: fade', 250, st.finished && st.fade ? st.finished.atMs - st.fade.atMs : null, 'ARRIVAL_FADE_MS 250'],
  ['Owl room greeting after scene.changed', 520, owlEntry?.found?.greetingAfterMs ?? null, 'tuning greetingDelayMs 520 (after the fade-in)'],
];
const timings = entries.map(([beat, expected, measured, basis]) => ({ beat, expectedMs: expected, measuredMs: measured === null ? null : Math.round(measured), deltaMs: measured === null || expected === null ? null : Math.round(measured - expected), basis,
  result: measured !== null && expected !== null && Math.abs(measured - expected) <= 100 ? 'pass' : 'fail' }));
put('timings.json', { id: 'TECH-018 timings', half: 'Chrome desktop 1920x1080 (scene clock / log t / performance.now() stamps)', timings, result: timings.every(t => t.result === 'pass') ? 'pass' : 'fail' });

const summary = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.result]));
console.log(JSON.stringify({ summary, timings: timings.map(t => [t.beat, t.expectedMs, t.measuredMs, t.deltaMs, t.result]), errors: p2.consoleErrors.concat(p2.reload.consoleErrors) }, null, 1));
process.exit(Object.values(summary).every(r => r !== 'fail') ? 0 : 1);

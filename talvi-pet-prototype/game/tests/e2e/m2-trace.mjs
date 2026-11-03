// WORK-023-3 combined M2 trace 6:00 → 20:00 (design §4; MILESTONE-006 outcome) on the Playwright library (chromium-1243, no install).
//   TPP_BASE=http://127.0.0.1:5207 TPP_EVIDENCE=<lane evidence dir> TPP_WORK=WORK-023-3 TPP_MILESTONE=MILESTONE-006 node tests/e2e/m2-trace.mjs
// Starts from the design-5:00 save (<EV>/m1-end.real.json, tests/view/capture/m1-end.steps.json through make-fixture), strict boot (known-missing empty),
// 1920×1080, real inputs (keyboard, canvas and panel taps, the debug panel for the phase 2–4 purchases: order fork 1); window.__tpp only to read.
// One continuous CDP screencast; loops cut by marks. Writes trace-report.json, trace-log.jsonl, storage-reads.json, loops/*, captures/*. Exit 0 iff every beat is ok.
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { base, evidenceRoot, sha, launch, boot, waitScene, lines, getState, count, first, strip, eq, until, waitLine, tapSlot, steer,
  domRead, shot, encode, startStreamRecording, exportLog, writeJson, debugClick, setDebug, WORK } from './lib/harness.mjs';

const loopsDir = join(evidenceRoot, 'loops'), capturesDir = join(evidenceRoot, 'captures');
const SEED = join(evidenceRoot, 'm1-end.real.json');
if (!existsSync(SEED)) throw new Error(`seed save missing: ${SEED} (npm run fixture -- --steps tests/view/capture/m1-end.steps.json --out <EV>/m1-end.real.json)`);
const QUERY = '';
const beats = [], marks = {}, traceStart = Date.now();
const mark = name => { marks[name] = Date.now(); return marks[name]; };
let page, browser, stream, all = [];
const refresh = async () => { all = await lines(page); return all; };
function beat(name, ok, expected, found, extra = {}) {
  beats.push({ beat: name, expected, found, ok: Boolean(ok), t: extra.line?.t ?? null, wall: new Date().toISOString(), elapsedMs: Date.now() - traceStart, ...extra, line: undefined });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  return ok;
}
async function still(point, note, extra = {}) {
  return shot(page, browser, capturesDir, point, { target: `${base}/${QUERY}`, seededSave: 'm1-end.real.json (design 5:00), trace session', note, dom: await domRead(page), ...extra });
}

/** Page-side stamps (performance.now()): reveal popup mutations, the arrival walk timeline, dialogue visibility. */
function pageInit() {
  window.__beat = []; window.__vis = []; window.__walk = null; window.__stamps = []; window.__walks = 0;
  const attach = () => {
    const popup = document.querySelector('.tpp-revealPopup'), panels = document.querySelector('#panels');
    if (!popup || !panels?.querySelector('[data-panel="dialogue"]')) return setTimeout(attach, 20);
    const push = () => window.__beat.push({ t: performance.now(), wall: Date.now(), hidden: popup.hidden, state: popup.dataset.state,
      ids: [...popup.querySelectorAll('.tpp-mystery-tile [data-asset-id]')].map(e => e.dataset.assetId),
      title: popup.querySelector('.tpp-reveal-popup-title')?.textContent, continueDisabled: popup.querySelector('.tpp-collect').disabled,
      visibleCards: [...popup.querySelectorAll('.tpp-clue')].filter(c => !c.hidden).map(c => c.querySelector('.tpp-clue-phase')?.textContent) });
    new MutationObserver(push).observe(popup, { attributes: true, subtree: true, childList: true, attributeFilter: ['hidden', 'data-state', 'disabled'] });
    const d = panels.querySelector('[data-panel="dialogue"]');
    new MutationObserver(() => window.__vis.push({ t: performance.now(), wall: Date.now(), hidden: d.hidden, text: d.textContent.trim().replace(/\s+/g, ' ').slice(0, 120) }))
      .observe(d, { attributes: true, attributeFilter: ['hidden'] });
    push();
  };
  const frame = () => {
    const st = window.__tpp?.game?.scene?.getScene('Street');
    if (st?.arrival && window.__walk !== st.arrival) { window.__walk = st.arrival; window.__walks++; window.__stamps = []; window.__walkSeenAt = performance.now(); }
    const w = window.__walk;
    if (w) while (window.__stamps.length < w.timeline.length) window.__stamps.push({ ...w.timeline[window.__stamps.length], wall: performance.now() });
    requestAnimationFrame(frame);
  };
  document.addEventListener('DOMContentLoaded', () => { attach(); requestAnimationFrame(frame); });
}

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
const toggleEnabled = () => until(page, () => !document.querySelector('.tpp-design-toggle').disabled, null, 12000);
async function designOn() { await toggleEnabled(); if ((await getState(page)).mode !== 'design') { await page.click('.tpp-design-toggle'); await page.waitForTimeout(450); } }
async function designOff() { await toggleEnabled(); if ((await getState(page)).mode === 'design') { await page.click('.tpp-design-toggle'); await page.waitForTimeout(450); } }
async function place(slotId, typeId) {
  await designOn();
  await tapSlot(page, slotId);
  await until(page, () => !document.querySelector('.tpp-chooser').hidden, null, 3000);
  await page.click(`.tpp-charm-card[data-type-id="${typeId}"]`);
  await page.waitForTimeout(300);
}
const directorRead = () => page.evaluate(() => {
  const d = window.__tpp.game.scene.getScene('Street').director;
  return { timeline: d?.timeline ? d.timeline.map(b => ({ ...b })) : null, plan: d?.plan ? { totalMs: d.plan.totalMs, beats: d.plan.beats.map(b => ({ beat: b.beat, startMs: b.startMs, durationMs: b.durationMs })) } : null,
    camera: (() => { const c = window.__tpp.game.scene.getScene('Street').cameras.main; return { midPoint: [Math.round(c.midPoint.x), Math.round(c.midPoint.y)], zoom: c.zoom }; })() };
});
async function tapHouse() {
  const p = await page.evaluate(() => {
    const st = window.__tpp.game.scene.getScene('Street'), h = st.houses.get('pet-house'), b = h.getBounds(), cam = st.cameras.main, r = window.__tpp.game.canvas.getBoundingClientRect(), k = r.width / 1920;
    return { x: r.left + (b.centerX - cam.scrollX) * k, y: r.top + (b.centerY + b.height * 0.15 - cam.scrollY) * k };
  });
  await page.mouse.click(p.x, p.y, { delay: 40 });
  return p;
}
const panelRead = () => page.evaluate(() => {
  const p = document.querySelector('.tpp-revealPanel');
  return { hidden: p.hidden, state: p.dataset.state, title: p.querySelector('.tpp-reveal-label')?.textContent ?? null,
    image: [...p.querySelectorAll('.tpp-reveal-image [data-asset-id]')].map(e => ({ id: e.dataset.assetId, real: e.tagName === 'IMG' })),
    name: p.querySelector('.tpp-reveal-name')?.textContent ?? null,
    rows: [...p.querySelectorAll('.tpp-reveal-info .tpp-clue')].map(r => ({ locked: r.classList.contains('locked'), phase: r.querySelector('.tpp-clue-phase')?.textContent,
      icon: r.querySelector('.ns-tile [data-asset-id]')?.dataset.assetId ?? null, line: r.querySelector('.tpp-clue-line')?.textContent ?? null })) };
});
const hudMore = () => page.evaluate(() => { const el = document.querySelector('.tpp-more-homes'); return { text: el?.textContent ?? null, visible: !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden' }; });
const linesAfter = (type, t, m = {}) => all.filter(l => l.type === type && l.t >= t && Object.entries(m).every(([k, v]) => JSON.stringify(l[k]) === JSON.stringify(v)));

// ---- boot at design 5:00 --------------------------------------------------------------------------------------------------
async function seedBoot() {
  await waitScene(page, 'Interior', 1200);
  await drainAll(1200);
  const s = await getState(page);
  beat('5:00 seed: Dog wants 1–2 fulfilled, Hearts 2, phase 1 acknowledged, player inside the Dog room (strict boot)', s.pets.dog.hearts === 2 && eq(s.pets.dog.fulfilledWantIds, ['soft-nap', 'bright-corner']) && s.projects['pet-house'].acknowledgedPhase === 1 && s.scene.roomId === 'dog-room',
    'hearts 2; fulfilled [soft-nap, bright-corner]; acknowledgedPhase 1; scene dog-room; query has no ?lenient=1', { hearts: s.pets.dog.hearts, fulfilled: s.pets.dog.fulfilledWantIds, project: s.projects['pet-house'], scene: s.scene, query: QUERY });
}

// ---- 6:00–10:00 Dog wants 3 and 4 -----------------------------------------------------------------------------------------
async function wants34() {
  mark('wantsStart');
  const w3 = (await domRead(page)).want;
  await place('floor-1', 'ball');
  await waitLine(page, 'want.fulfilled', { wantId: 'feels-like-home' }, 8000);
  await drainAll(1500);
  await page.waitForTimeout(500);
  const w4 = (await domRead(page)).want;
  await place('floor-7', 'food-bowl');
  await waitLine(page, 'want.fulfilled', { wantId: 'snack-time' }, 8000);
  await page.waitForTimeout(300);
  await still('screen-10-dog-want-4-fulfilled-1080', 'Dog want 4 fulfilled flash (renders screen 10 state d) with food-bowl beside the bed');
  await drainAll(1500);
  await designOff();
  mark('wantsEnd');
  await refresh();
  const f3 = first(all, 'want.fulfilled', { wantId: 'feels-like-home' }), f4 = first(all, 'want.fulfilled', { wantId: 'snack-time' });
  const h3 = first(all, 'heart.earned', { hearts: 3 }), h4 = first(all, 'heart.earned', { hearts: 4 }), unl = all.filter(l => l.type === 'items.granted' && l.source === 'heart' && l.t >= (f4?.t ?? Infinity));
  beat('6:00–10:00 Dog wants 3 (feels-like-home: plant + hidden toy → ball at floor-1) and 4 (snack-time: food beside soft → food-bowl at floor-7 by the bed): want.fulfilled ×2, Hearts 3–4, toy-chest + seed-dish granted',
    f3 && f4 && h3 && h4 && ['toy-chest', 'seed-dish'].every(t => unl.some(u => u.typeId === t)), 'want.fulfilled {feels-like-home}, {snack-time}; heart.earned {3}, {4}; items.granted {toy-chest, 1, heart}, {seed-dish, 1, heart}',
    { wantPanelBefore3: w3, wantPanelBefore4: w4, f3: strip(f3), f4: strip(f4), h3: strip(h3), h4: strip(h4), unlocked: unl.map(strip) },
    { line: h4, deviation: 'design §4 6:00–10:00 says one want includes "room ≥ 24 ★"; the authored Dog wants 3–4 (WORK-024-1) carry no stars condition (want 5 welcome-home has stars 24); content as authored' });
}

// ---- phases 2–4 by simulated purchases (order fork 1) ---------------------------------------------------------------------
async function phases() {
  mark('phasesStart');
  await setDebug(page, true);
  let n = 0;
  while (n < 60 && !(await lines(page, 'phase.reached')).some(l => l.phase === 4)) { await debugClick(page, 'Simulate a purchase'); n++; await page.waitForTimeout(120); }
  await setDebug(page, false);
  await drainAll(1200);
  await page.waitForTimeout(600);
  const dom = await domRead(page);
  await still('screen-6-interior-badge-phase-4-1080', 'Dog room at phase 4 with the attention badge (Q13(a))');
  mark('phase4');
  await refresh();
  const reached = all.filter(l => l.type === 'phase.reached').map(l => l.phase);
  report.notes.push(`order fork 1: phases 2–4 reached by ${n} debug "Simulate a purchase" events (identical sim path to a round-up), not the 20 s feed`);
  beat('phases 2–4 reached inside (fork 1: debug Simulate a purchase); the badge inside', [2, 3, 4].every(p => reached.includes(p)) && dom.hudInterior.badge, 'phase.reached {2},{3},{4}; button.tpp-attention visible',
    { purchases: n, reached, cents: (await getState(page)).projects['pet-house'].currentCents, hud: dom.hudInterior }, { line: first(all, 'phase.reached', { phase: 4 }) });
}

// ---- 10:00 walk out, no auto-celebration, tap the house, cutscene, six tiles, Skip, Collect, three cards, chain ----------
async function walkOutAndTap() {
  mark('walkOut');
  await steer(page, 693, 575, () => window.__tpp.store.getState().scene.kind === 'street', 30000);
  await waitScene(page, 'Street', 1200);
  await refresh();
  const sc = all.filter(l => l.type === 'scene.changed' && l.to?.kind === 'street').at(-1);
  const s = await getState(page), icon = await page.evaluate(() => window.__tpp.game.scene.getScene('Street').houses.get('pet-house').icon.visible);
  beat('10:00 walk out → street: no celebration starts on arrival; the attention icon shows (VERIFY-MEC-002-017, mec-002 amendment 2026-10-26)', sc && s.celebration === null && icon && !linesAfter('celebration.started', sc.t).length,
    'scene.changed {to street}; state.celebration null; no celebration.started; house icon visible', { sceneChanged: strip(sc), celebration: s.celebration, iconVisible: icon }, { line: sc });
  await still('screen-2-street-attention-phase-4-1080', 'street with the attention icon over the Pet House after walking out at phase 4 (renders screen 2)');
  mark('tapHouse');
  const tp = await tapHouse();
  const started = await waitLine(page, 'celebration.started', { fromPhase: 1, toPhase: 4 }, 4000);
  const opened = await until(page, () => !document.querySelector('.tpp-milestonePopup').hidden, null, 25000);
  mark('popupOpen');
  const dir = await directorRead();
  await page.waitForTimeout(700);
  await refresh();
  const tap = all.filter(l => l.type === 'input.tap').at(-1), cs = first(all, 'celebration.started', { fromPhase: 1, toPhase: 4 }), stepped = all.find(l => l.type === 'celebration.stepped' && l.step === 'milestone' && l.t >= (cs?.t ?? Infinity));
  const total = dir.plan?.totalMs ?? null, cut = stepped && cs ? Math.round(stepped.t - cs.t) : null;
  report.chain14 = { director: dir, startedToMilestoneMs: cut, tap: strip(tap), tapPoint: tp };
  beat('10:00 tap the house → celebration.started {1 → 4, replay false} → cutscene = planCelebration total ± 100 (VERIFY-PRES-006 tap path)', started && opened && cs?.replay === false && /house/.test(tap?.target ?? '') && total !== null && Math.abs(cut - total) <= 100,
    'input.tap {target house:pet-house}; celebration.started {fromPhase 1, toPhase 4, replay false}; celebration.stepped {milestone} at plan total ± 100', { tap: strip(tap), started: strip(cs), planTotalMs: total, cutsceneMs: cut, finishAtMs: dir.timeline?.find(b => b.beat === 'finish')?.atMs ?? null }, { line: cs });
  const dom = await domRead(page), project = (await getState(page)).projects['pet-house'];
  const price = `$${((1500 - project.currentCents) / 100).toFixed(2)}`;
  await still('screen-3-fast-forward-popup-1080', 'milestone popup "Coming along!" with six reward tiles (phases 2–4) and the live Skip price (renders screen 3, fast-forward)');
  const six = ['lamp-planter', 'stool', 'toy-basket', 'wall-clock', 'tall-lamp', 'hanging-plant'];
  beat('10:00 milestone popup "Coming along!" with six tiles (phases 2–4, real art) and "Skip the wait · $<remaining>" (VERIFY-MEC-002-024)', dom.milestone.heading === 'Coming along!' && eq(dom.milestone.tiles, six) && dom.milestone.assetSlots.length === 0 && dom.milestone.skip?.label === `Skip the wait · ${price}` && !dom.milestone.skip.hidden,
    `heading Coming along!; tiles ${six.join(', ')}; zero .tpp-asset-slot; Skip label with ${price}`, { milestone: dom.milestone, expectedPrice: price, currentCents: project.currentCents });
  mark('skip');
  await page.locator('.tpp-milestonePopup .tpp-skip button').click();
  await waitLine(page, 'completeNow.taken', {}, 5000);
  await page.waitForTimeout(500);
  await refresh();
  const taken = first(all, 'completeNow.taken'), p5 = first(all, 'phase.reached', { phase: 5 }), fs = first(all, 'feed.stopped', {}, taken?.t ?? Infinity);
  const after = await domRead(page);
  const rc = first(all, 'rewards.collected', {}, taken?.t ?? Infinity);
  beat('10:00 Skip → completeNow.taken, phase.reached {5}, feed.stopped; the owed phases 2–4 collected by the Skip itself', taken && p5 && fs && rc && rc.t - taken.t <= 5 && eq(rc.phases, [2, 3, 4]), 'completeNow.taken {pet-house}; phase.reached {5}; feed.stopped; rewards.collected {phases [2,3,4]} within 5 ms (same dispatch; log t stamps per line)', { taken: strip(taken), phase5: strip(p5), feedStopped: strip(fs), rewardsCollected: strip(rc), popupAfterSkip: after.milestone }, { line: taken, deviation: 'order objective "Skip → … → Collect → reveal popup": as built, skipWait collects the owed phases in the same dispatch and the reveal popup follows the milestone popup hide; no Collect tap exists on the Skip path' });
  // as built (mec-002 §2.6 skipWait): Skip collects the owed phases itself (rewards.collected + celebration.stepped {reveal} in the same dispatch); no Collect tap follows
  mark('collect');
  await until(page, () => !document.querySelector('.tpp-revealPopup').hidden, null, 8000);
  await page.waitForTimeout(1300);
  const rdom = await domRead(page);
  await still('screen-4-reveal-popup-1080', 'reveal popup: mystery shape + three cards Phase 2, 3, 4 (renders screen 4)');
  const leaks = await page.evaluate(() => /pets\/owl|\bowl\b/i.test(document.querySelector('.tpp-revealPopup').outerHTML));
  report.revealThree = { reveal: rdom.reveal, owlLeak: leaks };
  beat('10:00 Collect → reveal popup: mystery shape + three cards (Phase 2, 3, 4; real icons); nothing of the Owl (VERIFY-MEC-003-010 popup half)', rdom.reveal.visible && rdom.reveal.mystery === 'ui/mystery-shape' && eq(rdom.reveal.cards.map(c => c.phase), ['Phase 2', 'Phase 3', 'Phase 4']) && rdom.reveal.cards.every(c => c.real) && !leaks,
    'mystery ui/mystery-shape; cards Phase 2–4 with img icons; no owl reference in the popup', report.revealThree);
}

async function completionChain() {
  mark('continue1');
  await page.locator('.tpp-revealPopup .tpp-collect').click();
  const started = await waitLine(page, 'celebration.started', { fromPhase: 4, toPhase: 5 }, 6000);
  const camAtStart = (await directorRead()).camera;
  const opened = await until(page, () => { const m = document.querySelector('.tpp-milestonePopup'); return !m.hidden && /Complete/.test(m.querySelector('.tpp-heading')?.textContent ?? ''); }, null, 15000);
  mark('completePopup');
  const dir = await directorRead();
  await page.waitForTimeout(600);
  await refresh();
  const ended = all.filter(l => l.type === 'celebration.ended'), cs = first(all, 'celebration.started', { fromPhase: 4, toPhase: 5 });
  const at = n => dir.timeline?.find(b => b.beat === n)?.atMs ?? null;
  const dom = await domRead(page);
  report.chain45 = { director: dir, cameraAtChainStart: camAtStart, endedBeforeChain: ended.map(strip) };
  await still('screen-3-project-complete-1080', '"Project Complete!" popup, no Skip (renders screen 3, completing variant)');
  const between = all.filter(l => ended.at(-1) && cs && l.t > ended.at(-1).t && l.t < cs.t);
  const sameDispatch = ended.at(-1) && cs && cs.t - ended.at(-1).t <= 5 && between.length === 0 && eq(camAtStart.midPoint, report.chain14.director.camera.midPoint);
  beat('10:00 Continue → celebration.ended then celebration.started {4 → 5, completes} in the same dispatch; no pan back; confetti + flash same atMs; finish = plan total ± 100 (VERIFY-PRES-007)',
    started && opened && sameDispatch && cs?.completes === true && at('confetti') !== null && Math.abs((at('finish') ?? -1e9) - (dir.plan?.totalMs ?? 0)) <= 100,
    'celebration.ended then celebration.started {completes true} with no line between (≤ 5 ms); camera still framed at the chain start (no pan back); the director logs one confetti beat that starts confetti and flash together (timings.ts completionBeats); finish ≈ plan total', { ended: strip(ended.at(-1)), started: strip(cs), timeline: dir.timeline, planTotalMs: dir.plan?.totalMs, cameraAtChainStart: camAtStart }, { line: cs });
  beat('10:00 "Project Complete!" with no Skip', dom.milestone.heading === 'Project Complete!' && (dom.milestone.skip === null), 'heading Project Complete!; no .tpp-skip in the popup', { milestone: dom.milestone });
  report.revealSave = null;
  mark('collect2');
  await page.locator('.tpp-milestonePopup .tpp-collect').click();
  await until(page, () => document.querySelector('.tpp-revealPopup').dataset.state === 'silhouette', null, 10000);
  report.revealSave = await page.evaluate(() => localStorage.getItem('tpp.save'));
  await until(page, () => document.querySelector('.tpp-revealPopup').dataset.state === 'complete', null, 10000);
  await page.waitForTimeout(1200);
  mark('revealComplete');
  await still('screen-4-reveal-complete-1080', 'completing reveal: Owl portrait, "Owl has moved in!", five cards (renders screen 4 completion variant / screen 5 note 1)');
  await refresh();
  const marksB = await page.evaluate(() => window.__beat.filter(b => b.t >= 0));
  const fromCollect = marksB.filter(b => b.wall >= marks.collect2);
  const sil = fromCollect.find(m => m.state === 'silhouette'), next = fromCollect.find(m => m.ids.length === 2), done = fromCollect.find(m => m.state === 'complete');
  const hold = sil && next ? Math.round(next.t - sil.t) : null, resolve = next && done ? Math.round(done.t - next.t) : null;
  const shown = fromCollect.filter(m => !m.hidden && m.t <= (done?.t ?? 0));
  report.revealBeat = { marks: fromCollect, holdMs: hold, resolveMs: resolve, continueAlwaysEnabled: shown.every(m => !m.continueDisabled), mysteryFrameShown: fromCollect.some(m => !m.hidden && m.state === 'mystery') };
  beat('12:00 project.completed → reveal beat: card 5 → silhouette held 1500 ± 100 → resolve 400 ± 100 (WORK-038-3: tuning.revealResolveMs 800 → 400, DEC-049 §C REVEAL.resolveMs) → "Owl has moved in!"; Continue enabled throughout (VERIFY-MEC-003-011)',
    first(all, 'project.completed') && hold !== null && Math.abs(hold - 1500) <= 100 && resolve !== null && Math.abs(resolve - 400) <= 100 && done?.title === 'Owl has moved in!' && done.ids[0] === 'pets/owl-portrait' && done.visibleCards.includes('Phase 5') && report.revealBeat.continueAlwaysEnabled,
    'project.completed; silhouette → resolve timings; final title and portrait; Phase 5 card; Continue never disabled', { holdMs: hold, resolveMs: resolve, final: done, mysteryFrameShown: report.revealBeat.mysteryFrameShown, projectCompleted: strip(first(all, 'project.completed')) }, { line: first(all, 'project.completed') });
}

async function arrivalBeat() {
  mark('continue2');
  await page.locator('.tpp-revealPopup .tpp-collect').click();
  await waitLine(page, 'arrival.started', {}, 5000);
  await until(page, () => window.__walk !== null, null, 5000);
  const atStart = await page.evaluate(() => ({ x: window.__walk.sprite.x, y: window.__walk.sprite.y, clip: window.__walk.sprite.anims.currentAnim?.key ?? null, plan: window.__walk.plan, path: window.__walk.path }));
  await page.waitForTimeout(300);
  report.midArrivalSave = await page.evaluate(() => localStorage.getItem('tpp.save'));
  await until(page, () => window.__walk.bubble.current() !== null, null, 5000);
  const atDoor = await page.evaluate(() => ({ bubble: window.__walk.bubble.current(), boxHidden: document.querySelector('.tpp-dialogue').hidden }));
  await still('screen-5-street-arrival-1080', 'the Owl at the pet-front door with 🎵; no "More homes coming" HUD (retired by WORK-034-3, DEC-044); held box hidden (renders screen 5)');
  await until(page, () => window.__walk.finished, null, 8000);
  mark('arrivalFinished');
  await page.waitForTimeout(800);
  const held = (await getState(page)).dialogue.current;
  const heldLines = [];
  for (let i = 0; i < 12 && (await getState(page)).dialogue.current; i++) { const c = (await getState(page)).dialogue.current; heldLines.push({ source: c.source, line: c.lines?.[c.index] ?? null }); await tapBox(1); }
  await drainAll(1200);
  mark('heldDrained');
  await refresh();
  const stamps = await page.evaluate(() => window.__stamps), af = all.filter(l => l.type === 'arrival.finished');
  const s = await getState(page), hud = await hudMore();
  report.arrival = { atStart, atDoor, stamps, held: held && { source: held.source, lines: held.lines }, heldLines, hud };
  beat('12:00 Continue → arrival.started → walk (pet-owl-walk) → 🎵 at the door → fade → arrival.finished once; door enabled; no "More homes coming" HUD (retired by WORK-034-3, DEC-044) (VERIFY-MEC-002-025 arrival half)',
    first(all, 'arrival.started') && atStart.clip === 'pet-owl-walk' && atDoor.bubble?.text === '🎵' && af.length === 1 && s.arrival === null && s.projects['pet-house'].arrivalDone && hud.text === null && !hud.visible,
    'arrival.started; walk clip; 🎵; arrival.finished ×1; state.arrival null + arrivalDone; HUD .tpp-more-homes absent', report.arrival, { line: af[0] });
  beat('12:00 held phase/completion boxes open only after arrival.finished and drain one tap per line (VERIFY-MEC-008-015/-017 on the trace)', atDoor.boxHidden && (held ? heldLines.length >= 1 : true) && !(await getState(page)).dialogue.current,
    'box hidden at the door; after arrival.finished the held boxes open and drain', { held: report.arrival.held, heldLines, result: held ? 'measured' : 'not-run (content optional, mec-008 §2.5)' });
  await page.waitForTimeout(500);
  mark('panelOpen');
  await until(page, () => { const l = document.querySelector('.tpp-reveal-link'); return l && !l.hidden && !l.disabled; }, null, 8000);
  await page.locator('.tpp-reveal-link').click();
  await until(page, () => !document.querySelector('.tpp-revealPanel').hidden, null, 3000);
  await page.waitForTimeout(500);
  const panel = await panelRead();
  await still('screen-12-reveal-1080', 'reveal panel after the arrival: full Owl image, name, five cards (renders screen 12, arrived)');
  await page.locator('.tpp-revealPanel .tpp-close').click();
  await page.waitForTimeout(400);
  mark('panelClosed');
  report.panel = panel;
  beat('12:00 reveal panel from the HUD icon: full image + "Owl" + five cards → close', panel.state === 'arrived' && panel.image[0]?.id === 'pets/owl-portrait' && panel.image[0].real && panel.name === 'Owl' && panel.rows.length === 5 && panel.rows.every(r => !r.locked) && await page.evaluate(() => document.querySelector('.tpp-revealPanel').hidden),
    'panel state arrived; image pets/owl-portrait (img); name Owl; five unlocked rows; closed after .tpp-close', panel);
}

async function owlRoom() {
  mark('owlDoor');
  // WORK-032-1: pet-front (1440..1540 x 940..990) sits below the Pet House base; get below it, then walk up into it.
  await steer(page, 1490, 1000, () => { const s = window.__tpp.store.getState(); return (Math.abs(s.avatar.x - 1490) < 20 && s.avatar.y > 990) || s.scene.kind === 'interior'; }, 25000, 10);
  await steer(page, 1490, 950, () => window.__tpp.store.getState().scene.kind === 'interior', 25000, 10);
  await waitScene(page, 'Interior', 0);
  await until(page, () => window.__tpp.log.lines().some(l => l.type === 'pet.reacted' && l.reaction === 'greeting' && l.petId === 'owl'), null, 6000);
  await page.waitForTimeout(400);
  await still('screen-11-owl-intro-1080', 'Owl room entry: intro box with the Owl portrait (renders screen 11, pet half; second instance of screen 6)');
  await refresh();
  const sc = all.filter(l => l.type === 'scene.changed' && l.to?.roomId === 'owl-room').at(-1);
  const greet = all.find(l => l.type === 'pet.reacted' && l.reaction === 'greeting' && l.t >= (sc?.t ?? Infinity));
  const intro = all.find(l => l.type === 'dialogue.opened' && l.script?.source === 'intro' && l.t >= (sc?.t ?? Infinity));
  const dom = await domRead(page), portrait = await page.evaluate(() => document.querySelector('.tpp-dialogue .tpp-portrait [data-asset-id]')?.dataset.assetId ?? null);
  report.owlEntry = { sceneChanged: strip(sc), greetingAfterMs: greet && sc ? Math.round(greet.t - sc.t) : null, intro: intro?.script && { speaker: intro.script.speaker, lines: intro.script.lines }, portrait, dialogue: dom.dialogue };
  beat('12:00 walk into pet-front → scene.changed {owl-room} → greeting 🎵 → intro (Owl speaker, portrait)', sc && greet && intro && portrait === 'pets/owl-portrait', 'scene.changed {to owl-room}; pet.reacted {owl, greeting}; dialogue.opened {intro}; portrait pets/owl-portrait', report.owlEntry, { line: greet });
  await drainAll(1500);
  await page.waitForTimeout(400);
  await refresh();
  const act = all.find(l => l.type === 'want.activated' && l.petId === 'owl');
  const want = (await domRead(page)).want;
  await still('screen-10-owl-want-1080', "want panel state a with the Owl's first want (plant, tall) (renders screen 10)");
  await still('screen-6-owl-room-1080', 'the Owl room before decorating (renders screen 6, second instance)');
  beat("12:00 the Owl's first want announced; want panel a (plant, tall)", act?.wantId === 'leafy-perch' && want.visible && /plant/i.test(want.text) && /tall/i.test(want.text), 'want.activated {owl, leafy-perch}; want panel names plant and tall', { activated: strip(act), want });
}

async function owlPerch() {
  mark('perchStart');
  await place('wall-2', 'perch-branch');
  // WORK-033-1 (DEC-043, one copy each): the only fern stands in the Dog room (floor-4 since M1); the Owl's plant comes
  // from the Pet House phase 2 lamp-planter (plant + light), never by stripping the Dog's room.
  const copiesBefore = await page.evaluate(() => { const c = window.__tpp.store.getState().inventory.counts; return { fern: c.fern, 'lamp-planter': c['lamp-planter'], 'perch-branch': c['perch-branch'] }; });
  await place('floor-3', 'lamp-planter');
  await waitLine(page, 'want.fulfilled', { wantId: 'leafy-perch' }, 8000);
  // As-built the Owl looks at the new piece (~9 s) before perching, so wait for the perch verb itself (30 s ceiling).
  const using = await waitLine(page, 'pet.verbStarted', { petId: 'owl', verb: 'perch' }, 30000)
    && await until(page, () => { const b = window.__tpp.store.getState().pets.owl.behaviour; return b.phase === 'using' && b.verb === 'perch'; }, null, 2000);
  const clip = await page.evaluate(() => window.__tpp.game.scene.getScene('Interior').pet?.anims?.currentAnim?.key ?? null);
  await page.waitForTimeout(500);
  await still('owl-perching-1080', 'the Owl perching on the perch-branch at wall-2 (use-perch clip)');
  await drainAll(1500);
  await designOff();
  mark('perchEnd');
  await refresh();
  const f = first(all, 'want.fulfilled', { wantId: 'leafy-perch' }), h = all.find(l => l.type === 'heart.earned' && l.petId === 'owl'), vig = all.find(l => l.type === 'dialogue.opened' && l.script?.source === 'vignette' && l.t >= (f?.t ?? Infinity));
  const copiesAfter = await page.evaluate(() => { const c = window.__tpp.store.getState().inventory.counts; return { fern: c.fern, 'lamp-planter': c['lamp-planter'], 'perch-branch': c['perch-branch'] }; });
  beat("12:00–20:00 the Owl's first want fulfilled (perch-branch at wall-2 + lamp-planter at floor-3, one copy each) → Heart 1 (Owl), vignette; the Owl perches (use-perch)", f && h?.hearts === 1 && vig && using && clip === 'pet-owl-use-perch' && copiesAfter['lamp-planter'] === 0 && copiesAfter['perch-branch'] === 0,
    'want.fulfilled {leafy-perch}; heart.earned {owl, 1}; dialogue.opened {vignette}; behaviour using/perch; clip pet-owl-use-perch; counts lamp-planter 0, perch-branch 0', { fulfilled: strip(f), heart: strip(h), vignette: vig?.script?.lines, using, clip, copiesBefore, copiesAfter }, { line: h });
}

async function dogReturn() {
  mark('dogReturn');
  await steer(page, 693, 575, () => window.__tpp.store.getState().scene.kind === 'street', 30000);
  await waitScene(page, 'Street', 600);
  await drainAll(800);
  // leave the pet-front spawn sideways first so the steer never re-enters the Pet House door (the rect sits right above the spawn)
  // WORK-032-1: the pet-front spawn (1490, 1000) is just below its rect, so walk left along y 1000 first, then below starter-front, then up.
  await steer(page, 1300, 1000, () => window.__tpp.store.getState().avatar.x < 1320, 40000);
  await steer(page, 475, 965, () => window.__tpp.store.getState().avatar.x < 505 || window.__tpp.store.getState().scene.kind === 'interior', 40000);
  await steer(page, 475, 895, () => window.__tpp.store.getState().scene.roomId === 'dog-room', 30000);
  await waitScene(page, 'Interior', 600);
  await drainAll(1200);
  const tuning = await page.evaluate(() => window.__tpp.content?.tuning ?? null);
  const tEnter = Date.now();
  const used = await until(page, () => window.__tpp.store.getState().pets.dog.behaviour.phase === 'using', null, 30000, 100);
  const usedAfterMs = Date.now() - tEnter;
  await page.waitForTimeout(500);
  await still('dog-room-return-1080', 'back in the Dog room: placements as left, the Dog using a charm');
  mark('dogReturnEnd');
  await refresh();
  const s = await getState(page), sortKeys = o => Object.fromEntries(Object.entries(o).sort());
  beat('20:00 walk back out and into the Starter House → the Dog room as left; the Dog using a charm', s.scene.roomId === 'dog-room' && eq(sortKeys(s.rooms['dog-room'].placements), sortKeys({ 'large-1': 'dog-bed', 'floor-3': 'lamp', 'floor-4': 'fern', 'floor-1': 'ball', 'floor-7': 'food-bowl' })) && used,
    'scene dog-room; placements as left; pets.dog.behaviour.phase using within idleMs + verbHoldMs', { scene: s.scene, used, usedAfterMs, placements: s.rooms['dog-room'].placements, behaviour: s.pets.dog.behaviour, idleMs: tuning?.idleMs ?? null, verbHoldMs: tuning?.verbHoldMs ?? null });
}

const report = { kind: 'state read', work: WORK, milestone: 'MILESTONE-006', sha, base, query: QUERY, seed: 'm1-end.real.json (tests/view/capture/m1-end.steps.json)', captured_at: null, chromium: null, notes: [], beats };
browser = await launch();
report.chromium = browser.version();
const streamDir = mkdtempSync(join(tmpdir(), 'tpp-m2-stream-'));
let w;
try {
  w = await boot(browser, { height: 1080, save: readFileSync(SEED, 'utf8'), query: QUERY, init: pageInit });
  page = w.page;
  stream = await startStreamRecording(page, streamDir);
  for (const fn of [seedBoot, wants34, phases, walkOutAndTap, completionChain, arrivalBeat, owlRoom, owlPerch, dogReturn]) {
    try { await fn(); } catch (error) { beat(`${fn.name}: no uncaught error`, false, 'the beat runs', String(error).slice(0, 800)); }
  }
  mark('traceEnd');
  await stream.stop();
  await refresh();
  const end = await page.evaluate(() => ({ save: localStorage.getItem('tpp.save'), log: localStorage.getItem('tpp.log'), state: window.__tpp.store.getState() }));
  report.exported = await exportLog(page, join(evidenceRoot, 'trace-log.jsonl'));
  const rejected = all.filter(l => l.type === 'action.rejected'), assetErr = all.filter(l => l.type === 'asset.loadError');
  report.errors = { consoleErrors: w.errors.consoleErrors, pageErrors: w.errors.pageErrors, assetLoadErrors: assetErr, actionRejected: rejected.map(l => ({ ...strip(l), action: l.action })) };
  beat('throughout: zero console errors, zero asset.loadError, no action.rejected from real inputs', !w.errors.consoleErrors.length && !w.errors.pageErrors.length && !assetErr.length && !rejected.length, 'all empty', report.errors);
  await w.context.close();
  const saved = JSON.parse(end.save), mirror = (end.log ?? '').split('\n').filter(Boolean).map(t => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
  const r1 = await boot(browser, { height: 1080, save: end.save, query: QUERY });
  await r1.page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.getScenes(true).some(s => ['Street', 'Interior'].includes(s.scene.key)), null, { timeout: 30000 });
  const reloaded = await r1.page.evaluate(() => ({ state: window.__tpp.store.getState(), loaded: window.__tpp.log.lines().filter(l => l.type === 'save.loaded' || l.type === 'save.discarded') }));
  await r1.context.close();
  const cmp = Object.fromEntries(Object.keys(saved.state ?? {}).map(k => [k, eq(saved.state[k], reloaded.state[k])]));
  // reload mid-arrival: the walk replays
  let midArrival = null;
  if (report.midArrivalSave) {
    const r2 = await boot(browser, { height: 1080, save: report.midArrivalSave, query: QUERY, init: pageInit });
    await waitScene(r2.page, 'Street', 0);
    const replayed = await until(r2.page, () => window.__walk !== null, null, 8000);
    const fin = await until(r2.page, () => window.__walk?.finished, null, 10000);
    const l2 = await lines(r2.page);
    midArrival = { replayed, finished: fin, arrivalFinished: count(l2, 'arrival.finished'), stamps: await r2.page.evaluate(() => window.__stamps), consoleErrors: r2.errors.consoleErrors };
    await r2.context.close();
  }
  // reload at the completing reveal: the beat plays again
  let atReveal = null;
  if (report.revealSave) {
    const r3 = await boot(browser, { height: 1080, save: report.revealSave, query: QUERY, init: pageInit });
    await waitScene(r3.page, 'Street', 0);
    const open = await until(r3.page, () => !document.querySelector('.tpp-revealPopup').hidden, null, 8000);
    const complete = await until(r3.page, () => document.querySelector('.tpp-revealPopup').dataset.state === 'complete', null, 8000);
    const states = await r3.page.evaluate(() => [...new Set(window.__beat.map(b => b.state))]);
    atReveal = { open, complete, states, consoleErrors: r3.errors.consoleErrors };
    await shot(r3.page, browser, capturesDir, 'trace-reload-at-reveal-1080', { target: `${base}/${QUERY}`, seededSave: 'the trace tpp.save read during the silhouette hold', note: 'reload at the completing reveal: the beat plays again' });
    await r3.context.close();
  }
  const storage = { kind: 'state read', work: WORK, sha, captured_at: new Date().toISOString(),
    endOfTrace: { bytes: end.save.length, schemaVersion: saved.schemaVersion, reload: { saveLoaded: reloaded.loaded, perKeyEqual: cmp }, equalsInMemoryAtSave: eq(saved.state, end.state), inMemoryDiffKeys: Object.keys(end.state).filter(k => !eq(end.state[k], saved.state?.[k])) },
    logMirror: { lines: mirror.length, sessionStarted: count(mirror, 'session.started'), saveWritten: count(mirror, 'save.written'), inputTap: count(mirror, 'input.tap'), arrivalFinished: count(mirror, 'arrival.finished'), projectCompleted: count(mirror, 'project.completed') },
    midArrivalReload: midArrival, revealReload: atReveal };
  writeJson(join(evidenceRoot, 'storage-reads.json'), storage);
  const stable = Object.entries(cmp).filter(([k]) => !['feed', 'pets', 'session'].includes(k));
  beat('storage: tpp.save parses (schemaVersion 2) and equals the in-memory state on reload (tick-driven feed/pets/session excepted); tpp.log has the session lines',
    saved.schemaVersion === 2 && stable.every(([, v]) => v) && storage.logMirror.sessionStarted >= 1 && storage.logMirror.projectCompleted === 1 && storage.logMirror.arrivalFinished === 1, 'as stated (save.written is not recorded by this head: src/app/log.ts lists it but no module records it; counted, not gated)', { perKeyEqual: cmp, logMirror: storage.logMirror });
  beat('reload mid-arrival → the walk replays and finishes once', midArrival?.replayed && midArrival.finished && midArrival.arrivalFinished === 1 && !midArrival.consoleErrors.length, 'ArrivalWalk created on boot; finished; arrival.finished ×1', midArrival);
  beat('reload at the completing reveal → the reveal popup reopens and the beat reaches complete', atReveal?.open && atReveal.complete && !atReveal.consoleErrors.length, 'reveal popup visible; dataset.state complete', atReveal);
} finally { await browser.close(); }

const frames = stream ? stream.frames() : [];
const between = (a, b) => frames.filter(f => f.t >= a && f.t <= b);
const LOOPS = [
  ['trace-wants-3-4', marks.wantsStart, marks.wantsEnd, 'ball at floor-1 → want 3 → food-bowl at floor-7 → want 4, Hearts 3–4'],
  ['trace-phase-4-badge-walk-out-icon', marks.phase4 - 1000, marks.tapHouse + 800, 'badge inside → walk out → icon stays, no cutscene → tap the house'],
  ['trace-fast-forward-popup-skip', marks.tapHouse, marks.collect, '1 → 4 cutscene → six tiles → Skip'],
  ['trace-collect-three-cards-continue', marks.collect - 300, marks.continue1 + 800, 'Collect → three-card reveal → Continue'],
  ['trace-skip-chain-completion', marks.continue1, marks.completePopup + 1000, 'chained 4 → 5: lv6 under dust, bloom, confetti + flash → "Project Complete!"'],
  ['trace-reveal-beat', marks.collect2 - 300, marks.revealComplete + 500, 'card 5 → silhouette → resolve → "Owl has moved in!"'],
  ['trace-arrival-walk', marks.continue2 - 300, marks.heldDrained + 500, 'walk → 🎵 → fade → held boxes'],
  ['trace-reveal-panel', marks.panelOpen - 300, marks.panelClosed + 300, 'icon → panel → close'],
  ['trace-owl-room-entry', marks.owlDoor, marks.perchStart, 'door → greeting → intro → want 1'],
  ['trace-owl-perch-heart', marks.perchStart, marks.perchEnd, 'perch-branch + lamp-planter → want 1 → Heart 1 → perch'],
  ['trace-dog-room-return', marks.dogReturn, marks.dogReturnEnd, 'out of the Owl room → Starter House → the Dog using a charm'],
];
report.loops = [];
for (const [name, a, b, target] of LOOPS) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) { report.loops.push({ name, gap: 'beat not reached (no marks)' }); continue; }
  const lo = b - a > 12000 ? b - 12000 : a;
  const sc = encode(loopsDir, name, between(lo, b), { target, viewport: { width: 1920, height: 1080 }, screencast: '1280×720 JPEG q70, one continuous stream', seededSave: 'm1-end.real.json', window: { from: new Date(lo).toISOString(), to: new Date(b).toISOString() } }, { maxMs: 12000, crf: 26 });
  report.loops.push({ name, outputs: sc.outputs ?? null, gap: sc.gap ?? null, durationMs: sc.durationMs, sourceFps: sc.sourceFps });
}
if (frames.length) {
  const full = encode(loopsDir, 'trace-full', frames, { target: 'the whole M2 trace 6:00 → 20:00', viewport: { width: 1920, height: 1080 }, marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, new Date(v).toISOString()])) },
    { maxMs: 60 * 60 * 1000, crf: 30, scale: '960:540', fps: 15 });
  report.traceFull = { outputs: full.outputs ?? null, gap: full.gap ?? null, durationMs: full.durationMs };
}
rmSync(streamDir, { recursive: true, force: true });
report.captured_at = new Date().toISOString();
report.elapsedMs = Date.now() - traceStart;
report.marks = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, { wall: new Date(v).toISOString(), elapsedMs: v - traceStart }]));
report.ok = beats.every(b => b.ok);
delete report.midCelebrationSave; delete report.midArrivalSave; delete report.revealSave;
writeJson(join(evidenceRoot, 'trace-report.json'), report);
console.log(JSON.stringify({ ok: report.ok, elapsedMs: report.elapsedMs, failed: beats.filter(b => !b.ok).map(b => b.beat), loops: report.loops.map(l => [l.name, !!l.outputs]) }, null, 1));
process.exit(report.ok ? 0 : 1);

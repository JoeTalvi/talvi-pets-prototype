// TECH-018 smoke harness v0 (WORK-021-2): boot → door swap → placement → celebration → reload, on the Playwright library (chromium-1243 by
// executablePath; no install). `npm run smoke` with TPP_BASE (default http://127.0.0.1:5190) and TPP_EVIDENCE (default …/evidence/smoke/).
// Writes smoke-<YYYY-MM-DD>[-n].txt (transcript), smoke-report.json (latest) and smoke-report-<n>.json; exit 0 iff every step is ok.
// Every expectation is read from window.__tpp.log.lines(), store.getState() and the DOM; nothing is retried into a pass.
import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { base, evidenceRoot, sha, launch, boot, waitScene, lines, getState, count, first, strip, eq, until, waitLine, tapSlot, holdUntil, steer,
  debugClick, setDebug, domRead, makeFixture, createSteps, writeJson } from './lib/harness.mjs';

const { steps, step } = createSteps();
const t0 = Date.now();
const date = new Date().toISOString().slice(0, 10);
let n = 1; while (existsSync(join(evidenceRoot, `smoke-${date}${n > 1 ? `-${n}` : ''}.txt`))) n++;
const transcriptPath = join(evidenceRoot, `smoke-${date}${n > 1 ? `-${n}` : ''}.txt`);
const windows = [];

/** Tap the dialogue box until it closes (or `limit` taps); returns the taps used. */
async function tapBoxUntilClosed(page, limit = 12) {
  let taps = 0;
  while (taps < limit && (await getState(page)).dialogue.current) {
    const box = page.locator('[data-panel="dialogue"]');
    if (await box.isVisible()) await box.click({ position: { x: 300, y: 60 } }); else await page.waitForTimeout(150);
    taps++; await page.waitForTimeout(350);
  }
  return taps;
}
/** Tap boxes until no dialogue has been open for `quietMs` (scripts chain: intro → announce, vignette → announce). */
async function drainAll(page, quietMs = 1500, ms = 20000) {
  let taps = 0, quietSince = Date.now(); const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await getState(page)).dialogue.current) { taps += await tapBoxUntilClosed(page); quietSince = Date.now(); }
    else if (Date.now() - quietSince >= quietMs) break;
    await page.waitForTimeout(150);
  }
  return taps;
}

async function bootStep(browser) {
  const w = await boot(browser, { height: 1080, save: null });
  windows.push({ name: 'main', ...w });
  const { page } = w;
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Street') && window.__tpp.game.scene.getScene('Boot').loaderTotals?.totalComplete > 0, null, { timeout: 45000 });
  await waitScene(page, 'Street');
  const boot0 = await page.evaluate(() => ({ loader: window.__tpp.game.scene.getScene('Boot').loaderTotals, scene: window.__tpp.store.getState().scene }));
  const all = await lines(page), dom = await domRead(page);
  step('boot: BootScene complete, totalFailed 0, 81 textures (lenient)', boot0.loader.totalFailed === 0 && boot0.loader.totalComplete === 81, 'loaderTotals {totalComplete 81, totalFailed 0}', boot0.loader);
  step('boot: session.started ×1, scene street', count(all, 'session.started') === 1 && boot0.scene.kind === 'street', 'session.started ×1; scene.kind street', { sessionStarted: count(all, 'session.started'), scene: boot0.scene });
  step('boot: orientation box visible (text-only game box)', dom.dialogue.visible && (await getState(page)).dialogue.current?.source === 'orientation', 'dialogue panel visible with the orientation script', { dom: dom.dialogue, source: (await getState(page)).dialogue.current?.source });
  const taps = await tapBoxUntilClosed(page);
  const after = await lines(page), s = await getState(page);
  step('boot: taps on the box → dialogue.closed; state.dialogue.current === null (WORK-014-4 A-1)', first(after, 'dialogue.closed', {}) && s.dialogue.current === null, 'dialogue.closed {orientation}; dialogue.current === null',
    { taps, closed: strip(first(after, 'dialogue.closed')), current: s.dialogue.current, advanced: count(after, 'dialogue.advanced') });
  return page;
}

async function doorStep(page) {
  const left = await holdUntil(page, 'KeyA', () => window.__tpp.store.getState().avatar.x <= 420);
  const tKeys = Date.now();
  const inRoom = await holdUntil(page, 'KeyW', () => window.__tpp.store.getState().scene.kind === 'interior');
  const fade = await page.evaluate(async () => {
    const changed = window.__tpp.log.lines().find(l => l.type === 'scene.changed');
    while (!window.__tpp.game.scene.isActive('Interior')) await new Promise(r => requestAnimationFrame(r));
    const interiorAt = performance.now();
    const cam = window.__tpp.game.scene.getScene('Interior').cameras.main;
    // fade-in done when the camera fade effect is no longer running
    while (cam.fadeEffect?.isRunning) await new Promise(r => requestAnimationFrame(r));
    return { sceneChanged: changed ?? null, interiorActiveAt: interiorAt, visibleAt: performance.now() };
  });
  const sc = fade.sceneChanged, visibleMs = sc ? Math.round(fade.visibleAt - sc.t) : null;
  step('door: KeyA/KeyW to starter-front → scene.changed {to: interior dog-room}', left && inRoom && sc?.to?.kind === 'interior' && sc.to.roomId === 'dog-room', 'scene.changed to interior dog-room', { reachedX420: left, inRoom, keysMs: Date.now() - tKeys, sceneChanged: strip(sc) });
  const activeMs = sc ? Math.round(fade.interiorActiveAt - sc.t) : null;
  step('door: t(scene.changed) → Interior active ≈ 500 ms (fade-out 250 + swap); fade-in end recorded', activeMs !== null && activeMs >= 400 && activeMs <= 600, '400 ≤ ms(scene.changed → Interior active) ≤ 600',
    { msSceneChangedToInteriorActive: activeMs, msSceneChangedToFadeInDone: visibleMs });
}

async function placementStep(page) {
  // The intro opens after the greeting; the want-1 announce follows it. Both drained by taps on the box.
  await until(page, () => window.__tpp.store.getState().dialogue.current !== null && !document.querySelector('[data-panel="dialogue"]').hidden, null, 8000);
  let taps = await drainAll(page);
  await until(page, () => !document.querySelector('.tpp-design-toggle').disabled, null, 5000);
  let all = await lines(page);
  step('placement: intro and want-1 announce drained by taps', all.some(l => l.type === 'dialogue.closed' && l.source === 'intro') && all.some(l => l.type === 'dialogue.closed' && l.source === 'wantAnnounce') && (await getState(page)).dialogue.current === null && first(all, 'want.activated', { wantId: 'soft-nap' }), 'dialogue.closed for intro and wantAnnounce; current null',
    { taps, closed: all.filter(l => l.type === 'dialogue.closed').map(strip), current: (await getState(page)).dialogue.current?.source ?? null, wantActivated: strip(first(all, 'want.activated')) });
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  await tapSlot(page, 'large-1');
  const chooserOk = await until(page, () => { const c = document.querySelector('.tpp-chooser'); return c && !c.hidden; }, null, 3000);
  await page.click('.tpp-charm-card[data-type-id="dog-bed"]'); await page.waitForTimeout(600);
  all = await lines(page);
  const placed = first(all, 'charm.placed', { slotId: 'large-1', typeId: 'dog-bed' }), stars = first(all, 'stars.changed', { from: 0, to: 4 }), fulfilled = first(all, 'want.fulfilled');
  step('placement: Decorate → large-1 → dog-bed → charm.placed, stars.changed 0 → 4, want.fulfilled', chooserOk && placed && stars && fulfilled?.wantId === 'soft-nap',
    'charm.placed {large-1, dog-bed}; stars.changed {0 → 4}; want.fulfilled {soft-nap}', { chooserOk, placed: strip(placed), stars: strip(stars), fulfilled: strip(fulfilled) });
  // Vignette (in state at once, box deferred until the Dog uses the bed; Done is disabled while dialogue.current is set) and the want-2 announce, drained by taps.
  await until(page, () => window.__tpp.store.getState().dialogue.current !== null && !document.querySelector('[data-panel="dialogue"]').hidden, null, 12000);
  taps = await drainAll(page);
  await until(page, () => !document.querySelector('.tpp-design-toggle').disabled, null, 5000);
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(300);
  all = await lines(page);
  step('placement: heart.earned {1}; vignette + want 2 drained; dialogue.current null', first(all, 'heart.earned') && first(all, 'want.activated', { wantId: 'bright-corner' }) && (await getState(page)).dialogue.current === null,
    'heart.earned; want.activated {bright-corner}; current null', { taps, heart: strip(first(all, 'heart.earned')), want2: strip(first(all, 'want.activated', { wantId: 'bright-corner' })) });
}

async function celebrationStep(page) {
  // Walk out first: with a phase owed, stepping outside starts the celebration by the street-entry hook (celebration.onStreetEntered),
  // so the house tap is exercised by reaching phase 1 on the street (debug purchases), then tapping the attention icon.
  await drainAll(page, 1000);
  const out = await steer(page, 693, 575, () => window.__tpp.store.getState().scene.kind === 'street', 25000);
  await waitScene(page, 'Street', 900);
  step('celebration: walk out → scene street (nothing owed yet, no celebration)', out && (await getState(page)).scene.kind === 'street' && (await getState(page)).celebration === null, 'scene.changed {to: street}; celebration null',
    { scene: (await getState(page)).scene, celebration: (await getState(page)).celebration });
  await drainAll(page, 1000);
  let clicks = 0;
  await setDebug(page, true);
  while (clicks < 40 && !(await lines(page, 'phase.reached')).length) { await debugClick(page, 'Simulate a purchase'); clicks++; }
  await setDebug(page, false);
  let all = await lines(page);
  await until(page, () => window.__tpp.game.scene.getScene('Street').houses.get('pet-house').icon.visible, null, 3000);
  step('celebration: debug "Simulate a purchase" until phase.reached {1}; debug closed', first(all, 'phase.reached', { phase: 1 }) && !(await page.evaluate(() => !document.querySelector('.tpp-debugPanel').hidden)),
    'phase.reached {projectId pet-house, phase 1}; panel hidden', { clicks, phase: strip(first(all, 'phase.reached')) });
  const icon = await page.evaluate(() => {
    const st = window.__tpp.game.scene.getScene('Street'), h = st.houses.get('pet-house'), cam = st.cameras.main, rect = window.__tpp.game.canvas.getBoundingClientRect(), k = rect.width / 1920;
    return { visible: h.icon.visible, x: rect.left + (h.icon.x - cam.scrollX) * k, y: rect.top + (h.icon.y - cam.scrollY) * k };
  });
  await page.mouse.click(icon.x, icon.y, { delay: 40 });
  const started = await waitLine(page, 'celebration.started', {}, 4000);
  const popup = await until(page, () => !document.querySelector('.tpp-milestonePopup').hidden, null, 20000);
  all = await lines(page);
  const cs = first(all, 'celebration.started'), fin = all.find(l => l.type === 'celebration.stepped' && l.step === 'milestone');
  const dom = await domRead(page);
  step('celebration: tap the attention icon → celebration.started {replay false} → cutscene → milestone popup visible', icon.visible && started && count(all, 'celebration.started') === 1 && cs?.replay === false && popup && fin, 'celebration.started; celebration.stepped {milestone}; .tpp-milestonePopup visible',
    { icon, started: strip(cs), stepped: strip(fin), cutsceneMs: cs && fin ? Math.round(fin.t - cs.t) : null, milestone: dom.milestone });
  await page.locator('.tpp-milestonePopup .tpp-collect').click();
  const reveal = await until(page, () => !document.querySelector('.tpp-revealPopup').hidden, null, 8000);
  all = await lines(page);
  step('celebration: Collect → rewards.collected ×1 → reveal popup', reveal && count(all, 'rewards.collected') === 1, 'rewards.collected ×1; .tpp-revealPopup visible', { rewardsCollected: count(all, 'rewards.collected'), reveal: (await domRead(page)).reveal });
  await page.locator('.tpp-revealPopup .tpp-collect').click();
  const ended = await waitLine(page, 'celebration.ended', {}, 6000);
  await page.waitForTimeout(1500);
  all = await lines(page);
  const d2 = await domRead(page), s = await getState(page);
  step('celebration: Continue → celebration.ended ×1; HUD unfrozen; celebration null', ended && count(all, 'celebration.ended') === 1 && s.celebration === null && d2.hudStreet.frozen === false,
    'celebration.ended ×1; state.celebration null; .tpp-hudStreet not .frozen', { celebrationEnded: count(all, 'celebration.ended'), celebration: s.celebration, hudStreet: d2.hudStreet });
}

async function reloadStep(browser, name, scenario, expect) {
  const fx = makeFixture(['--scenario', scenario]);
  const w = await boot(browser, { height: 1080, save: fx.text });
  windows.push({ name, ...w });
  const { page } = w;
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.getScenes(true).some(s => ['Street', 'Interior'].includes(s.scene.key)), null, { timeout: 30000 });
  const atActive = await domRead(page);
  await page.waitForTimeout(800);
  const s = await getState(page), dom = await domRead(page), all = await lines(page);
  return expect({ s, dom, atActive, all, page });
}

const browser = await launch();
let report;
try {
  const page = await bootStep(browser);
  await doorStep(page);
  await placementStep(page);
  await celebrationStep(page);
  await reloadStep(browser, 'reload-celebration-milestone', 'celebration-milestone', ({ s, dom, atActive, all }) => step('reload: celebration-milestone save → milestone popup open at once over the framed house (one popup)',
    atActive.milestone.visible && dom.milestone.visible && !dom.reveal.visible && s.celebration?.step === 'milestone' && count(all, 'celebration.stepped') === 0,
    'milestone popup visible at the first read after the Street is active; reveal hidden; no celebration.stepped dispatched', { atActive: atActive.milestone, milestone: dom.milestone, celebration: s.celebration && { step: s.celebration.step, fromPhase: s.celebration.fromPhase, toPhase: s.celebration.toPhase } }));
  await reloadStep(browser, 'reload-save-v1-vignette', 'save-v1.vignette', ({ s, dom, all }) => step('reload: save-v1.vignette save → dialogue box open at once at index 0',
    dom.dialogue.visible && s.dialogue.current?.source === 'vignette' && s.dialogue.current.index === 0 && count(all, 'dialogue.advanced') === 0,
    'dialogue visible; current {source vignette, index 0}', { dialogue: dom.dialogue, current: s.dialogue.current && { source: s.dialogue.current.source, index: s.dialogue.current.index } }));
  const perWindow = [];
  for (const w of windows) { const all = await lines(w.page); perWindow.push({ window: w.name, consoleErrors: w.errors.consoleErrors, pageErrors: w.errors.pageErrors, assetLoadErrors: all.filter(l => l.type === 'asset.loadError'), saveWritten: count(all, 'save.written') }); }
  step('throughout: zero console errors and page errors (every window)', perWindow.every(w => !w.consoleErrors.length && !w.pageErrors.length), 'console error / pageerror lists empty', perWindow.map(w => ({ window: w.window, consoleErrors: w.consoleErrors, pageErrors: w.pageErrors })));
  step('throughout: zero asset.loadError (every window)', perWindow.every(w => !w.assetLoadErrors.length), 'no asset.loadError lines', perWindow.map(w => ({ window: w.window, assetLoadErrors: w.assetLoadErrors })));
  report = { kind: 'state read', work: 'WORK-021-2', harness: 'smoke v0 (TECH-018)', sha, base, run: n, captured_at: new Date().toISOString(), elapsedMs: Date.now() - t0, chromium: browser.version(), ok: steps.every(s => s.ok), steps, perWindow };
} catch (error) {
  step('harness: no uncaught error', false, 'the run completes', String(error).slice(0, 800));
  report = { kind: 'state read', work: 'WORK-021-2', harness: 'smoke v0 (TECH-018)', sha, base, run: n, captured_at: new Date().toISOString(), elapsedMs: Date.now() - t0, ok: false, steps };
} finally { await browser.close(); }
writeJson(join(evidenceRoot, 'smoke-report.json'), report);
writeJson(join(evidenceRoot, `smoke-report-${n}.json`), report);
const transcript = [`npm run smoke — ${report.captured_at} — sha ${sha} — base ${base} — run ${n} — ${report.ok ? 'PASS' : 'FAIL'} (${Math.round(report.elapsedMs / 1000)} s)`, '',
  ...steps.map(s => `${s.ok ? 'ok  ' : 'FAIL'} ${s.step}\n     expected: ${s.expected}\n     found:    ${JSON.stringify(s.found).slice(0, 600)}`)].join('\n');
writeFileSync(transcriptPath, `${transcript}\n`);
console.log(transcript.split('\n').filter(l => /^(ok|FAIL|npm)/.test(l)).join('\n'));
process.exit(report.ok ? 0 : 1);

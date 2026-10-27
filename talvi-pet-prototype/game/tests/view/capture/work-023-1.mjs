// WORK-023-1 reveal panel + completion beat captures, rows and geometry (Playwright library, pinned chromium-1243 by executablePath; no install).
//   TPP_BASE=http://127.0.0.1:5205 TPP_EVIDENCE=<EV> node tests/view/capture/work-023-1.mjs
// <EV> holds the *.real.json saves (npm run fixture). Strict boot (tools/known-missing-assets.json is empty on the merged base).
// Every expectation is read from window.__tpp (log, store, director) and the DOM; the beat timings come from MutationObserver stamps.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha, launch, boot, waitScene, lines, getState, until, debugClick, setDebug, startRecording, encode, shot as harnessShot, writeJson, errorsSummary } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const WORK = 'WORK-023-1', captures = join(EV, 'captures'), loops = join(EV, 'loops'), rowsDir = join(EV, 'rows');
const save = name => readFileSync(join(EV, `${name}.real.json`), 'utf8');
const IPHONE = 'not-run (user, MILESTONE-007)';
const errorsByWindow = [];

/** Stamps every reveal popup / panel attribute and tile change with performance.now(). */
const watch = () => {
  window.__beat = [];
  const attach = () => {
    const popup = document.querySelector('.tpp-revealPopup'), panel = document.querySelector('.tpp-revealPanel');
    if (!popup || !panel) return setTimeout(attach, 20);
    const push = () => window.__beat.push({ t: performance.now(), hidden: popup.hidden, state: popup.dataset.state,
      ids: [...popup.querySelectorAll('.tpp-mystery-tile [data-asset-id]')].map(e => e.dataset.assetId),
      title: popup.querySelector('.tpp-reveal-popup-title')?.textContent, continueDisabled: popup.querySelector('.tpp-collect').disabled,
      visibleCards: [...popup.querySelectorAll('.tpp-clue')].filter(c => !c.hidden).map(c => c.querySelector('.tpp-clue-phase')?.textContent) });
    new MutationObserver(push).observe(popup, { attributes: true, subtree: true, childList: true, attributeFilter: ['hidden', 'data-state', 'disabled'] });
    push();
  };
  attach();
};

const panelRead = page => page.evaluate(() => {
  const p = document.querySelector('.tpp-revealPanel');
  return { hidden: p.hidden, state: p.dataset.state, title: p.querySelector('.tpp-reveal-label')?.textContent ?? null,
    image: [...p.querySelectorAll('.tpp-reveal-image [data-asset-id]')].map(e => ({ id: e.dataset.assetId, real: e.tagName === 'IMG' })),
    name: p.querySelector('.tpp-reveal-name')?.textContent ?? null,
    rows: [...p.querySelectorAll('.tpp-reveal-info .tpp-clue')].map(r => ({ locked: r.classList.contains('locked'), phase: r.querySelector('.tpp-clue-phase')?.textContent,
      icon: r.querySelector('.ns-tile [data-asset-id]')?.dataset.assetId ?? null, line: r.querySelector('.tpp-clue-line')?.textContent ?? null })),
    guessFields: p.querySelectorAll('input, textarea, [placeholder], [contenteditable]').length + (/guess/i.test(p.outerHTML) ? 1 : 0),
    owlBeforeFull: p.dataset.state !== 'arrived' && /pets\/owl|\bowl\b/i.test(p.outerHTML),
    missingAssets: [...p.querySelectorAll('.tpp-asset-slot[data-asset-id]')].map(e => e.dataset.assetId) };
});

/** Overlay px (client rect ÷ overlay scale), the WORK-021-3 geometry-read method. */
const geometryRead = page => page.evaluate(() => {
  const root = document.querySelector('#panels').parentElement, scale = Number(getComputedStyle(root).getPropertyValue('--overlay-scale')) || 1, o = root.getBoundingClientRect();
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round((r.left - o.left) / scale), y: Math.round((r.top - o.top) / scale), w: Math.round(r.width / scale), h: Math.round(r.height / scale) }; };
  const p = document.querySelector('.tpp-revealPanel'), H = Math.round(o.height / scale);
  const body = box(p.querySelector('.tpp-reveal-panel')), image = box(p.querySelector('.tpp-reveal-image')), close = box(p.querySelector('.tpp-close'));
  const rows = [...p.querySelectorAll('.tpp-reveal-info .tpp-clue')].map(box);
  const expected = { bodyW: 1400, bodyH: Math.min(920, H - 64), image: H <= 823 ? 560 : 600, row: 92, close: 44 };
  const within = (a, b) => Math.abs(a - b) <= 2;
  return { overlayScale: scale, overlay: { w: Math.round(o.width / scale), h: H }, backdrop: getComputedStyle(p).backgroundColor, zIndex: getComputedStyle(p).zIndex, body, image, close, rows, expected,
    ok: { bodyW: within(body.w, 1400), bodyH: within(body.h, expected.bodyH), centredX: within(body.x + body.w / 2, 960), centredY: within(body.y + body.h / 2, H / 2),
      image: within(image.w, expected.image) && within(image.h, expected.image), rows: rows.length === 5 && rows.every(r => within(r.h, 92)), close: within(close.w, 44) && within(close.h, 44) } };
});

async function shot(w, browser, point, saveName) {
  const missing = (await panelRead(w.page)).missingAssets;
  return harnessShot(w.page, browser, captures, point, { work: WORK, milestone: 'MILESTONE-006', save: `${saveName}.real.json`, missingAssets: missing });
}
async function drain(page, ms = 15000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await getState(page);
    if (s.dialogue.current) { await page.locator('[data-panel="dialogue"]').click({ position: { x: 300, y: 60 } }); await page.waitForTimeout(350); continue; }
    if (s.celebration === null && s.arrival === null) { await page.waitForTimeout(600); if (!(await getState(page)).dialogue.current) return; }
    await page.waitForTimeout(200);
  }
}
async function openPanel(page) {
  await until(page, () => { const l = document.querySelector('.tpp-reveal-link'); return l && !l.hidden && !l.disabled; }, null, 15000);
  await page.locator('.tpp-reveal-link').click();
  await until(page, () => !document.querySelector('.tpp-revealPanel').hidden, null, 3000);
  await page.waitForTimeout(400);
}
async function tapIcon(page) {
  await until(page, () => window.__tpp.game.scene.getScene('Street').houses.get('pet-house').icon.visible, null, 5000);
  const icon = await page.evaluate(() => {
    const st = window.__tpp.game.scene.getScene('Street'), h = st.houses.get('pet-house'), cam = st.cameras.main, rect = window.__tpp.game.canvas.getBoundingClientRect(), k = rect.width / 1920;
    return { x: rect.left + (h.icon.x - cam.scrollX) * k, y: rect.top + (h.icon.y - cam.scrollY) * k };
  });
  await page.mouse.click(icon.x, icon.y, { delay: 40 });
}
async function close(w, name) { const all = await lines(w.page); errorsByWindow.push({ window: name, ...errorsSummary(w.errors, all) }); await w.context.close(); }

/** Completion: ack 4 → debug 1500 → icon → cutscene (PRES-007) → Collect → beat (MEC-003-011) → Continue → panel. */
async function completion(browser) {
  const w = await boot(browser, { height: 1080, save: save('ack-phase-4'), query: '', init: watch });
  await waitScene(w.page, 'Street');
  await debugClick(w.page, 'Set current progress', null, 1500); await setDebug(w.page, false);
  await tapIcon(w.page);
  await until(w.page, () => !document.querySelector('.tpp-milestonePopup').hidden, null, 20000);
  const cut = await w.page.evaluate(() => {
    const d = window.__tpp.game.scene.getScene('Street').director, m = document.querySelector('.tpp-milestonePopup');
    const l = window.__tpp.log.lines(), started = l.find(x => x.type === 'celebration.started'), stepped = l.find(x => x.type === 'celebration.stepped' && x.step === 'milestone');
    return { timeline: d?.timeline ?? null, plan: d?.plan ? { totalMs: d.plan.totalMs, beats: d.plan.beats.map(b => ({ beat: b.beat, startMs: b.startMs })) } : null,
      startedToMilestoneMs: started && stepped ? Math.round(stepped.t - started.t) : null, title: m.querySelector('.tpp-heading')?.textContent, skip: !!m.querySelector('.tpp-skip:not([hidden])') };
  });
  const at = name => cut.timeline?.find(b => b.beat === name)?.atMs ?? null;
  const swap = at('completionSwap'), finish = at('finish'), confetti = at('confetti');
  const pres007 = { id: 'VERIFY-PRES-007', work: WORK, sha, half: 'Chrome desktop 1920x1080', save: 'ack-phase-4.real.json + debug Set current progress 1500', timeline: cut.timeline, plan: cut.plan,
    finishAfterCompletionSwapMs: swap !== null && finish !== null ? Math.round(finish - swap) : null, popupTitle: cut.title, skipShown: cut.skip, startedToMilestoneMs: cut.startedToMilestoneMs,
    iphone: IPHONE };
  pres007.result = cut.title === 'Project Complete!' && !cut.skip && confetti !== null && swap !== null && pres007.finishAfterCompletionSwapMs !== null
    && Math.abs(pres007.finishAfterCompletionSwapMs - (300 + 1750)) <= 100 && Math.abs(finish - cut.plan.totalMs) <= 100 ? 'pass' : 'fail';
  pres007.note = 'finish − completionSwap = BLOOM 300 + CONFETTI_HOLD 1750 per timings.ts completionBeats; the 1750 hold runs from the confetti/flash beat';
  writeJson(join(rowsDir, 'pres-007.json'), pres007);
  const rec = await startRecording(w.page);
  await w.page.locator('.tpp-milestonePopup .tpp-collect').click();
  await until(w.page, () => document.querySelector('.tpp-revealPopup').dataset.state === 'complete', null, 15000);
  await w.page.waitForTimeout(1200);
  const marks = await w.page.evaluate(() => window.__beat);
  await w.page.locator('.tpp-revealPopup .tpp-collect').click();
  await w.page.waitForTimeout(800);
  encode(loops, 'reveal-complete-beat', await rec.stop(), { work: WORK, milestone: 'MILESTONE-006', save: 'ack-phase-4.real.json' });
  const open = marks.find(m => !m.hidden), sil = marks.find(m => m.state === 'silhouette'), next = marks.find(m => m.ids.length === 2), done = marks.find(m => m.state === 'complete');
  await drain(w.page); await openPanel(w.page);
  const panel = await panelRead(w.page), geometry = await geometryRead(w.page);
  await shot(w, browser, 'screen-12-reveal-complete-1080', 'ack-phase-4');
  await close(w, 'completion-1080');
  return { marks, open, sil, next, done, panel, geometry };
}

function beatRow(c, panel823) {
  const hold = c.sil && c.next ? Math.round(c.next.t - c.sil.t) : null, resolve = c.next && c.done ? Math.round(c.done.t - c.next.t) : null;
  const continueAlwaysEnabled = c.marks.filter(m => !m.hidden && m.t <= (c.done?.t ?? 0)).every(m => !m.continueDisabled);
  const row = { id: 'VERIFY-MEC-003-011', work: WORK, sha, half: 'Chrome desktop', save: 'ack-phase-4.real.json', fifthCard: c.done?.visibleCards ?? null,
    silhouette: c.sil?.ids ?? null, holdMs: hold, resolveMs: resolve, final: c.done ? { ids: c.done.ids, title: c.done.title } : null, continueAlwaysEnabled,
    owlBeforeSilhouette: c.marks.filter(m => !m.hidden && m.t < (c.sil?.t ?? Infinity)).some(m => m.ids.some(id => id.startsWith('pets/owl'))),
    panelAfter: c.panel, panel823, loop: join(loops, 'reveal-complete-beat.mp4'), iphone: IPHONE, marks: c.marks };
  row.result = hold !== null && Math.abs(hold - 1500) <= 100 && resolve !== null && Math.abs(resolve - 800) <= 100 && row.final?.ids?.[0] === 'pets/owl-portrait'
    && row.final.title === 'Owl has moved in!' && continueAlwaysEnabled && !row.owlBeforeSilhouette && row.fifthCard?.includes('Phase 5')
    && c.panel.image[0]?.id === 'pets/owl-portrait' && c.panel.name === 'Owl' ? 'pass' : 'fail';
  return row;
}

/** Locked: save-v1 at milestone (1 → 4) → Collect → three-card popup (screen 4) → Continue → panel (screen 12, four + one locked). */
async function locked(browser) {
  const w = await boot(browser, { height: 1080, save: save('save-v1.milestone'), query: '', init: watch });
  await waitScene(w.page, 'Street');
  await until(w.page, () => !document.querySelector('.tpp-milestonePopup').hidden, null, 10000);
  await w.page.locator('.tpp-milestonePopup .tpp-collect').click();
  await until(w.page, () => [...document.querySelectorAll('.tpp-revealPopup:not([hidden]) .tpp-clue')].filter(c => !c.hidden).length === 3, null, 10000);
  await w.page.waitForTimeout(500);
  await harnessShot(w.page, browser, captures, 'screen-4-reveal-popup-1080', { work: WORK, milestone: 'MILESTONE-006', save: 'save-v1.milestone.real.json', missingAssets: [] });
  const popupOwl = await w.page.evaluate(() => /pets\/owl|\bowl\b/i.test(document.querySelector('.tpp-revealPopup').outerHTML));
  await w.page.locator('.tpp-revealPopup .tpp-collect').click();
  await drain(w.page); await openPanel(w.page);
  const panel = await panelRead(w.page), geometry = await geometryRead(w.page);
  await shot(w, browser, 'screen-12-reveal-locked-1080', 'save-v1.milestone');
  const record = (await lines(w.page, 'ui.revealPanel')).map(l => l.open);
  await close(w, 'locked-1080');
  return { panel, geometry, popupOwl, record };
}

async function at823(browser, saveName, point) {
  const w = await boot(browser, { height: 823, save: save(saveName), query: '' });
  await waitScene(w.page, 'Street'); await drain(w.page, 4000); await openPanel(w.page);
  const panel = await panelRead(w.page), geometry = await geometryRead(w.page);
  await shot(w, browser, point, saveName);
  await close(w, `${point}`);
  return { panel, geometry };
}

const browser = await launch();
try {
  const c = await completion(browser);
  const l = await locked(browser);
  const l823 = await at823(browser, 'ack-phase-4', 'screen-12-reveal-locked-823');
  const c823 = await at823(browser, 'ack-phase-5', 'screen-12-reveal-complete-823');
  writeJson(join(rowsDir, 'mec-003-011.json'), beatRow(c, c823.panel));
  const p = l.panel;
  const row010 = { id: 'VERIFY-MEC-003-010', work: WORK, sha, half: 'Chrome desktop', save: 'save-v1.milestone.real.json → Collect → Continue → icon', panel: p, panel823: l823.panel,
    records: l.record, popupLeak: l.popupOwl, guessFields: p.guessFields, iphone: IPHONE };
  row010.result = p.image[0]?.id === 'ui/mystery-shape' && p.rows.length === 5 && p.rows.slice(0, 4).every(r => !r.locked && r.icon && r.line) && p.rows[4].locked
    && p.rows[4].phase === 'Arrives with phase 5' && p.guessFields === 0 && !p.owlBeforeFull && !l.popupOwl && l823.panel.rows.filter(r => r.locked).length === 1 ? 'pass' : 'fail';
  writeJson(join(rowsDir, 'mec-003-010.json'), row010);
  const geometry = { work: WORK, sha, method: 'client rect ÷ --overlay-scale (WORK-021-3 geometry-read)', complete1080: c.geometry, locked1080: l.geometry, locked823: l823.geometry, complete823: c823.geometry };
  geometry.result = [c.geometry, l.geometry, l823.geometry, c823.geometry].every(g => Object.values(g.ok).every(Boolean)) ? 'pass' : 'fail';
  writeJson(join(EV, 'geometry.json'), geometry);
  writeJson(join(EV, 'capture-errors.json'), errorsByWindow);
  console.log(JSON.stringify({ pres007: JSON.parse(readFileSync(join(rowsDir, 'pres-007.json'), 'utf8')).result, mec003010: row010.result,
    mec003011: JSON.parse(readFileSync(join(rowsDir, 'mec-003-011.json'), 'utf8')).result, geometry: geometry.result,
    errors: errorsByWindow.map(e => [e.window, e.consoleErrors.length, e.pageErrors.length, e.assetLoadErrors.length]) }));
} finally { await browser.close(); }

// WORK-025-2 phone stand-in (chromium iPhone 15 landscape emulation; NOT a device): every screen at the emulated phone height and at
// 1920×823, the touch joystick by CDP touch events, and the hidden debug entry by tap. Playwright library, pinned chromium-1243; no install.
//   TPP_BASE=http://127.0.0.1:5204 TPP_EVIDENCE=<EV> TPP_WORK=WORK-025-2 TPP_MILESTONE=MILESTONE-007 node tests/e2e/phone-stills.mjs
// Strict boot (no ?lenient=1). Every value is read from window.__tpp / the DOM / the log; device cells stay not-run (user, dry-run session).
import { join } from 'node:path';
import { devices } from 'playwright';
import { sha, launch, boot, waitScene, getState, lines, until, makeFixture, debugClick, setDebug, tapSlot, shot, writeJson, errorsSummary, startStreamRecording, encode } from './lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const captures = join(EV, 'captures'), DEVICE = 'iPhone 15 landscape';
// Playwright's descriptor keeps the portrait screen (393×852) for the landscape viewport, so chromium reports screen.orientation
// portrait-primary and the game raises its rotate curtain; a phone held in landscape reports landscape, hence the swapped screen.
const PHONE = { name: DEVICE, contextOptions: { ...devices[DEVICE], screen: { width: 852, height: 393 } } }, DESK = { name: 'desktop 1920x823', contextOptions: { viewport: { width: 1920, height: 823 } } };
const saves = {};
const save = name => (saves[name] ??= makeFixture(name.endsWith('.steps') ? ['--steps', `tests/view/capture/${name}.json`] : ['--scenario', name]).text);
const errors = [];

async function drain(page, ms = 12000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await getState(page);
    if (s.dialogue.current) { await page.locator('[data-panel="dialogue"]').click({ position: { x: 300, y: 60 } }).catch(() => {}); await page.waitForTimeout(350); continue; }
    await page.waitForTimeout(500); if (!(await getState(page)).dialogue.current) return;
  }
}
const visible = (page, sel) => until(page, sel => { const e = document.querySelector(sel); return !!e && !e.hidden && !e.closest('[hidden]'); }, sel, 15000);
const designOn = async page => { await until(page, () => !document.querySelector('.tpp-design-toggle').disabled, null, 8000); if ((await getState(page)).mode !== 'design') { await page.click('.tpp-design-toggle'); await page.waitForTimeout(400); } };
const street = async (page, w) => { await waitScene(page, 'Street', 900); await drain(page); };
const interior = async page => { await waitScene(page, 'Interior', 900); await drain(page); };

/** [n, id, save | null, reach(page, target)] — the states the earlier capture scripts reach, from real-content saves. */
const SCREENS = [
  [1, 'street-idle', null, street],
  [2, 'street-attention', 'street-ack1-owed3.steps', async p => { await street(p); await until(p, () => window.__tpp.game.scene.getScene('Street').houses.get('pet-house').icon.visible, null, 8000); }],
  [3, 'street-celebration', 'save-v1.milestone', async p => { await waitScene(p, 'Street', 900); await visible(p, '.tpp-milestonePopup'); await p.waitForTimeout(600); }],
  [4, 'street-reveal-popup', 'save-v1.milestone', async p => { await waitScene(p, 'Street', 900); await visible(p, '.tpp-milestonePopup'); await p.locator('.tpp-milestonePopup .tpp-collect').click();
    await until(p, () => [...document.querySelectorAll('.tpp-revealPopup:not([hidden]) .tpp-clue')].filter(c => !c.hidden).length === 3, null, 10000); await p.waitForTimeout(500); }],
  [5, 'street-arrival', 'arrival-held-box.steps', async p => { await waitScene(p, 'Street', 1500); }],
  [6, 'interior', 'dog-room-intro-done', interior],
  [7, 'design-mode', 'dog-room-intro-done', async p => { await interior(p); await designOn(p); }],
  [8, 'chooser', 'dog-room-intro-done', async p => { await interior(p); await designOn(p); await tapSlot(p, 'floor-3'); await visible(p, '.tpp-chooser'); await p.waitForTimeout(300); }],
  [9, 'replace-remove', 'save-v1', async p => { await interior(p); await designOn(p); await tapSlot(p, 'floor-3'); await until(p, () => !!document.querySelector('.tpp-panel-layer:not([hidden]) .tpp-replaceRemove'), null, 5000); await p.waitForTimeout(300); }],
  [10, 'want-states', 'dog-room-intro-done', interior],
  [11, 'dialogue', null, async p => { await waitScene(p, 'Street', 900); await visible(p, '[data-panel="dialogue"]'); await p.waitForTimeout(600); }],
  [12, 'reveal', 'ack-phase-4', async p => { await street(p); await until(p, () => { const l = document.querySelector('.tpp-reveal-link'); return l && !l.hidden && !l.disabled; }, null, 15000);
    await p.locator('.tpp-reveal-link').click(); await visible(p, '.tpp-revealPanel'); await p.waitForTimeout(500); }],
  [13, 'toast', null, async p => { await street(p); await debugClick(p, 'Simulate a purchase', 'Fire one event'); await setDebug(p, false); await visible(p, '[data-panel="toast"]').catch(() => null); await p.waitForTimeout(300); }],
  [14, 'debug-panel', null, async p => { await street(p); await setDebug(p, true); await p.waitForTimeout(400); }],
  [15, 'stars', 'save-v1', async p => { await interior(p); }],
];

/** Layout facts for the sidecar: device, DPR, game size, viewport, HUD and joystick rects inside the viewport. */
const layoutRead = page => page.evaluate(() => {
  const { game } = window.__tpp, key = game.scene.isActive('Interior') ? 'Interior' : 'Street', sc = game.scene.getScene(key), j = sc.joystick?.base, r = game.canvas.getBoundingClientRect(), k = r.width / 1920;
  const box = el => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) }; };
  const hud = [...document.querySelectorAll('.safe-hud')].filter(e => !e.hidden && !e.closest('[hidden]')).map(box);
  const joy = j && j.visible ? { x: Math.round(r.left + (j.x - j.displayWidth / 2) * k), y: Math.round(r.top + (j.y - j.displayHeight / 2) * k), w: Math.round(j.displayWidth * k), h: Math.round(j.displayHeight * k) } : null;
  const inside = b => !b || (b.x >= 0 && b.y >= 0 && b.x + b.w <= innerWidth + 1 && b.y + b.h <= innerHeight + 1);
  const probe = document.getElementById('safe-area-probe'), cs = probe ? getComputedStyle(probe) : null;
  return { scene: key, dpr: devicePixelRatio, gameSize: { w: game.scale.gameSize.width, h: game.scale.gameSize.height }, inner: { w: innerWidth, h: innerHeight }, canvas: box(game.canvas),
    hud, joystick: joy, hudInside: hud.every(inside), joystickInside: inside(joy), safeArea: cs ? [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft] : null, userAgent: navigator.userAgent };
});

async function screens(browser) {
  const rows = [];
  for (const [n, id, saveName, reach] of SCREENS) for (const target of [PHONE, DESK]) {
    const w = await boot(browser, { save: saveName ? save(saveName) : null, query: '', contextOptions: target.contextOptions });
    const row = { n, id, target: target.name, save: saveName ?? 'fresh (none)' };
    try {
      await reach(w.page, target);
      const layout = await layoutRead(w.page), started = (await lines(w.page, 'session.started'))[0] ?? null;
      row.png = await shot(w.page, browser, captures, `phone-${n}-${id}-${Math.round(layout.gameSize.h)}`, { descriptor: target.name, deviceScaleFactor: layout.dpr, gameSize: layout.gameSize, inner: layout.inner, save: row.save, emulation: target === PHONE ? 'chromium device emulation, not a device' : 'desktop viewport' });
      Object.assign(row, { layout, sessionStarted: started && { viewport: started.viewport, userAgent: started.userAgent }, ok: true });
    } catch (error) { Object.assign(row, { ok: false, error: String(error).slice(0, 300) }); }
    const all = await lines(w.page).catch(() => []);
    row.errors = errorsSummary(w.errors, all); errors.push({ window: `${n}-${id}-${target.name}`, ...row.errors });
    rows.push(row); await w.context.close();
    console.log(n, id, target.name, row.ok ? row.layout.gameSize.h : row.error);
  }
  return rows;
}

/** Touch joystick drag (+60 game px right, held ≥ 1 s), then the hidden debug entry by tap, under the phone descriptor. */
async function touchJoystick(browser) {
  const { touchDrag } = await import('./lib/harness.mjs');
  const w = await boot(browser, { query: '', contextOptions: PHONE.contextOptions }), { page } = w;
  await street(page);
  const read = () => page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'), a = st.avatar, j = st.joystick;
    return { x: a.x, y: a.y, anim: a.anims.currentAnim?.key ?? null, flipX: a.flipX, facing: window.__tpp.store.getState().avatar.facing, vector: j.vector,
      base: { x: j.base.x, y: j.base.y, visible: j.base.visible }, knob: { x: j.knob.x, y: j.knob.y } }; });
  const c = await page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'), j = st.joystick.base, r = window.__tpp.game.canvas.getBoundingClientRect(), s = r.width / 1920; return { x: r.left + j.x * s, y: r.top + j.y * s, s }; });
  const before = await read(), n0 = (await lines(page)).length;
  const rec = await startStreamRecording(page, join(EV, 'loops', 'phone-joystick-walk-frames'), { maxWidth: 734, maxHeight: 343 });
  const { held } = await touchDrag(page, { x: c.x, y: c.y }, { x: c.x + 60 * c.s, y: c.y }, { during: read });
  await page.waitForTimeout(400);
  const after = await read();
  const frames = await rec.stop();
  const loop = encode(join(EV, 'loops'), 'phone-joystick-walk', frames, { descriptor: DEVICE, note: 'CDP Input.dispatchTouchEvent drag +60 game px, held ~1.1 s', emulation: 'chromium device emulation, not a device' });
  const joy = (await lines(page, 'input.joystick')).filter(l => true).slice(-2), fresh = (await lines(page)).slice(n0).filter(l => l.type === 'input.joystick');
  const knobOffset = held && { x: Math.round(held.knob.x - held.base.x), y: Math.round(held.knob.y - held.base.y) };
  // Hidden entry: tap the street HUD's top-right debug entry under touch (VERIFY-MEC-010-012 touch half, ENV-IPH stand-in).
  const entry = await page.locator('.tpp-debug-entry:visible').first().boundingBox();
  const n1 = (await lines(page)).length;
  await page.touchscreen.tap(entry.x + entry.width / 2, entry.y + entry.height / 2); await page.waitForTimeout(500);
  const panelLines = (await lines(page)).slice(n1).filter(l => l.type === 'ui.debugPanel');
  const joystickHidden = await page.evaluate(() => !window.__tpp.game.scene.getScene('Street').joystick.base.visible);
  const debugPng = await shot(page, browser, captures, 'phone-14-debug-panel-by-tap', { descriptor: DEVICE, entry, note: 'opened by touchscreen.tap on .tpp-debug-entry' });
  const result = { work: 'WORK-025-2', sha, descriptor: DEVICE, emulation: 'chromium device emulation (hasTouch, isMobile, DPR 3), not a device', centreCss: c, before, held, after, knobOffset,
    expectedKnobOffset: held && { x: Math.round(held.vector.x * 80), y: Math.round(held.vector.y * 80) }, joystickRecords: fresh, loop: loop.outputs ?? loop.gap,
    checks: {
      start: fresh[0]?.phase === 'start', end: fresh.at(-1)?.phase === 'end' && fresh.at(-1).ms >= 900, avatarMovedRight: held && held.x > before.x,
      walkSideDuringHold: held?.anim === 'avatar-walk-side' && held.flipX === false, idleSideAfter: after.anim === 'avatar-idle-side',
      knobMatchesVector: held && Math.abs(knobOffset.x - held.vector.x * 80) <= 2 && Math.abs(knobOffset.y - held.vector.y * 80) <= 2,
      hiddenEntryOpens: panelLines.some(l => l.open === true), joystickHiddenWhileOpen: joystickHidden },
    hiddenEntry: { entryRect: entry, records: panelLines, joystickHidden, still: debugPng }, lastJoystickLines: joy };
  result.ok = Object.values(result.checks).every(Boolean);
  errors.push({ window: 'touch-joystick', ...errorsSummary(w.errors, await lines(page)) });
  await w.context.close();
  writeJson(join(EV, 'touch-joystick.json'), result);
  console.log('touch', JSON.stringify(result.checks));
  return result;
}

const browser = await launch();
try {
  const rows = await screens(browser);
  const touch = await touchJoystick(browser);
  const phone = rows.filter(r => r.target === DEVICE && r.ok);
  const report = { work: 'WORK-025-2', sha, harness: 'tests/e2e/phone-stills.mjs', descriptor: { name: DEVICE, ...devices[DEVICE], screenOverride: PHONE.contextOptions.screen }, browser: browser.version(),
    note: 'chromium iPhone 15 landscape emulation and a 1920x823 desktop viewport are stand-ins; iPhone 15+ Safari / home-screen and Mac Safari are not-run (user, dry-run session); no notch emulation, safe-area insets read as 0',
    phoneHeight: phone[0]?.layout.gameSize.h ?? null, sessionStarted: phone[0]?.sessionStarted ?? null,
    screens: rows.map(r => ({ n: r.n, id: r.id, target: r.target, save: r.save, ok: r.ok, error: r.error, png: r.png, gameSize: r.layout?.gameSize, inner: r.layout?.inner, dpr: r.layout?.dpr,
      hudInside: r.layout?.hudInside, joystickInside: r.layout?.joystickInside, hud: r.layout?.hud, joystick: r.layout?.joystick, safeArea: r.layout?.safeArea,
      consoleErrors: r.errors.consoleErrors.length, pageErrors: r.errors.pageErrors.length, assetLoadErrors: r.errors.assetLoadErrors.length })),
    touch: touch.checks, errors };
  report.ok = rows.every(r => r.ok && r.layout.hudInside && r.layout.joystickInside && r.errors.consoleErrors.length === 0 && r.errors.pageErrors.length === 0 && r.errors.assetLoadErrors.length === 0) && touch.ok;
  writeJson(join(EV, 'phone-stills-report.json'), report);
  console.log(JSON.stringify({ ok: report.ok, screens: rows.length, failed: rows.filter(r => !r.ok).map(r => `${r.n}-${r.target}`), phoneHeight: report.phoneHeight }));
  process.exitCode = report.ok ? 0 : 1;
} finally { await browser.close(); }

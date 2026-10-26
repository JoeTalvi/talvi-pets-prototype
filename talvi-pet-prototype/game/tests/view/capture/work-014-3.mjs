// WORK-014-3 capture + state read (Playwright library, pinned chromium-1243 by executablePath; no channel, no install).
//   node tests/view/capture/work-014-3.mjs <dog-room-intro-done.real.json> <save-v1.real.json> <parse-error.json>
//   (dev server on 5193; TPP_BASE / TPP_EVIDENCE override)
// Screenshots the debug panel open, the room with the alignment grid at 1920×1080 and 1920×823, and the room after a fixture Load;
// writes debug-report.json (ui.debugPanel, perf.sample, refused/accepted fixture) and alignment-report.json (≤ 2 px state read).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5193';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const lane = join(evidence, 'WORK-014-3'), captures = join(lane, 'captures');
mkdirSync(captures, { recursive: true });
const [introPath, saveV1Path, corruptPath] = process.argv.slice(2);
const introDone = readFileSync(introPath, 'utf8'), saveV1 = readFileSync(saveV1Path, 'utf8'), corrupt = readFileSync(corruptPath, 'utf8');

function nextPng(point) {
  const taken = readdirSync(captures).filter(f => f.startsWith(`${point}-`) && f.endsWith('.png')).length;
  return join(captures, `${point}-${String(taken + 1).padStart(3, '0')}.png`);
}

async function shot(page, browser, point, height, target, note) {
  const png = nextPng(point);
  await page.screenshot({ path: png });
  const sidecar = { milestone: 'MILESTONE-005', work: 'WORK-014-3', kind: 'screenshot', point, sequence: Number(png.slice(-7, -4)),
    target, captured_at: new Date().toISOString(), viewport: { width: 1920, height }, bytes: statSync(png).size,
    tool: 'playwright-library', binary: executablePath, version: browser.version(), seededSave: 'dog-room-intro-done (real content)', note };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  return png;
}

async function boot(browser, height, query) {
  const context = await browser.newContext({ viewport: { width: 1920, height } });
  await context.addInitScript(text => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1'); } }, introDone);
  const page = await context.newPage(), errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e)));
  const target = `${base}/${query}`;
  await page.goto(target);
  await waitInterior(page);
  return { context, page, errors, target };
}

async function waitInterior(page) {
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Interior'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count()) await dismiss.click();
}

const clickRow = (page, label, index) => page.evaluate(([label, index]) => {
  const row = [...document.querySelectorAll('.tpp-debug-row')].find(r => r.querySelector('label').textContent === label);
  row.querySelectorAll('button:not([role=switch])')[index].click();
}, [label, index]);
const lines = (page, ...types) => page.evaluate(types => window.__tpp.log.lines().filter(l => types.includes(l.type)), types);

async function debugSequence(browser) {
  const { context, page, errors, target } = await boot(browser, 1080, '?lenient=1');
  await page.keyboard.press('Backquote'); await page.waitForTimeout(1200);
  const panelVisible = await page.evaluate(() => !document.querySelector('[data-panel=debugPanel]').hidden);
  const info = await page.evaluate(() => document.querySelector('[data-panel=debugPanel] pre').textContent);
  const png = await shot(page, browser, 'work-014-3-debug-open', 1080, target, 'Backquote pressed: the debug panel over the dimmed room, info block filled');
  const joystickHidden = await page.evaluate(() => !window.__tpp.game.scene.getScene('Interior').joystick.visible);
  const sample = await page.evaluate(() => window.__tpp.sample('idle'));
  const perf = await lines(page, 'perf.sample');
  await page.fill('[data-panel=debugPanel] textarea', corrupt);
  const saveBefore = await page.evaluate(() => localStorage.getItem('tpp.save'));
  await clickRow(page, 'Fixture', 0);
  const refused = await page.evaluate(() => [...document.querySelectorAll('.tpp-debug-error')].map(e => e.textContent));
  const saveAfterRefused = await page.evaluate(() => localStorage.getItem('tpp.save'));
  const loadedAfterRefused = await lines(page, 'save.loaded');
  await page.fill('[data-panel=debugPanel] textarea', saveV1);
  await Promise.all([page.waitForEvent('load'), clickRow(page, 'Fixture', 0)]);
  await waitInterior(page);
  const afterLoad = await page.evaluate(() => {
    const { store, log, game } = window.__tpp, s = store.getState(), interior = game.scene.getScene('Interior');
    return { scene: s.scene, placements: s.rooms['dog-room'].placements,
      sprites: Object.fromEntries([...interior.charms].map(([slot, sprite]) => [slot, sprite.texture.key])),
      saveLoaded: log.lines().filter(l => l.type === 'save.loaded') };
  });
  const loadedPng = await shot(page, browser, 'work-014-3-fixture-loaded', 1080, target, 'after the real-content save-v1 fixture Load and the reload');
  const debugPanelLines = await lines(page, 'ui.debugPanel');
  await context.close();
  return { panelVisible, joystickHidden, info, screenshot: png, sample, perf, debugPanelLines,
    corruptFixture: { refused, tppSaveUnchanged: saveBefore === saveAfterRefused, saveLoadedLines: loadedAfterRefused },
    validFixture: { ...afterLoad, screenshot: loadedPng }, errors };
}

async function gridSequence(browser, height) {
  const { context, page, errors, target } = await boot(browser, height, '?lenient=1&grid=1');
  const png = await shot(page, browser, `work-014-3-room-grid-${height}`, height, target, 'room with the Dog, ?grid=1: Phaser crosshairs + overlay targets at the five viewport points');
  const read = await page.evaluate(() => {
    const { game } = window.__tpp, canvas = game.canvas.getBoundingClientRect(), k = canvas.width / 1920;
    const H = game.scale.gameSize.height, points = { tl: [0, 0], tr: [1920, 0], bl: [0, H], br: [1920, H], centre: [960, H / 2] };
    const interior = game.scene.getScene('Interior');
    const targets = [...document.querySelectorAll('#alignment-grid .alignment-target')].map(t => {
      const r = t.getBoundingClientRect(), [x, y] = points[t.dataset.corner];
      const centre = { x: r.left + r.width / 2, y: r.top + r.height / 2 }, expected = { x: canvas.left + x * k, y: canvas.top + y * k };
      const delta = Math.hypot(centre.x - expected.x, centre.y - expected.y);
      return { corner: t.dataset.corner, centre, expected, deltaPx: Math.round(delta * 100) / 100, pass: delta <= 2 };
    });
    return { gameSize: { w: game.scale.gameSize.width, h: H }, canvasRect: { left: canvas.left, top: canvas.top, width: canvas.width, height: canvas.height },
      cameraScrollY: interior.cameras.main.scrollY, sceneGrid: interior.alignment ? { depth: interior.alignment.depth, scrollFactor: interior.alignment.scrollFactorX, points: interior.alignment.getData('points') } : null, targets };
  });
  for (const corner of ['tl', 'tr', 'bl', 'br', 'centre']) {
    const box = await page.locator(`.alignment-target[data-corner=${corner}]`).boundingBox();
    await page.mouse.click(Math.min(Math.max(box.x + box.width / 2, 1), 1919), Math.min(Math.max(box.y + box.height / 2, 1), height - 1));
  }
  const hits = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('.alignment-target')].map(t => [t.dataset.corner, t.dataset.hit === 'true'])));
  await context.close();
  return { viewport: { width: 1920, height }, screenshot: png, ...read, hits, verdict: read.targets.every(t => t.pass) ? 'pass' : 'fail', errors };
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const debug = await debugSequence(browser);
  writeFileSync(join(lane, 'debug-report.json'), `${JSON.stringify({ kind: 'state read', captured_at: new Date().toISOString(), ...debug }, null, 2)}\n`);
  const grids = [await gridSequence(browser, 1080), await gridSequence(browser, 823)];
  writeFileSync(join(lane, 'alignment-report.json'), `${JSON.stringify({ kind: 'state read', captured_at: new Date().toISOString(), runs: grids }, null, 2)}\n`);
  console.log(JSON.stringify({ debugPanel: debug.panelVisible, perf: debug.perf.length, refused: debug.corruptFixture.refused, loaded: debug.validFixture.placements, grid: grids.map(g => [g.viewport.height, g.verdict, g.targets.map(t => t.deltaPx)]) }));
} finally { await browser.close(); }

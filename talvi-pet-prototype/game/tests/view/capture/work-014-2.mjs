// WORK-014-2 capture + state read (Playwright library, pinned chromium-1243 by executablePath; no channel, no install).
//   node tests/view/capture/work-014-2.mjs <dog-room-intro-done.real.json>   (dev server on 5193; TPP_BASE / TPP_EVIDENCE override)
// Screenshots design mode with the chooser open, the placed lamp and the Replace/Remove sheet (1920×1080, plus the chooser at 823),
// then places painting@wall-2 + lamp@floor-3 for the MEC-005-014 depth read, and writes design-report.json.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5193';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const lane = join(evidence, 'WORK-014-2'), captures = join(lane, 'captures');
mkdirSync(captures, { recursive: true });
const RECORDS = ['input.tap', 'input.drag', 'ui.chooserOpened', 'ui.chooserClosed', 'ui.sheetOpened', 'ui.sheetClosed', 'charm.placed', 'charm.removed', 'mode.changed', 'action.rejected'];

function nextPng(point) {
  const taken = readdirSync(captures).filter(f => f.startsWith(`${point}-`) && f.endsWith('.png')).length;
  return join(captures, `${point}-${String(taken + 1).padStart(3, '0')}.png`);
}

async function shot(page, browser, point, height, note) {
  const png = nextPng(point);
  await page.screenshot({ path: png });
  const sidecar = { milestone: 'MILESTONE-005', work: 'WORK-014-2', kind: 'screenshot', point, sequence: Number(png.slice(-7, -4)),
    target: `${base}/?lenient=1`, captured_at: new Date().toISOString(), viewport: { width: 1920, height }, bytes: statSync(png).size,
    tool: 'playwright-library', binary: executablePath, version: browser.version(), seededSave: 'dog-room-intro-done (real content)', note };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  return png;
}

/** Page coordinates of a slot outline's centre: world (x, y) minus the camera scroll, scaled by the canvas width. */
const slotPoint = (page, slotId) => page.evaluate(slotId => {
  const interior = window.__tpp.game.scene.getScene('Interior'), outline = interior.outlines.get(slotId);
  const box = outline.polygon.points.reduce((a, p) => ({ x: a.x + p.x / outline.polygon.points.length, y: a.y + p.y / outline.polygon.points.length }), { x: 0, y: 0 });
  const rect = window.__tpp.game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  return { x: rect.left + box.x * scale, y: rect.top + (box.y - interior.cameras.main.scrollY) * scale };
}, slotId);

async function tapSlot(page, slotId) {
  const p = await slotPoint(page, slotId);
  await page.mouse.click(p.x, p.y, { delay: 40 });
  await page.waitForTimeout(250);
}

async function boot(browser, height, save) {
  const context = await browser.newContext({ viewport: { width: 1920, height } });
  await context.addInitScript(text => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1'); } }, save);
  const page = await context.newPage(), errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e)));
  await page.goto(`${base}/?lenient=1`);
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Interior'), null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count()) await dismiss.click();
  return { context, page, errors };
}

const readCards = page => page.evaluate(() => [...document.querySelectorAll('.tpp-chooser .tpp-charm-card')].map(c => ({
  typeId: c.dataset.typeId, name: c.querySelector('.tpp-charm-name').textContent,
  sprite: c.querySelector('[data-asset-id]').tagName === 'IMG' ? c.querySelector('[data-asset-id]').getAttribute('src') : 'placeholder:.tpp-asset-slot',
  tags: [...c.querySelectorAll('.tpp-tag')].map(t => ({ icon: t.querySelector('[data-asset-id]').getAttribute('data-asset-id'), iconLoaded: t.querySelector('img')?.naturalWidth > 0, name: t.textContent })),
})));

const readWorld = page => page.evaluate(records => {
  const { store, log, game } = window.__tpp, interior = game.scene.getScene('Interior');
  const sprite = id => { const s = interior.charms.get(id); return s ? { texture: s.texture.key, x: s.x, y: s.y, depth: s.depth } : null; };
  return {
    placements: { ...store.getState().rooms['dog-room'].placements }, mode: store.getState().mode,
    outlines: [...interior.outlines.values()].map(o => ({ slotId: o.slotId, visible: o.visible, state: o.outlineState, depth: o.depth })),
    sprites: { 'floor-3': sprite('floor-3'), 'wall-2': sprite('wall-2') }, avatar: { x: interior.avatar.x, y: interior.avatar.y, depth: interior.avatar.depth },
    dog: interior.pet ? { x: interior.pet.x, y: interior.pet.y, depth: interior.pet.depth } : null,
    lines: log.lines().filter(l => records.includes(l.type)),
  };
}, RECORDS);

async function designSequence(browser, save) {
  const { context, page, errors } = await boot(browser, 1080, save);
  const before = await readWorld(page);
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  const tapsAfterDecorate = (await readWorld(page)).lines.filter(l => l.type === 'input.tap').length;
  await tapSlot(page, 'floor-3'); await page.waitForSelector('.tpp-chooser:not([hidden])');
  const cards = await readCards(page);
  const chooserTitle = await page.locator('.tpp-chooser-title').textContent();
  const pngs = [await shot(page, browser, 'work-014-2-chooser-open', 1080, 'Done toggle, 12 outlines, floor-3 selected, chooser open')];
  await page.click('.tpp-charm-card[data-type-id="lamp"]'); await page.waitForTimeout(500);
  pngs.push(await shot(page, browser, 'work-014-2-placed-lamp', 1080, 'lamp at floor-3 after the 180 ms pop; chooser closed; outline solid'));
  const placed = await readWorld(page);
  await tapSlot(page, 'floor-3'); await page.waitForSelector('.tpp-panel-layer:not([hidden]) .tpp-replaceRemove');
  pngs.push(await shot(page, browser, 'work-014-2-sheet-open', 1080, 'Replace/Remove sheet above floor-3'));
  await page.click('.tpp-replaceRemove [data-action="remove"]'); await page.waitForTimeout(300);
  await tapSlot(page, 'wall-2'); await page.click('.tpp-charm-card[data-type-id="painting"]'); await page.waitForTimeout(300);
  await tapSlot(page, 'floor-3'); await page.click('.tpp-charm-card[data-type-id="lamp"]'); await page.waitForTimeout(300);
  const depthRead = await readWorld(page);
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  const after = await readWorld(page);
  await context.close();
  return { before, tapsAfterDecorate, cards, chooserTitle, placed, depthRead, after, pngs, ...errors };
}

async function chooserAt823(browser, save) {
  const { context, page, errors } = await boot(browser, 823, save);
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  await tapSlot(page, 'floor-3'); await page.waitForSelector('.tpp-chooser:not([hidden])');
  const png = await shot(page, browser, 'work-014-2-chooser-open-823', 823, 'chooser open at 1920×823');
  const read = await readWorld(page);
  await context.close();
  return { png, lines: read.lines, ...errors };
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const save = readFileSync(process.argv[2], 'utf8');
  const design = await designSequence(browser, save);
  const at823 = await chooserAt823(browser, save);
  const report = { at: new Date().toISOString(), chromium: browser.version(), kind: 'state read', design, at823 };
  writeFileSync(join(lane, 'design-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ pngs: [...design.pngs, at823.png], cards: design.cards.map(c => c.name), errors: [...design.consoleErrors, ...design.pageErrors] }));
} finally { await browser.close(); }

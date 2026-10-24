// WORK-014-4 combined smoke + package captures (Playwright library, pinned chromium-1243 by executablePath; no channel, no install).
//   node tests/view/capture/work-014-4.mjs <dog-room-intro-done.real.json> <save-v1.real.json> <parse-error.json>
//   (dev server on 5193; TPP_BASE / TPP_EVIDENCE override)
// Every expectation is read from window.__tpp.log.lines() / store.getState(); a missing line is ok:false with what was found, never retried.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5193';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const lane = join(evidence, 'WORK-014-4'), captures = join(lane, 'captures');
mkdirSync(captures, { recursive: true });
const [introPath, saveV1Path, corruptPath] = process.argv.slice(2);
const introDone = readFileSync(introPath, 'utf8'), saveV1 = readFileSync(saveV1Path, 'utf8'), corrupt = readFileSync(corruptPath, 'utf8');
// Review WORK-014-3-1 A-4: the intro-done fixture starts the Dog walking; the grid pair seeds it idle at the authored petSpawn.
const introIdle = (() => {
  const save = JSON.parse(introDone);
  save.state.pets.dog.behaviour = { ...save.state.pets.dog.behaviour, phase: 'idle', x: 919, y: 800, facing: 'left', timerMs: 600000, target: null, verb: null, reaction: null };
  return JSON.stringify(save);
})();

const steps = [];
const step = (name, ok, expected, found) => { steps.push({ step: name, ok: Boolean(ok), expected, found }); return ok; };

function nextPng(point) {
  const taken = readdirSync(captures).filter(f => f.startsWith(`${point}-`) && f.endsWith('.png')).length;
  return join(captures, `${point}-${String(taken + 1).padStart(3, '0')}.png`);
}
async function shot(page, browser, point, height, target, seededSave, note) {
  const png = nextPng(point);
  await page.screenshot({ path: png });
  const sidecar = { milestone: 'MILESTONE-005', work: 'WORK-014-4', kind: 'screenshot', point, sequence: Number(png.slice(-7, -4)),
    target, captured_at: new Date().toISOString(), viewport: { width: 1920, height }, bytes: statSync(png).size,
    tool: 'playwright-library', binary: executablePath, version: browser.version(), seededSave, note };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  return png;
}

async function boot(browser, height, query, save) {
  const context = await browser.newContext({ viewport: { width: 1920, height }, acceptDownloads: true });
  await context.addInitScript(text => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear(); if (text) localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1');
  }, save);
  const page = await context.newPage(), errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e)));
  const target = `${base}/${query}`;
  await page.goto(target);
  return { context, page, errors, target };
}
async function waitScene(page, key) {
  await page.waitForFunction(key => window.__tpp && window.__tpp.game.scene.isActive(key), key, { timeout: 30000 });
  await page.waitForTimeout(1200);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
}
const lines = (page, ...types) => page.evaluate(types => window.__tpp.log.lines().filter(l => types.includes(l.type)), types);
const state = page => page.evaluate(() => { const s = window.__tpp.store.getState(); return { scene: s.scene, mode: s.mode, avatar: s.avatar, placements: s.scene.kind === 'interior' ? s.rooms[s.scene.roomId].placements : null }; });
const slotPoint = (page, slotId) => page.evaluate(slotId => {
  const interior = window.__tpp.game.scene.getScene('Interior'), outline = interior.outlines.get(slotId);
  const box = outline.polygon.points.reduce((a, p) => ({ x: a.x + p.x / outline.polygon.points.length, y: a.y + p.y / outline.polygon.points.length }), { x: 0, y: 0 });
  const rect = window.__tpp.game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  return { x: rect.left + box.x * scale, y: rect.top + (box.y - interior.cameras.main.scrollY) * scale };
}, slotId);
async function tapSlot(page, slotId) { const p = await slotPoint(page, slotId); await page.mouse.click(p.x, p.y, { delay: 40 }); await page.waitForTimeout(300); }
const previewBoxes = page => page.evaluate(() => {
  const row = [...document.querySelectorAll('.tpp-debug-row')].find(r => r.querySelector('label').textContent === 'Preview layers');
  return [...row.querySelectorAll('input[type=checkbox]')].map(b => b.checked);
});
const clickPreview = (page, index) => page.evaluate(index => {
  const row = [...document.querySelectorAll('.tpp-debug-row')].find(r => r.querySelector('label').textContent === 'Preview layers');
  row.querySelectorAll('input[type=checkbox]')[index].click();
}, index);
const clickRow = (page, label, index) => page.evaluate(([label, index]) => {
  const row = [...document.querySelectorAll('.tpp-debug-row')].find(r => r.querySelector('label').textContent === label);
  row.querySelectorAll('button:not([role=switch])')[index].click();
}, [label, index]);
const holdUntil = async (page, key, test, ms = 20000) => {
  await page.keyboard.down(key);
  try { await page.waitForFunction(test, null, { timeout: ms, polling: 16 }); return true; } catch { return false; } finally { await page.keyboard.up(key); }
};
const layerRead = (page, sceneKey) => page.evaluate(sceneKey => {
  const scene = window.__tpp.game.scene.getScene(sceneKey);
  return Object.fromEntries(Object.entries(scene.preview.layers).map(([name, layer]) => [name, { objects: layer.objects.length,
    minDepth: Math.min(...layer.objects.map(o => o.depth)), ...(layer.label ? { label: layer.label() } : {}), ...(layer.sprites ? { sprites: layer.sprites.size } : {}) }]));
}, sceneKey);
const realCharmsVisible = page => page.evaluate(() => [...window.__tpp.game.scene.getScene('Interior').charms.values()].map(c => c.visible));

/** Fresh boot → street; geometry layer via row 16 on the street; keyboard walk into starter-front → fades → the Dog room. */
async function streetAndDoor(browser) {
  const { context, page, errors, target } = await boot(browser, 1080, '?lenient=1', null);
  await waitScene(page, 'Street');
  const started = await lines(page, 'session.started');
  step('street boot', started.length === 1 && (await state(page)).scene.kind === 'street', 'session.started ×1, scene street', { sessionStarted: started.length, scene: (await state(page)).scene });
  // A fresh save opens the orientation dialogue on the street (input frozen); the dialogue UI is a later lane's, so it is drained through the store.
  const drained = await page.evaluate(() => { let n = 0; const { store } = window.__tpp; while (store.getState().dialogue.current && n < 50) { store.dispatch({ type: 'advanceDialogue' }); n++; } return n; });
  step('orientation dialogue drained', true, 'advanceDialogue dispatched through __tpp.store until closed (no dialogue UI yet)', { advances: drained });
  await page.keyboard.press('Backquote'); await page.waitForTimeout(300);
  await clickPreview(page, 2); await page.keyboard.press('Backquote'); await page.waitForTimeout(800);
  const streetLayers = await layerRead(page, 'Street');
  const streetPng = await shot(page, browser, 'work-014-4-preview-street', 1080, target, 'none (fresh boot)', 'placeholder Street with the geometry preview layer on (row 16 → Geometry), debug closed');
  step('street geometry layer', streetLayers.geometry?.objects > 0 && streetLayers.geometry.minDepth >= 10000 && !('segments' in streetLayers), 'geometry objects at depth >= 10000; no segments layer on the street', streetLayers);
  await page.keyboard.press('Backquote'); await clickPreview(page, 2); await page.keyboard.press('Backquote'); await page.waitForTimeout(300);
  const t0 = Date.now();
  const left = await holdUntil(page, 'KeyA', () => window.__tpp.store.getState().avatar.x <= 420);
  const inRoom = await holdUntil(page, 'KeyW', () => window.__tpp.store.getState().scene.kind === 'interior');
  const doorMs = Date.now() - t0;
  const fade = await page.evaluate(async () => {
    const changed = window.__tpp.log.lines().find(l => l.type === 'scene.changed');
    while (!window.__tpp.game.scene.isActive('Interior')) await new Promise(r => requestAnimationFrame(r));
    return { sceneChanged: changed ?? null, interiorActiveAt: performance.now() };
  });
  await page.waitForTimeout(600);
  const walk = { reachedX420: left, enteredDoor: inRoom, doorMs, state: await state(page) };
  const sc = fade.sceneChanged;
  step('door walk → scene.changed to dog-room', inRoom && sc?.to?.kind === 'interior' && sc.to.roomId === 'dog-room', 'scene.changed {to: interior dog-room} within 20 s of keys', { walk, sceneChanged: sc });
  step('fade gap ≈ 500 ms', sc && fade.interiorActiveAt - sc.t >= 200 && fade.interiorActiveAt - sc.t <= 900, 'scene.changed t → Interior active ≈ 250 ms fade-out (+ fade-in 250 ms after create)',
    { msSceneChangedToInteriorCreate: sc ? Math.round(fade.interiorActiveAt - sc.t) : null, note: 'log t of scene.changed to the first frame the Interior is active (fade-out 250 ms + scene start); the fade-in 250 ms follows' });
  const previewLines = await lines(page, 'ui.preview');
  await context.close();
  return { target, streetScreenshot: streetPng, streetLayers, walk, sceneChanged: sc, streetPreviewLines: previewLines, errors };
}

/** Intro-done seed: Decorate → floor-3 → lamp → sheet → Remove → Done → debug → preview layers → fixtures → reload → depth walk → log export. */
async function roomSmoke(browser) {
  const { context, page, errors, target } = await boot(browser, 1080, '?lenient=1', introDone);
  await waitScene(page, 'Interior');
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  step('Decorate → mode.changed design', (await lines(page, 'mode.changed')).at(-1)?.mode === 'design', 'mode.changed {mode: design}', await lines(page, 'mode.changed'));
  await tapSlot(page, 'floor-3');
  const opened = await lines(page, 'ui.chooserOpened');
  step('tap floor-3 → ui.chooserOpened', opened.at(-1)?.slotId === 'floor-3', 'ui.chooserOpened {slotId: floor-3}', opened);
  await page.click('.tpp-charm-card[data-type-id="lamp"]'); await page.waitForTimeout(500);
  const placed = await lines(page, 'charm.placed'), closed = await lines(page, 'ui.chooserClosed');
  step('lamp → charm.placed', placed.at(-1)?.typeId === 'lamp' && placed.at(-1)?.slotId === 'floor-3', 'charm.placed {floor-3, lamp}', placed);
  step('ui.chooserClosed pick', closed.at(-1)?.reason === 'pick', 'ui.chooserClosed {reason: pick}', closed);
  const placedPng = await shot(page, browser, 'work-014-4-smoke-placed', 1080, target, 'dog-room-intro-done (real content)', 'design mode: the lamp placed on floor-3 (pop finished)');
  await tapSlot(page, 'floor-3'); await page.waitForSelector('.tpp-panel-layer:not([hidden]) .tpp-replaceRemove');
  step('tap filled floor-3 → ui.sheetOpened', (await lines(page, 'ui.sheetOpened')).at(-1)?.slotId === 'floor-3', 'ui.sheetOpened {slotId: floor-3}', await lines(page, 'ui.sheetOpened'));
  const sheetPng = await shot(page, browser, 'work-014-4-smoke-sheet', 1080, target, 'dog-room-intro-done (real content)', 'Replace/Remove sheet open over the filled floor-3');
  await page.click('.tpp-replaceRemove [data-action="remove"]'); await page.waitForTimeout(400);
  step('Remove → charm.removed', (await lines(page, 'charm.removed')).at(-1)?.slotId === 'floor-3', 'charm.removed {floor-3}', await lines(page, 'charm.removed'));
  step('ui.sheetClosed', (await lines(page, 'ui.sheetClosed')).length >= 1, 'ui.sheetClosed', await lines(page, 'ui.sheetClosed'));
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  step('Done → mode.changed play', (await lines(page, 'mode.changed')).at(-1)?.mode === 'play', 'mode.changed {mode: play}', await lines(page, 'mode.changed'));
  const debug = await debugAndPreview(page, browser, target);
  const fixtures = await fixtureHalf(page);
  const depthWalk = await depthWalkRead(page);
  const saveWritten = await lines(page, 'save.written');
  // Gaps within one page session only (t restarts on reload): the bounded debounce's cadence.
  const gaps = saveWritten.slice(1).map((l, i) => l.t - saveWritten[i].t).filter(g => g > 0).sort((a, b) => a - b);
  const cadence = { count: saveWritten.length, medianGapMs: gaps.length ? Math.round(gaps[Math.floor(gaps.length / 2)]) : null, minGapMs: gaps.length ? Math.round(gaps[0]) : null };
  const exported = await exportLog(page);
  const assetErrors = await lines(page, 'asset.loadError');
  step('zero asset.loadError', assetErrors.length === 0, 'no asset.loadError lines', assetErrors);
  await context.close();
  return { target, placedScreenshot: placedPng, sheetScreenshot: sheetPng, ...debug, fixtures, depthWalk, saveWrittenCadence: cadence, exported, errors };
}

async function debugAndPreview(page, browser, target) {
  await page.keyboard.press('Backquote'); await page.waitForTimeout(800);
  step('Backquote → ui.debugPanel true', (await lines(page, 'ui.debugPanel')).at(-1)?.open === true, 'ui.debugPanel {open: true}', await lines(page, 'ui.debugPanel'));
  const debugTop = await shot(page, browser, 'work-014-4-smoke-debug', 1080, target, 'dog-room-intro-done (real content)', 'debug panel open, scrolled to the top (rows 1–10b)');
  await page.evaluate(() => { const el = document.querySelector('[data-panel=debugPanel] .tpp-debug-scroll'); el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  const debugScrolled = await shot(page, browser, 'work-014-4-smoke-debug-scrolled', 1080, target, 'dog-room-intro-done (real content)', 'debug panel scrolled to the bottom (rows 11–18 incl. row 16 Preview layers, enabled)');
  const boxesBefore = await previewBoxes(page);
  for (const i of [0, 1, 2, 3]) await clickPreview(page, i);
  await page.keyboard.press('Backquote'); await page.waitForTimeout(800);
  const layersOn = await layerRead(page, 'Interior');
  const realHidden = await realCharmsVisible(page);
  const previewPng = await shot(page, browser, 'work-014-4-preview-interior', 1080, target, 'dog-room-intro-done (real content)', 'all four preview layers on (fill, pets, geometry, segments), play mode, debug closed');
  step('four layers draw on the Interior', ['fill', 'pets', 'geometry', 'segments'].every(n => layersOn[n]?.objects > 0) && layersOn.fill.sprites === 12 && layersOn.pets.objects === 13 && realHidden.every(v => !v),
    'fill 12 sprites (real placements hidden), pets 13 images, geometry and segments drawn', { layersOn, realCharmsVisible: realHidden });
  await page.keyboard.press('Backquote'); await page.waitForTimeout(300);
  for (const i of [0, 1, 2, 3]) await clickPreview(page, i);
  const layersOff = await page.evaluate(() => Object.fromEntries(Object.entries(window.__tpp.game.scene.getScene('Interior').preview.layers).map(([n, l]) => [n, l.objects.length])));
  const previewLines = await lines(page, 'ui.preview');
  step('ui.preview ×4 on, ×4 off', previewLines.length === 8 && previewLines.slice(0, 4).every(l => l.on) && previewLines.slice(4).every(l => !l.on), 'ui.preview {layer, on} ×8', previewLines);
  return { debugScreenshots: [debugTop, debugScrolled], previewScreenshot: previewPng, boxesBefore, layersOn, layersOff, previewLines };
}

async function fixtureHalf(page) {
  await page.fill('[data-panel=debugPanel] textarea', corrupt);
  const saveBefore = await page.evaluate(() => localStorage.getItem('tpp.save'));
  await clickRow(page, 'Fixture', 0);
  const refused = await page.evaluate(() => [...document.querySelectorAll('.tpp-debug-error')].map(e => e.textContent));
  const after = await page.evaluate(() => localStorage.getItem('tpp.save'));
  const loadedAfterRefused = await lines(page, 'save.loaded');
  // The bounded debounce (WORK-004-1 fix) writes tpp.save up to 4×/s while the sim ticks, so "unchanged" = never the corrupt text and no save.loaded.
  step('corrupt fixture refused, nothing written', refused.some(t => /^Invalid fixture: parse/.test(t)) && after !== corrupt && loadedAfterRefused.length === 0,
    '"Invalid fixture: parse …", tpp.save never the corrupt text, no save.loaded', { refused, rawEqual: saveBefore === after, isCorrupt: after === corrupt, saveLoaded: loadedAfterRefused });
  await page.fill('[data-panel=debugPanel] textarea', saveV1);
  await Promise.all([page.waitForEvent('load'), clickRow(page, 'Fixture', 0)]);
  await waitScene(page, 'Interior');
  const read = await page.evaluate(() => {
    const { store, log, game } = window.__tpp, s = store.getState(), interior = game.scene.getScene('Interior');
    return { scene: s.scene, placements: s.rooms['dog-room'].placements, saveLoaded: log.lines().filter(l => l.type === 'save.loaded'),
      sprites: Object.fromEntries([...interior.charms].map(([slot, c]) => [slot, { x: c.x, y: c.y, depth: c.depth, key: c.texture.key }])) };
  });
  const expected = JSON.parse(saveV1).state.rooms['dog-room'].placements;
  const want = { 'large-1': [970, 930, 930], 'floor-3': [907, 618, 618], 'floor-5': [1213, 644, 644] };
  step('save-v1 loads → 3 placements, sprites at slot points and depths (MEC-005-016 desktop)', JSON.stringify(read.placements) === JSON.stringify(expected) && Object.entries(want).every(([slot, [x, y, d]]) => read.sprites[slot]?.x === x && read.sprites[slot]?.y === y && read.sprites[slot]?.depth === d) && read.sprites['floor-5']?.key === 'missing',
    'placements = fixture; (970,930,930) (907,618,618) (1213,644,644); fern as missing', read);
  step('save.loaded {source: fixture, bytes} survives the reload', read.saveLoaded.some(l => l.source === 'fixture' && l.bytes > 0), 'save.loaded {source: fixture}', read.saveLoaded);
  return { refused, valid: read };
}

/** MEC-005-014 desktop half: the avatar behind (y < 618) and in front of (y > 618) floor-3's lamp, depths read. */
async function depthWalkRead(page) {
  const read = () => page.evaluate(() => { const i = window.__tpp.game.scene.getScene('Interior'); return { avatar: { x: i.avatar.x, y: i.avatar.y, depth: i.avatar.depth }, lamp: i.charms.get('floor-3') ? i.charms.get('floor-3').depth : null }; });
  await holdUntil(page, 'KeyD', () => window.__tpp.store.getState().avatar.x >= 880, 8000);
  await holdUntil(page, 'KeyW', () => window.__tpp.store.getState().avatar.y <= 590, 8000);
  await page.waitForTimeout(200);
  const behind = await read();
  await holdUntil(page, 'KeyS', () => window.__tpp.store.getState().avatar.y >= 660, 8000);
  await page.waitForTimeout(200);
  const front = await read();
  step('avatar behind the lamp (depth < 618)', behind.avatar.y < 618 && behind.avatar.depth === behind.avatar.y && behind.avatar.depth < behind.lamp, 'avatar depth = y < 618', behind);
  step('avatar in front of the lamp (depth > 618)', front.avatar.y > 618 && front.avatar.depth === front.avatar.y && front.avatar.depth > front.lamp, 'avatar depth = y > 618', front);
  return { behind, front };
}

async function exportLog(page) {
  const out = join(lane, 'smoke-log.jsonl');
  try {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.evaluate(() => window.__tpp.log.exportLog('download'))]);
    await download.saveAs(out);
    return { method: 'download', path: out, bytes: statSync(out).size };
  } catch (error) {
    const text = await page.evaluate(() => window.__tpp.log.lines().map(l => JSON.stringify(l)).join('\n'));
    writeFileSync(out, `${text}\n`);
    return { method: 'lines() fallback', reason: String(error).slice(0, 200), path: out, bytes: statSync(out).size };
  }
}

/** The package's room-with-grid pair: Dog seeded idle at the authored spawn, ?grid=1, 5 s settle, debug closed; ≤ 2 px deltas read. */
async function gridShot(browser, height) {
  const { context, page, errors, target } = await boot(browser, height, '?lenient=1&grid=1', introIdle);
  await waitScene(page, 'Interior'); await page.waitForTimeout(3800);
  const png = await shot(page, browser, `work-014-4-room-grid-${height}`, height, target, 'dog-room-intro-done (real content) with the Dog behaviour set idle at petSpawn (919, 800) facing left',
    'room-v2 with the Dog idle at the authored spawn and ?grid=1 crosshairs + overlay targets at the five viewport points');
  const read = await page.evaluate(() => {
    const { game, store } = window.__tpp, canvas = game.canvas.getBoundingClientRect(), k = canvas.width / 1920;
    const H = game.scale.gameSize.height, points = { tl: [0, 0], tr: [1920, 0], bl: [0, H], br: [1920, H], centre: [960, H / 2] };
    const interior = game.scene.getScene('Interior'), pet = interior.pet;
    const targets = [...document.querySelectorAll('#alignment-grid .alignment-target')].map(t => {
      const r = t.getBoundingClientRect(), [x, y] = points[t.dataset.corner];
      const delta = Math.hypot(r.left + r.width / 2 - (canvas.left + x * k), r.top + r.height / 2 - (canvas.top + y * k));
      return { corner: t.dataset.corner, deltaPx: Math.round(delta * 100) / 100, pass: delta <= 2 };
    });
    const scroll = interior.cameras.main.scrollY;
    return { gameSize: { w: game.scale.gameSize.width, h: H }, cameraScrollY: scroll, visibleWorldY: [scroll, scroll + H], targets,
      dog: { x: pet.x, y: pet.y, flipX: pet.flipX, anim: pet.anims.currentAnim?.key ?? null, phase: store.getState().pets.dog.behaviour.phase },
      avatar: store.getState().avatar, saveDiscarded: window.__tpp.log.lines().filter(l => l.type === 'save.discarded') };
  });
  step(`grid deltas ≤ 2 px at 1920×${height}`, read.targets.length === 5 && read.targets.every(t => t.pass) && read.gameSize.h === height, `5 targets ≤ 2 px; gameSize 1920×${height}`, read);
  step(`Dog idle at the authored spawn (${height})`, read.dog.phase === 'idle' && read.dog.x === 919 && read.dog.y === 800 && read.dog.flipX, 'phase idle at (919, 800), flipX (facing left)', read.dog);
  // At 823 the centring scroll (1080 − 823) / 2 = 128.5 leaves the 823-row band within half a pixel (sub-pixel camera offset).
  step(`band y 128..951 visible (${height})`, read.visibleWorldY[0] <= 128.5 && read.visibleWorldY[1] >= 951, 'camera window covers world y 128..951 (± 0.5 px centring)', read.visibleWorldY);
  await context.close();
  return { viewport: { width: 1920, height }, screenshot: png, ...read, errors };
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const street = await streetAndDoor(browser);
  const room = await roomSmoke(browser);
  const grids = [await gridShot(browser, 1080), await gridShot(browser, 823)];
  const allErrors = [street.errors, room.errors, ...grids.map(g => g.errors)];
  step('zero console errors', allErrors.every(e => e.consoleErrors.length === 0 && e.pageErrors.length === 0), 'console and page errors empty in every window', allErrors);
  const report = { kind: 'state read', work: 'WORK-014-4', captured_at: new Date().toISOString(), browser: browser.version(), base,
    ok: steps.every(s => s.ok), steps, street, room, grids };
  writeFileSync(join(lane, 'smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(steps.map(s => [s.ok ? 'ok' : 'FAIL', s.step])));
} finally { await browser.close(); }

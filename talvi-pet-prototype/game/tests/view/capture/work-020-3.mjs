// WORK-020-3 popup smoke, loops, stills and DOM/geometry reads (Playwright library, pinned chromium-1243 by executablePath; no install).
//   node tests/view/capture/work-020-3.mjs <evidence dir holding the *.real.json saves>
//   (dev server on 5197 with ?lenient=1; TPP_BASE / TPP_EVIDENCE / TPP_SHA / TPP_ONLY override)
// Loops: CDP Page.startScreencast JPEG frames -> system ffmpeg -> H.264 MP4 + palette GIF (<= 480 px), boot/waitScene/startRecording/encode
// as work-020-2.mjs. The popups are driven by real clicks on the overlay; every smoke step asserts what its `ok` claims (review A-3/A-4).
// missingAssets = the content asset ids the overlay rendered as .tpp-asset-slot (WORK-018-1's rows are not in this lane's base; fork 6).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5197';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const sha = process.env.TPP_SHA ?? execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const lane = join(evidence, 'WORK-020-3'), captures = join(lane, 'captures'), loops = join(lane, 'loops'), tmpRoot = join(lane, 'tmp');
for (const dir of [captures, loops]) mkdirSync(dir, { recursive: true });
const saves = process.argv[2] ?? lane;
const save = name => readFileSync(join(saves, `${name}.real.json`), 'utf8');
const only = (process.env.TPP_ONLY ?? '').split(',').filter(Boolean);
const ffVersion = execFileSync(ffmpeg, ['-version']).toString().split('\n')[0];
const RECORDS = ['input.tap', 'action.rejected', 'phase.reached', 'celebration.started', 'celebration.stepped', 'celebration.ended', 'rewards.collected',
  'completeNow.shown', 'completeNow.taken', 'ui.rewardTile', 'project.completed', 'arrival.started', 'arrival.finished', 'dialogue.opened', 'scene.changed', 'asset.loadError', 'app.error'];

let browser;
async function boot(height, save, query = '', beforeGoto = null) {
  const context = await browser.newContext({ viewport: { width: 1920, height }, deviceScaleFactor: 1 });
  await context.addInitScript(text => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear(); localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1');
  }, save);
  const page = await context.newPage(), errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e)));
  if (beforeGoto) await beforeGoto(page);
  await page.goto(`${base}/?lenient=1${query}`);
  return { context, page, errors };
}
async function waitScene(page, key) {
  await page.waitForFunction(key => window.__tpp && window.__tpp.game.scene.isActive(key), key, { timeout: 30000 });
  await page.waitForTimeout(700);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
}
async function startRecording(page) {
  const cdp = await page.context().newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => { frames.push({ data, t: metadata.timestamp * 1000 }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });
  return { stop: async () => { await cdp.send('Page.stopScreencast'); await cdp.detach().catch(() => {}); return frames; } };
}
/** MP4 (libx264 yuv420p +faststart, ≤ 12 s) and a ≤ 480 px wide GIF of the crop at 12 fps; a failed encode leaves ≤ 24 frames as a recorded gap. */
function encode(name, frames, crop, meta) {
  const tmp = join(tmpRoot, name); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const t0 = frames[0].t, kept = frames.filter(f => f.t - t0 <= 14000);
  let list = '';
  kept.forEach((f, i) => { const file = join(tmp, `f${String(i).padStart(5, '0')}.jpg`); writeFileSync(file, Buffer.from(f.data, 'base64'));
    list += `file '${file}'\nduration ${((i + 1 < kept.length ? kept[i + 1].t - f.t : 100) / 1000).toFixed(6)}\n`; });
  list += `file '${join(tmp, `f${String(kept.length - 1).padStart(5, '0')}.jpg`)}'\n`; writeFileSync(join(tmp, 'list.txt'), list);
  const durationMs = Math.round(kept.at(-1).t - t0), sourceFps = Math.round(kept.length / (durationMs / 1000) * 10) / 10;
  const sidecar = { kind: 'loop', milestone: 'MILESTONE-005', work: 'WORK-020-3', point: name, captured_at: new Date().toISOString(), sha, frames: kept.length, durationMs,
    fps: sourceFps, sourceFps, encodedFps: { mp4: 30, gif: 12 }, tool: 'cdp-screencast+ffmpeg', ffmpeg: ffVersion, binary: executablePath, chromiumVersion: browser.version(), firstFrameWall: Math.round(t0), ...meta, gifCrop: crop };
  try {
    const input = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')];
    execFileSync(ffmpeg, [...input, '-vf', 'fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(loops, `${name}.mp4`)]);
    execFileSync(ffmpeg, [...input, '-vf', `fps=12,crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale='min(480,iw)':-2,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer`, '-loop', '0', join(loops, `${name}.gif`)]);
    sidecar.outputs = { mp4: join(loops, `${name}.mp4`), mp4Bytes: statSync(join(loops, `${name}.mp4`)).size, gif: join(loops, `${name}.gif`), gifBytes: statSync(join(loops, `${name}.gif`)).size };
  } catch (error) {
    const dir = join(lane, 'frames'); mkdirSync(dir, { recursive: true });
    const step = Math.max(1, Math.floor(kept.length / 24));
    sidecar.gap = { reason: String(error).slice(0, 400), frames: kept.filter((_, i) => i % step === 0).slice(0, 24).map((f, i) => {
      const file = join(dir, `${name}-${String(i).padStart(3, '0')}.jpg`); writeFileSync(file, Buffer.from(f.data, 'base64')); return { file, t: Math.round(f.t - t0) }; }) };
  }
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(loops, `${name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
  return sidecar;
}


/** Popup visibility/state transitions with performance.now() stamps (MutationObserver on the two sections). */
const watchPopups = page => page.addInitScript(() => {
  window.__popup = [];
  const attach = () => {
    const sections = document.querySelectorAll('.tpp-milestonePopup, .tpp-revealPopup');
    if (sections.length < 2) return setTimeout(attach, 20);
    const push = el => window.__popup.push({ t: performance.now(), panel: el.dataset.panel, hidden: el.hidden, state: el.dataset.state });
    const obs = new MutationObserver(ms => { for (const m of ms) push(m.target); });
    sections.forEach(el => { push(el); obs.observe(el, { attributes: true, attributeFilter: ['hidden', 'data-state'] }); });
  };
  attach();
});

const read = page => page.evaluate(records => {
  const { store, log, game } = window.__tpp, s = store.getState();
  const street = game.scene.isActive('Street') ? game.scene.getScene('Street') : null, cam = street?.cameras.main;
  const rect = game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  const house = street?.houses.get('pet-house'), b = house?.getBounds();
  const toPage = (x, y) => ({ x: Math.round(rect.left + (x - (cam?.scrollX ?? 0)) * scale), y: Math.round(rect.top + (y - (cam?.scrollY ?? 0)) * scale) });
  const m = document.querySelector('.tpp-milestonePopup'), r = document.querySelector('.tpp-revealPopup'), hud = document.querySelector('.tpp-hudStreet');
  const slots = el => [...el.querySelectorAll('.tpp-asset-slot[data-asset-id]')].map(x => x.dataset.assetId);
  return {
    t: Math.round(performance.now()), scene: s.scene, celebration: s.celebration, arrival: s.arrival, dialogueOpen: s.dialogue.current !== null, project: s.projects['pet-house'],
    camera: cam ? { midPoint: [Math.round(cam.midPoint.x), Math.round(cam.midPoint.y)], zoom: cam.zoom } : null,
    house: house ? { texture: house.texture.key, centre: [Math.round(b.centerX), Math.round(b.centerY)], icon: { visible: house.icon.visible, page: toPage(house.icon.x, house.icon.y) } } : null,
    joystickVisible: street ? street.joystick.base.visible : null,
    hudFrozen: hud?.classList.contains('frozen') ?? null,
    arrivalStub: street?.arrival ? { x: street.arrival.bubble.x, y: street.arrival.bubble.y, depth: street.arrival.bubble.depth, current: street.arrival.bubble.current() } : null,
    milestone: { hidden: m.hidden, state: m.dataset.state, heading: m.querySelector('.tpp-heading')?.textContent, congrats: m.querySelector('.tpp-congrats')?.textContent,
      tiles: [...m.querySelectorAll('.tpp-reward-tile')].map(x => x.dataset.typeId), skip: m.querySelector('.tpp-skip') ? { hidden: m.querySelector('.tpp-skip').hidden,
        label: m.querySelector('.tpp-skip button').textContent, free: m.querySelector('.tpp-skip-free').textContent } : null,
      collect: m.querySelector('.tpp-collect').textContent, slots: slots(m) },
    reveal: { hidden: r.hidden, completes: r.dataset.completes ?? null, title: r.querySelector('.tpp-reveal-popup-title')?.textContent,
      mystery: r.querySelector('.tpp-mystery-tile [data-asset-id]')?.dataset.assetId, mysteryImg: !!r.querySelector('.tpp-mystery-tile img'),
      cards: [...r.querySelectorAll('.tpp-clue')].map(c => ({ index: c.dataset.cardIndex, hidden: c.hidden, phase: c.querySelector('.tpp-clue-phase')?.textContent,
        icon: c.querySelector('[data-asset-id]')?.dataset.assetId, real: !!c.querySelector('img[data-asset-id]'), line: c.querySelector('.tpp-clue-line')?.textContent })), slots: slots(r) },
    lines: log.lines().filter(l => records.includes(l.type)),
  };
}, RECORDS);

/** Overlay-px geometry (client rect ÷ overlay scale) of the open popup's parts; at 823 also the grid's scroll extents. */
const geometry = page => page.evaluate(() => {
  const root = document.querySelector('#panels').parentElement, scale = Number(getComputedStyle(root).getPropertyValue('--overlay-scale')) || 1, o = root.getBoundingClientRect();
  const box = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round((r.left - o.left) / scale), y: Math.round((r.top - o.top) / scale), w: Math.round(r.width / scale), h: Math.round(r.height / scale) }; };
  const open = document.querySelector('.tpp-milestonePopup:not([hidden])') ?? document.querySelector('.tpp-revealPopup:not([hidden])');
  if (!open) return null;
  const shell = box(open.querySelector('.tpp-popup-shell'));
  const buttons = [...open.querySelectorAll('.ns-btn-popup')].map(b => ({ cls: b.className, ...box(b), borderImageSource: getComputedStyle(b, '::before').borderImageSource.slice(0, 160), beforeFilter: getComputedStyle(b, '::before').filter.slice(0, 80) }));
  const grid = open.querySelector('.tpp-reward-grid'), tiles = [...open.querySelectorAll('.tpp-reward-tile')].map(box);
  return { panel: open.dataset.panel, overlayScale: scale, overlay: { w: Math.round(o.width / scale), h: Math.round(o.height / scale) }, shell, shellInsideOverlay: shell && shell.x >= 0 && shell.y >= 0 && shell.x + shell.w <= 1920 && shell.y + shell.h <= Math.round(o.height / scale),
    rewardPanel: box(open.querySelector('.tpp-reward-panel')), tiles, tileGapsX: tiles.slice(1, 5).map((t, i) => t.x - (tiles[i].x + tiles[i].w)),
    columns: new Set(tiles.map(t => t.x)).size, grid: grid ? { scrollHeight: grid.scrollHeight, clientHeight: grid.clientHeight, overflows: grid.scrollHeight > grid.clientHeight } : null,
    buttons, mystery: box(open.querySelector('.tpp-mystery-tile')), clueTiles: [...open.querySelectorAll('.tpp-clue > .ns-tile')].map(box),
    preview: box(open.querySelector('.tpp-reward-preview')) };
});

function nextPng(point) {
  const taken = readdirSync(captures).filter(f => f.startsWith(`${point}-`) && f.endsWith('.png')).length;
  return join(captures, `${point}-${String(taken + 1).padStart(3, '0')}.png`);
}
async function shot(page, point, height, target, seededSave, note) {
  const png = nextPng(point);
  await page.screenshot({ path: png });
  const state = await read(page);
  const missingAssets = [...new Set([...state.milestone.hidden ? [] : state.milestone.slots, ...state.reveal.hidden ? [] : state.reveal.slots])];
  const sidecar = { kind: 'still', milestone: 'MILESTONE-005', work: 'WORK-020-3', point, target, captured_at: new Date().toISOString(), sha,
    viewport: { width: 1920, height }, bytes: statSync(png).size, tool: 'playwright-library', binary: executablePath, chromiumVersion: browser.version(), seededSave, note, missingAssets, state };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  return { png, state, missingAssets };
}

const FULL = { w: 1920, h: 1080, x: 0, y: 0 };
const POPUP_CROP = { w: 1320, h: 600, x: 300, y: 260 };
const waitOpen = (page, panel, ms = 15000) => page.waitForFunction(p => { const el = document.querySelector(`.tpp-${p}`); return el && !el.hidden; }, panel, { timeout: ms });
const waitHidden = (page, panel, ms = 15000) => page.waitForFunction(p => document.querySelector(`.tpp-${p}`).hidden, panel, { timeout: ms });
const popupLog = page => page.evaluate(() => window.__popup.splice(0).map(e => ({ ...e, t: Math.round(e.t) })));
const exportLog = (page, file) => page.evaluate(() => window.__tpp.log.lines()).then(lines => writeFileSync(join(lane, file), lines.map(l => JSON.stringify(l)).join('\n') + '\n'));
const debugRow = (page, label) => page.locator('.tpp-debug-row', { hasText: label });
async function closeDebug(page) { await page.locator('.tpp-debugPanel button.tpp-close').first().click(); await page.waitForTimeout(400); }
async function simulate(page) { await debugRow(page, 'Simulate a purchase').locator('button').first().click(); await page.waitForTimeout(120); }
const tapHouse = async page => { const s = await read(page); await page.mouse.click(s.house.icon.page.x, s.house.icon.page.y, { delay: 40 }); return s; };
const count = (state, type, pred = () => true) => state.lines.filter(l => l.type === type && pred(l)).length;
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const errorsOf = (errors, state) => ({ consoleErrors: errors.consoleErrors, pageErrors: errors.pageErrors, assetLoadErrors: count(state, 'asset.loadError'), appErrors: count(state, 'app.error') });
function step(run, name, ok, details) { run.steps.push({ step: name, ok: !!ok, ...details }); }
/** milestone hidden strictly before the reveal is shown, and a collecting state seen in between (fork 3). */
function handOff(events) {
  const collecting = events.find(e => e.panel === 'milestonePopup' && e.state === 'collecting');
  const hidden = events.find(e => e.panel === 'milestonePopup' && e.hidden && collecting && e.t >= collecting.t);
  const shown = events.find(e => e.panel === 'revealPopup' && !e.hidden && hidden && e.t >= hidden.t);
  return { collectingAt: collecting?.t ?? null, milestoneHiddenAt: hidden?.t ?? null, revealShownAt: shown?.t ?? null,
    ordered: !!(collecting && hidden && shown), collectingToHiddenMs: collecting && hidden ? hidden.t - collecting.t : null };
}

/** Smoke run 1 (design §4 row 4:00 from FX-SAVE-V1): hook cutscene → popup → preview → Collect → reveal → Continue → pan back. */
async function smokeV1(report) {
  const run = { run: 'save-v1-hook-1080', seededSave: 'save-v1-at-door.real.json', steps: [] };
  const { context, page, errors } = await boot(1080, save('save-v1-at-door'), '', watchPopups);
  await waitScene(page, 'Interior');
  let rec = await startRecording(page);
  await page.keyboard.down('KeyW');
  try { await page.waitForFunction(() => window.__tpp.store.getState().scene.kind === 'street', null, { timeout: 8000 }); } finally { await page.keyboard.up('KeyW'); }
  await waitOpen(page, 'milestonePopup', 20000);
  await page.waitForTimeout(800);
  let frames = await rec.stop();
  let s = await read(page);
  const milestoneSteps = s.lines.filter(l => l.type === 'celebration.stepped' && l.step === 'milestone');
  const ev0 = await popupLog(page);
  const openedAfterStep = ev0.find(e => e.panel === 'milestonePopup' && !e.hidden);
  step(run, 'street → hook cutscene → celebration.stepped {milestone} → popup open', s.celebration?.step === 'milestone' && milestoneSteps.length === 1 && !s.milestone.hidden && openedAfterStep,
    { celebrationStepped: milestoneSteps.length, popupOpenedT: openedAfterStep?.t ?? null });
  const SIX = ['lamp-planter', 'stool', 'toy-basket', 'wall-clock', 'tall-lamp', 'hanging-plant'];
  step(run, 'popup "Coming along!" with six tiles in unlockedTypeIds order', s.milestone.heading === 'Coming along!' && eq(s.milestone.tiles, SIX) && eq(s.celebration.unlockedTypeIds, SIX),
    { heading: s.milestone.heading, tiles: s.milestone.tiles, missingAssets: s.milestone.slots });
  step(run, 'Skip "Skip the wait · $2.40" over "Free in this prototype" (fork 1); completeNow.shown once', s.milestone.skip && !s.milestone.skip.hidden && s.milestone.skip.label === 'Skip the wait · $2.40'
    && s.milestone.skip.free === 'Free in this prototype' && count(s, 'completeNow.shown') === 1, { skip: s.milestone.skip, completeNowShown: count(s, 'completeNow.shown') });
  const loop1 = encode('milestone-popup-in-1080', frames, FULL, { target: 'dog-room door → street fade-in → hook cutscene end → milestone popup fade-in 200 ms', viewport: { width: 1920, height: 1080 },
    seededSave: run.seededSave, note: 'KeyW held until scene.kind = street; recording stops 800 ms after the popup opened', missingAssets: s.milestone.slots, measured: { popupOpenedT: openedAfterStep?.t ?? null } });
  const still1 = await shot(page, 'milestone-popup-1to4-1080', 1080, 'milestone popup, 1 → 4, six tiles, Skip with the price', run.seededSave, 'after the hook cutscene');
  report.geometry.push({ point: 'milestone-popup-1to4-1080', ...(await geometry(page)) });
  await page.locator('.tpp-milestonePopup .tpp-reward-tile').nth(3).click();
  await page.waitForTimeout(250);
  const preview = await page.evaluate(() => { const p = document.querySelector('.tpp-reward-preview'); return p && { typeId: p.dataset.typeId, name: p.querySelector('.tpp-preview-name').textContent, description: p.querySelector('.tpp-preview-description').textContent }; });
  const still2 = await shot(page, 'tile-preview-1080', 1080, 'tile preview bubble for the fourth tile', run.seededSave, 'one ui.rewardTile recorded');
  report.geometry.push({ point: 'tile-preview-1080', ...(await geometry(page)) });
  s = await read(page);
  step(run, 'tile tap → preview with name/description and exactly one ui.rewardTile {typeId}', preview?.typeId === 'wall-clock' && preview.name && preview.description && count(s, 'ui.rewardTile') === 1
    && s.lines.find(l => l.type === 'ui.rewardTile')?.typeId === 'wall-clock', { preview, rewardTile: s.lines.filter(l => l.type === 'ui.rewardTile') });
  await page.locator('.tpp-preview-backdrop').click({ position: { x: 100, y: 100 } });
  await page.waitForTimeout(200);
  step(run, 'preview backdrop tap dismisses it', await page.locator('.tpp-reward-preview').count() === 0, {});
  rec = await startRecording(page);
  await page.waitForTimeout(200);
  await page.locator('.tpp-milestonePopup .tpp-collect').click();
  await waitOpen(page, 'revealPopup');
  await page.waitForTimeout(1200);
  frames = await rec.stop();
  const ev1 = await popupLog(page), ho = handOff(ev1);
  s = await read(page);
  step(run, 'Collect → exactly one rewards.collected; collecting → milestone hidden → reveal shown (fork 3 order)', count(s, 'rewards.collected') === 1 && ho.ordered && s.milestone.hidden && !s.reveal.hidden,
    { handOff: ho, rewardsCollected: count(s, 'rewards.collected') });
  const CARDS = [['1', 'Phase 2', 'clues/spectacles'], ['2', 'Phase 3', 'clues/branch-book'], ['3', 'Phase 4', 'clues/lantern']];
  step(run, 'reveal popup: mystery shape, "Someone is moving in", cards Phase 2–4 (spectacles, branch-book placeholders; lantern real)', s.reveal.mystery === 'ui/mystery-shape' && s.reveal.mysteryImg
    && s.reveal.title === 'Someone is moving in' && eq(s.reveal.cards.map(c => [c.index, c.phase, c.icon]), CARDS) && s.reveal.cards.every(c => !c.hidden)
    && s.reveal.cards[2].real && !s.reveal.cards[0].real && !s.reveal.cards[1].real, { reveal: s.reveal, missingAssets: s.reveal.slots });
  const loop2 = encode('collect-to-reveal-1080', frames, POPUP_CROP, { target: 'Collect → icons flash 300 ms staggered 50 ms, hold 500, fade 200 → reveal popup, three cards 250 ms apart', viewport: { width: 1920, height: 1080 },
    seededSave: run.seededSave, note: 'continues the milestone-popup-in-1080 session', missingAssets: [...new Set([...still1.missingAssets, ...s.reveal.slots])], measured: ho });
  const still3 = await shot(page, 'reveal-popup-1to4-1080', 1080, 'reveal popup, mystery shape and cards Phase 2–4', run.seededSave, 'after Collect');
  report.geometry.push({ point: 'reveal-popup-1to4-1080', ...(await geometry(page)) });
  report.revealDom.push(await revealDom(page, 'reveal-popup-1to4-1080'));
  rec = await startRecording(page);
  await page.waitForTimeout(200);
  await page.locator('.tpp-revealPopup .tpp-collect').click();
  await waitHidden(page, 'revealPopup');
  await page.waitForTimeout(1500);
  frames = await rec.stop();
  s = await read(page);
  step(run, 'Continue → exactly one celebration.ended; pan back to (960, 540); HUD unfrozen; joystick visible', count(s, 'celebration.ended') === 1 && s.celebration === null && s.reveal.hidden
    && eq(s.camera.midPoint, [960, 540]) && s.hudFrozen === false && s.joystickVisible === true, { camera: s.camera, hudFrozen: s.hudFrozen, joystickVisible: s.joystickVisible });
  const loop3 = encode('continue-pan-back-1080', frames, FULL, { target: 'Continue → reveal popup hides → pan back → HUD unfrozen, joystick back', viewport: { width: 1920, height: 1080 },
    seededSave: run.seededSave, note: 'continues the collect-to-reveal-1080 session', missingAssets: [], measured: { camera: s.camera } });
  step(run, 'no action.rejected; zero console errors; zero asset.loadError', count(s, 'action.rejected') === 0 && errors.consoleErrors.length === 0 && errors.pageErrors.length === 0 && count(s, 'asset.loadError') === 0,
    errorsOf(errors, s));
  await exportLog(page, 'smoke-save-v1.log.jsonl');
  await context.close();
  await replayStep(run, report);
  run.loops = [loop1, loop2, loop3].map(l => l.outputs ?? l.gap); run.stills = [still1.png, still2.png, still3.png];
  run.missingAssets = [...new Set([...still1.missingAssets, ...s.reveal.slots, ...still3.missingAssets])];
  run.errors = errorsOf(errors, s);
  report.runs.push(run);
}

/** Smoke run 1, last step: a reload at `milestone` (FX-SAVE-V1-CEL-milestone) opens the popup at once over the framed house. */
async function replayStep(run, report) {
  for (const [name, panel] of [['save-v1.milestone', 'milestonePopup'], ['save-v1.reveal', 'revealPopup']]) {
    const { context, page, errors } = await boot(1080, save(name), '', watchPopups);
    await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Street'), null, { timeout: 30000 });
    const atActive = await read(page);
    await page.waitForTimeout(700);
    const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
    if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
    const point = `replay-${name.split('.')[1]}-popup-1080`;
    const still = await shot(page, point, 1080, `reload at ${name.split('.')[1]}: the popup open at once over the framed Pet House`, `${name}.real.json`, 'VERIFY-PRES-008 Chrome');
    const s = still.state, events = await popupLog(page);
    const open = panel === 'milestonePopup' ? !s.milestone.hidden && s.reveal.hidden : s.reveal.hidden === false && s.milestone.hidden;
    const openCount = await page.locator('[data-panel="milestonePopup"]:not([hidden]), [data-panel="revealPopup"]:not([hidden])').count();
    const atActiveOpen = panel === 'milestonePopup' ? !atActive.milestone.hidden : !atActive.reveal.hidden;
    step(run, `reload at ${name.split('.')[1]} → ${panel} open at once (already open when the Street became active), exactly one popup, camera on the house, house lv5, nothing dispatched`,
      open && atActiveOpen && openCount === 1 && Math.abs(s.camera.midPoint[0] - s.house.centre[0]) <= 1 && Math.abs(s.camera.midPoint[1] - s.house.centre[1]) <= 1 && s.house.texture === 'houses/pet-house-lv5'
      && count(s, 'celebration.stepped') === 0 && count(s, 'action.rejected') === 0 && errors.consoleErrors.length === 0 && count(s, 'asset.loadError') === 0,
      { openAtStreetActive: atActiveOpen, openCount, camera: s.camera, house: s.house, firstPopupEvents: events.slice(0, 4), errors: errorsOf(errors, s), png: still.png });
    report.replays.push({ point, png: still.png, missingAssets: still.missingAssets });
    await context.close();
  }
}

/** VERIFY-MEC-003-002 Chrome DOM: nothing of the Owl in either popup before completion; no guess field (DEC-039). */
const revealDom = (page, point) => page.evaluate(({ point }) => {
  const { content } = window.__tpp, project = content.projects.find(p => p.id === 'pet-house'), pet = content.pets[project.residentPetId];
  const html = document.querySelector('.tpp-milestonePopup').outerHTML + document.querySelector('.tpp-revealPopup').outerHTML;
  const checks = { descriptorImage: html.includes(project.descriptorImage), silhouetteImage: html.includes(project.silhouetteImage), petPath: html.includes(`pets/${pet.id}`),
    petName: new RegExp(`\\b${pet.name}\\b`, 'i').test(html), owlWord: /\bowl\b/i.test(html), guess: /guess/i.test(html), input: /<input|<textarea/i.test(html) };
  return { point, captured_at: new Date().toISOString(), petId: pet.id, petName: pet.name, descriptorImage: project.descriptorImage, silhouetteImage: project.silhouetteImage,
    completes: document.querySelector('.tpp-revealPopup').dataset.completes ?? null, checks, pass: Object.values(checks).every(v => v === false), htmlBytes: html.length };
}, { point });

/** Smoke run 2 (the M1 trace's first celebration): debug purchases to phase 1, tap the house, Collect → card 1, Continue. */
async function smokePhase1(report) {
  const run = { run: 'phase1-tap-1080', seededSave: 'street-near-phase1.real.json + debug "Simulate a purchase" until phase.reached {phase:1}', steps: [] };
  const { context, page, errors } = await boot(1080, save('street-near-phase1'), '', watchPopups);
  await waitScene(page, 'Street');
  await page.click('.tpp-hudStreet .tpp-debug-entry'); await page.waitForTimeout(400);
  let clicks = 0;
  while (clicks < 40 && !(await read(page)).lines.some(l => l.type === 'phase.reached')) { await simulate(page); clicks++; }
  await closeDebug(page);
  let s = await read(page);
  step(run, 'debug purchases reach phase.reached {phase:1}; panel closed', s.lines.some(l => l.type === 'phase.reached' && l.phase === 1) && await page.locator('.tpp-debugPanel:not([hidden])').count() === 0, { clicks, currentCents: s.project.currentCents });
  await tapHouse(page);
  await waitOpen(page, 'milestonePopup', 15000);
  await page.waitForTimeout(500);
  s = await read(page);
  const price = `$${((1500 - s.project.currentCents) / 100).toFixed(2)}`;
  step(run, 'tap the house → cutscene → popup with two tiles fern, perch-branch', eq(s.milestone.tiles, ['fern', 'perch-branch']) && s.milestone.heading === 'Coming along!', { tiles: s.milestone.tiles, missingAssets: s.milestone.slots });
  step(run, `Skip shown (completeNowOffered) with the live price ${price}`, s.milestone.skip && !s.milestone.skip.hidden && s.milestone.skip.label === `Skip the wait · ${price}`, { skip: s.milestone.skip, currentCents: s.project.currentCents });
  const still1 = await shot(page, 'milestone-popup-0to1-1080', 1080, 'milestone popup 0 → 1: fern, perch-branch, Skip with the live price', run.seededSave, '');
  const rec = await startRecording(page);
  await page.waitForTimeout(200);
  await page.locator('.tpp-milestonePopup .tpp-collect').click();
  await waitOpen(page, 'revealPopup');
  await page.waitForTimeout(1000);
  const frames = await rec.stop();
  const ho = handOff(await popupLog(page));
  s = await read(page);
  step(run, 'Collect → collecting → hidden → reveal popup with card 1 clues/feather-book (real) and "Phase 1"', ho.ordered && eq(s.reveal.cards.map(c => [c.index, c.phase, c.icon, c.real]), [['0', 'Phase 1', 'clues/feather-book', true]]),
    { handOff: ho, cards: s.reveal.cards });
  const loop = encode('phase1-collect-to-reveal-1080', frames, POPUP_CROP, { target: 'M1 trace: Collect (two tiles flash) → reveal popup with card 1 feather-book', viewport: { width: 1920, height: 1080 },
    seededSave: run.seededSave, note: '', missingAssets: [...new Set([...still1.missingAssets, ...s.reveal.slots])], measured: ho });
  const still2 = await shot(page, 'reveal-popup-0to1-1080', 1080, 'reveal popup 0 → 1: card 1 feather-book', run.seededSave, '');
  report.revealDom.push(await revealDom(page, 'reveal-popup-0to1-1080'));
  await page.locator('.tpp-revealPopup .tpp-collect').click();
  await waitHidden(page, 'revealPopup');
  await page.waitForTimeout(1500);
  s = await read(page);
  step(run, 'Continue → celebration.ended once, pan back, HUD unfrozen', count(s, 'celebration.ended') === 1 && s.celebration === null && eq(s.camera.midPoint, [960, 540]) && s.hudFrozen === false && s.joystickVisible === true,
    { camera: s.camera, hudFrozen: s.hudFrozen, joystickVisible: s.joystickVisible });
  step(run, 'no action.rejected; zero console errors; zero asset.loadError', count(s, 'action.rejected') === 0 && errors.consoleErrors.length === 0 && errors.pageErrors.length === 0 && count(s, 'asset.loadError') === 0, errorsOf(errors, s));
  await exportLog(page, 'smoke-phase1.log.jsonl');
  run.loops = [loop.outputs ?? loop.gap]; run.stills = [still1.png, still2.png];
  run.missingAssets = [...new Set([...still1.missingAssets, ...still2.missingAssets])]; run.errors = errorsOf(errors, s);
  report.runs.push(run);
  await context.close();
}

/** 1920×823: the replayed milestone popup (grid overflow measurement) and, after Collect, the reveal popup. */
async function at823(report) {
  const { context, page, errors } = await boot(823, save('save-v1.milestone'), '', watchPopups);
  await waitScene(page, 'Street');
  const m = await shot(page, 'milestone-popup-1to4-823', 823, 'milestone popup at 823 (replay)', 'save-v1.milestone.real.json', 'grid scroll measured in popup-geometry.json');
  report.geometry.push({ point: 'milestone-popup-1to4-823', ...(await geometry(page)) });
  await page.locator('.tpp-milestonePopup .tpp-collect').click();
  await waitOpen(page, 'revealPopup');
  await page.waitForTimeout(1000);
  const r = await shot(page, 'reveal-popup-1to4-823', 823, 'reveal popup at 823', 'save-v1.milestone.real.json', 'after Collect');
  report.geometry.push({ point: 'reveal-popup-1to4-823', ...(await geometry(page)) });
  report.stills823 = { milestone: m.png, reveal: r.png, errors: errorsOf(errors, r.state) };
  await context.close();
}

/** Non-gating (WORK-023 accepts the completion): "Project Complete!" → Collect → reveal stub → Continue → 🎵 at the door → arrivalFinished. */
async function completion(report) {
  const { context, page, errors } = await boot(1080, save('street-ack4-complete'), '', watchPopups);
  await waitScene(page, 'Street');
  await tapHouse(page);
  await waitOpen(page, 'milestonePopup', 15000);
  const rec = await startRecording(page);
  await page.waitForTimeout(800);
  const before = await read(page);
  await page.locator('.tpp-milestonePopup .tpp-collect').click();
  await waitOpen(page, 'revealPopup');
  await page.waitForTimeout(1000);
  const reveal = await read(page);
  report.revealDom.push(await revealDom(page, 'reveal-popup-completion-1080'));
  await page.locator('.tpp-revealPopup .tpp-collect').click();
  await page.waitForFunction(() => window.__tpp.game.scene.getScene('Street').arrival !== null, null, { timeout: 5000 });
  await page.waitForTimeout(300);
  const stub = await read(page);
  await page.waitForFunction(() => window.__tpp.store.getState().arrival === null, null, { timeout: 8000 });
  await page.waitForTimeout(600);
  const frames = await rec.stop();
  const after = await read(page);
  const result = { heading: before.milestone.heading, skip: before.milestone.skip, revealCompletes: reveal.reveal.completes, cards: reveal.reveal.cards.map(c => c.phase),
    stub: stub.arrivalStub, arrivalStarted: count(after, 'arrival.started'), arrivalFinished: count(after, 'arrival.finished'), arrivalDone: after.project.arrivalDone,
    ok: before.milestone.heading === 'Project Complete!' && before.milestone.skip === null && reveal.reveal.completes === 'true' && stub.arrivalStub?.current?.text === '🎵' && stub.arrivalStub.depth === 8000
      && count(after, 'arrival.finished') === 1 && after.project.arrivalDone === true, errors: errorsOf(errors, after) };
  const loop = encode('completion-popups-arrival-stub-1080', frames, FULL, { target: '"Project Complete!" without Skip → Collect → reveal stub → Continue → 🎵 at the Pet House door → arrivalFinished (non-gating)',
    viewport: { width: 1920, height: 1080 }, seededSave: 'street-ack4-complete.real.json', note: 'recording starts once the milestone popup is open', missingAssets: [...new Set([...before.milestone.slots, ...reveal.reveal.slots])], measured: result });
  report.completion = { ...result, loop: loop.outputs ?? loop.gap };
  await context.close();
}

const report = { work: 'WORK-020-3', sha, captured_at: new Date().toISOString(), base, chromium: null, runs: [], replays: [], geometry: [], revealDom: [],
  note: 'iPhone/Safari halves not-run (user, play session); sound not-run (user-managed sound)' };
browser = await chromium.launch({ headless: true, executablePath });
report.chromium = browser.version();
const units = { v1: smokeV1, phase1: smokePhase1, h823: at823, completion };
try {
  for (const [key, fn] of Object.entries(units)) if (!only.length || only.includes(key)) {
    try { await fn(report); } catch (error) { report[`${key}Error`] = String(error).slice(0, 600); }
  }
} finally { await browser.close(); }
rmSync(tmpRoot, { recursive: true, force: true });
const suffix = only.length ? `-${only.join('-')}` : '';
const smoke = { work: 'WORK-020-3', sha, captured_at: report.captured_at, chromium: report.chromium, runs: report.runs, replays: report.replays, completion: report.completion ?? null,
  errors: Object.fromEntries(Object.entries(report).filter(([k]) => k.endsWith('Error'))), allOk: report.runs.length === 2 && report.runs.every(r => r.steps.every(st => st.ok)), note: report.note };
writeFileSync(join(lane, `smoke${suffix}.json`), `${JSON.stringify(smoke, null, 2)}\n`);
writeFileSync(join(lane, `popup-geometry${suffix}.json`), `${JSON.stringify({ sha, captured_at: report.captured_at, geometry: report.geometry, stills823: report.stills823 ?? null }, null, 2)}\n`);
writeFileSync(join(lane, `reveal-dom${suffix}.json`), `${JSON.stringify({ sha, captured_at: report.captured_at, reads: report.revealDom, pass: report.revealDom.length > 0 && report.revealDom.every(r => r.pass) }, null, 2)}\n`);
console.log(JSON.stringify({ allOk: smoke.allOk, errors: smoke.errors, steps: report.runs.map(r => r.steps.map(st => [st.step.slice(0, 50), st.ok])) }, null, 1));

// WORK-014-1 capture + state read (Playwright library, pinned chromium-1243 by executablePath; no channel, no install).
//   node tests/view/capture/work-014-1.mjs <room-save.json>   (dev server on 5193; TPP_BASE / TPP_EVIDENCE override)
// Writes the room screenshots at 1920×1080 and 1920×823 (+ sidecars) under evidence/MILESTONE-005, and
// boot-report.json + error-screen-strict.txt under evidence/WORK-014-1.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5193';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const lane = join(evidence, 'WORK-014-1'), milestone = join(evidence, 'MILESTONE-005');
mkdirSync(lane, { recursive: true }); mkdirSync(milestone, { recursive: true });

/** The real-content `dog-room-intro-done` save with the Dog idle at its authored spawn for the capture window. */
function roomSave(path) {
  const save = JSON.parse(readFileSync(path, 'utf8'));
  const spawn = { x: 919, y: 800, facing: 'left' };
  save.state.pets.dog.behaviour = { phase: 'idle', ...spawn, timerMs: 20000, target: null, verb: null, reaction: null };
  return JSON.stringify(save);
}

function nextPng(point) {
  const taken = readdirSync(milestone).filter(f => f.startsWith(`${point}-`) && f.endsWith('.png')).length;
  return join(milestone, `${point}-${String(taken + 1).padStart(3, '0')}.png`);
}

const watch = page => {
  const log = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') log.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => log.pageErrors.push(String(e)));
  return log;
};

async function strictBoot(browser) {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  watch(page);
  await page.goto(`${base}/`);
  await page.waitForSelector('#error-screen pre', { timeout: 30000 });
  const text = await page.locator('#error-screen pre').textContent();
  writeFileSync(join(lane, 'error-screen-strict.txt'), `${text}\n`);
  await page.close();
  return text.split('\n').length;
}

/** Samples the Dog idle's frame changes for `ms` (GAP-12 fact b). */
const sampleIdle = (page, ms) => page.evaluate(ms => new Promise(resolve => {
  const pet = window.__tpp.game.scene.getScene('Interior').pet, marks = [];
  const on = (_anim, frame) => marks.push([performance.now(), frame.index]);
  pet.on('animationupdate', on);
  setTimeout(() => { pet.off('animationupdate', on); resolve(marks); }, ms);
}), ms);

function stateRead() {
  const { game, log, context } = window.__tpp;
  const boot = game.scene.getScene('Boot'), interior = game.scene.getScene('Interior'), pet = interior.pet, avatar = interior.avatar;
  const keys = ['rooms/dog-room', 'pets/dog-sheet', 'charms/dog-bed', 'charms/lamp', 'charms/painting', 'player/avatar-sheet', 'missing'];
  return {
    manifestRows: context.manifest.entries.length, loader: boot.loaderTotals,
    assetLoadErrors: log.lines().filter(l => l.type === 'asset.loadError'),
    saveDiscarded: log.lines().filter(l => l.type === 'save.discarded'),
    textures: Object.fromEntries(keys.map(k => [k, game.textures.exists(k)])),
    fonts: { baloo700: document.fonts.check('700 32px "Baloo 2"'), nunito400: document.fonts.check('400 24px Nunito') },
    gameSize: { w: game.scale.gameSize.width, h: game.scale.gameSize.height }, cameraScrollY: interior.cameras.main.scrollY,
    activeScenes: game.scene.getScenes(true).map(s => s.scene.key), renderer: game.renderer.type === 2 ? 'WEBGL' : String(game.renderer.type),
    dog: { x: pet.x, y: pet.y, flipX: pet.flipX, depth: pet.depth, clip: pet.anims.currentAnim?.key ?? null,
      bubbleAnchor: pet.bubbleAnchor(), bubbleOffset: pet.bubbleOffset, bubbleOffsetMeasured: pet.bubbleOffsetMeasured },
    avatar: { x: avatar.x, y: avatar.y, depth: avatar.depth },
    charms: [...interior.charms.keys()], bannerFindings: document.querySelectorAll('#findings-banner li').length,
    bannerErrors: document.querySelectorAll('#findings-banner li[data-level="error"]').length,
  };
}

async function roomAt(browser, height, save, sample) {
  const context = await browser.newContext({ viewport: { width: 1920, height } });
  await context.addInitScript(text => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1'); } }, save);
  const page = await context.newPage(), log = watch(page);
  await page.goto(`${base}/?lenient=1`);
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Interior'), null, { timeout: 30000 });
  const idle = sample ? await sampleIdle(page, 6500) : (await page.waitForTimeout(5000), null);
  const png = nextPng(`work-014-1-room-${height}`);
  await page.screenshot({ path: png });
  const read = await page.evaluate(stateRead);
  const sidecar = { milestone: 'MILESTONE-005', point: `work-014-1-room-${height}`, sequence: Number(png.slice(-7, -4)), target: `${base}/?lenient=1`,
    captured_at: new Date().toISOString(), viewport: { width: 1920, height }, bytes: statSync(png).size, tool: 'playwright-library',
    binary: executablePath, version: browser.version(), seededSave: 'dog-room-intro-done (real content) with the Dog idle at petSpawn' };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  await context.close();
  return { png, read, idle, ...log };
}

function idleDurations(marks) {
  if (!marks) return null;
  return marks.slice(1).map((m, i) => ({ fromFrame: marks[i][1], ms: Math.round(m[0] - marks[i][0]) }));
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const save = roomSave(process.argv[2]);
  const strictLines = await strictBoot(browser);
  const r1080 = await roomAt(browser, 1080, save, true);
  const r823 = await roomAt(browser, 823, save, false);
  const report = { at: new Date().toISOString(), chromium: browser.version(), playwright: '1.64.1', strictErrorLines: strictLines,
    room1080: { ...r1080, idle: undefined }, room823: r823, idleTiming: idleDurations(r1080.idle) };
  writeFileSync(join(lane, 'boot-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ strictLines, png1080: r1080.png, png823: r823.png, idle: report.idleTiming }));
} finally { await browser.close(); }

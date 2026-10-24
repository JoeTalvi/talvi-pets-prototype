// WORK-021-1 boot read (Playwright library, pinned chromium-1243 by executablePath; no channel, no install).
//   node tests/view/capture/work-021-1.mjs   (dev server on 5199; TPP_BASE / TPP_EVIDENCE override)
// (a) /?lenient=1 at 1920×1080 with fresh storage: BootScene loader totals, console errors, asset.loadError lines, #panels children with
//     computed z-index, findings banner lines; still work-021-1-boot-street-1080. (b) / strict: error-screen lines and the Export download;
//     still work-021-1-error-screen-strict-1080. Writes boot-read.json; every step records an assertion result (a step that asserts nothing is a gap).
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5199';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const lane = join(evidence, 'WORK-021-1'), captures = join(lane, 'captures');
mkdirSync(captures, { recursive: true });
const OWL_IDS = ['pets/owl-portrait', 'pets/owl-sheet', 'pets/owl-silhouette'];
// Presentation §8 z-order bands: HUD 1 < toast 2 < want panel/dialogue 3 < chooser/sheet 4 < popups 5 < debug/room editor 6.
const BAND = { hudInterior: 1, hudStreet: 1, toast: 2, wantPanel: 3, dialogue: 3, chooser: 4, replaceRemove: 4, milestonePopup: 5, revealPopup: 5, debugPanel: 6, roomEditor: 6 };

function nextPng(point) {
  const taken = readdirSync(captures).filter(f => f.startsWith(`${point}-`) && f.endsWith('.png')).length;
  return join(captures, `${point}-${String(taken + 1).padStart(3, '0')}.png`);
}

const watch = page => {
  const log = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') log.consoleErrors.push(m.text().slice(0, 600)); });
  page.on('pageerror', e => log.pageErrors.push(String(e)));
  return log;
};

async function still(page, browser, point, target, note) {
  const png = nextPng(point);
  await page.screenshot({ path: png });
  const sidecar = { work: 'WORK-021-1', milestone: 'MILESTONE-005', point, sequence: Number(png.slice(-7, -4)), target, captured_at: new Date().toISOString(),
    viewport: { width: 1920, height: 1080 }, bytes: statSync(png).size, tool: 'playwright-library', binary: executablePath, version: browser.version(), note };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  return png;
}

function lenientRead() {
  const { game, log } = window.__tpp;
  const boot = game.scene.getScene('Boot');
  const panels = [...document.querySelectorAll('#panels > *')].map(el => {
    const root = el.dataset.panel ? el : el.querySelector('[data-panel]');
    return { panel: root?.dataset.panel ?? null, wrapper: el === root ? null : el.className, zIndex: getComputedStyle(el).zIndex, rootZIndex: root ? getComputedStyle(root).zIndex : null };
  });
  return {
    loader: boot.loaderTotals, textureKeys: game.textures.getTextureKeys().length,
    assetLoadErrors: log.lines().filter(l => l.type === 'asset.loadError'),
    activeScenes: game.scene.getScenes(true).map(s => s.scene.key), renderer: game.renderer.type === 2 ? 'WEBGL' : String(game.renderer.type),
    panels, panelsExposed: Object.keys(window.__tpp.panels ?? {}),
    dialogueVisible: !!document.querySelector('.tpp-dialogue') && !document.querySelector('.tpp-dialogue').hidden,
    banner: [...document.querySelectorAll('#findings-banner li')].map(li => ({ level: li.dataset.level, text: li.textContent })),
  };
}

async function lenient(browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const page = await context.newPage(), log = watch(page);
  await page.goto(`${base}/?lenient=1`);
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Street') && window.__tpp.game.scene.getScene('Boot').loaderTotals.totalComplete > 0, null, { timeout: 45000 });
  let orientationShown = true;
  try { await page.waitForFunction(() => { const d = document.querySelector('.tpp-dialogue'); return d && !d.hidden; }, null, { timeout: 15000 }); }
  catch { orientationShown = false; }
  await page.waitForTimeout(400);
  const png = await still(page, browser, 'work-021-1-boot-street-1080', `${base}/?lenient=1`, 'fresh localStorage; first frame after the orientation box shows');
  const read = await page.evaluate(lenientRead);
  await context.close();
  return { png, orientationShown, read, ...log };
}

async function strict(browser) {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const page = await context.newPage(), log = watch(page);
  await page.goto(`${base}/`);
  await page.waitForSelector('#error-screen pre[data-diagnostic="issues"]', { timeout: 45000 });
  const lines = (await page.locator('#error-screen pre[data-diagnostic="issues"]').textContent()).split('\n').filter(Boolean);
  const png = await still(page, browser, 'work-021-1-error-screen-strict-1080', `${base}/`, 'strict boot (no lenient): CHK-CORE-03 error screen');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('#error-screen [data-action="export"]').click()]);
  const path = await download.path();
  const body = readFileSync(path, 'utf8');
  await context.close();
  return { png, lines, download: { filename: download.suggestedFilename(), bytes: Buffer.byteLength(body), head: body.slice(0, 300) }, ...log };
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const a = await lenient(browser), b = await strict(browser);
  const z = a.read.panels.map(p => ({ ...p, band: BAND[p.panel] }));
  const zNum = p => Number(p.zIndex === 'auto' ? p.rootZIndex : p.zIndex);
  // Every panel in a lower §8 band has a strictly lower computed z-index than every panel in a higher band.
  const zAscending = z.every(p => z.every(q => !(p.band < q.band) || zNum(p) < zNum(q)));
  const owlLine = l => OWL_IDS.some(id => l.includes(id));
  const assertions = {
    lenientLoaded81Failed0: a.read.loader.totalComplete === 81 && a.read.loader.totalFailed === 0,
    lenientZeroConsoleErrors: a.consoleErrors.length === 0 && a.pageErrors.length === 0,
    lenientZeroAssetLoadError: a.read.assetLoadErrors.length === 0,
    orientationBoxShown: a.orientationShown,
    panelsEachOnce: new Set(a.read.panels.map(p => p.panel)).size === 11 && a.read.panels.length === 11,
    zOrderPerPresentation8: zAscending,
    bannerOwlPlusKnownWarningsOnly: a.read.banner.filter(l => l.level === 'error').every(l => owlLine(l.text)) && a.read.banner.filter(l => owlLine(l.text)).length === 4,
    strictErrorScreenOwlLinesOnly: b.lines.length === 4 && b.lines.every(owlLine),
    strictExportDownloadNonEmpty: b.download.bytes > 0,
  };
  const report = { at: new Date().toISOString(), chromium: browser.version(), playwright: '1.64.1', base, assertions, lenient: { ...a, read: { ...a.read, panels: z } }, strict: b };
  writeFileSync(join(lane, 'boot-read.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ assertions, loader: a.read.loader, consoleErrors: a.consoleErrors.length, strictLines: b.lines.length, download: b.download.bytes }));
  if (!Object.values(assertions).every(Boolean)) process.exitCode = 1;
} finally { await browser.close(); }

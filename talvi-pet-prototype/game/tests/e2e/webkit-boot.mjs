// WORK-025-2 headless WebKit stand-in (gate 4 INSTALL; VERIFY-ASSET-008 / VERIFY-PRES-011 ENV-MAC-SA partial). Not Mac Safari, not an iPhone.
//   TPP_BASE=http://127.0.0.1:5204 TPP_EVIDENCE=<EV> TPP_WORK=WORK-025-2 TPP_MILESTONE=MILESTONE-007 node tests/e2e/webkit-boot.mjs
// Strict boot. Every value is read (loader totals, sound.locked, canShare, Share visibility, log lines), never inferred.
import { join } from 'node:path';
import { mkdirSync, statSync, writeFileSync } from 'node:fs';
import { webkit, devices } from 'playwright';
import { sha, boot, waitScene, getState, lines, until, setDebug, writeJson, errorsSummary, MILESTONE, WORK } from './lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const out = join(EV, 'webkit'); mkdirSync(out, { recursive: true });
const CHROMIUM_TOTAL = 102; // smoke.mjs line 47 pin (WORK-026-2 measured 91 + 4 sfx; WORK-034-1 measured 99 with the two owl-mate and two site-garden rows; WORK-038-1 + 3 sfx)
const PHONE = { name: 'iPhone 15 landscape (screen 852x393)', contextOptions: { ...devices['iPhone 15 landscape'], screen: { width: 852, height: 393 } } };
const DESK = { name: 'desktop 1920x823', contextOptions: { viewport: { width: 1920, height: 823 } } };

async function still(page, browser, name, meta) {
  const png = join(out, `webkit-${name}-001.png`); await page.screenshot({ path: png });
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify({ kind: 'screenshot', milestone: MILESTONE, work: WORK, point: `webkit-${name}`, sha, captured_at: new Date().toISOString(), tool: 'playwright-library webkit', version: browser.version(), bytes: statSync(png).size, ...meta }, null, 2)}\n`);
  return png;
}
const drain = async page => { for (let i = 0; i < 20 && (await getState(page)).dialogue.current; i++) { await page.locator('[data-panel="dialogue"]').click({ position: { x: 300, y: 60 } }); await page.waitForTimeout(350); } };

async function run(browser, target) {
  const w = await boot(browser, { query: '', contextOptions: target.contextOptions }), { page } = w, row = { target: target.name };
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Street') && window.__tpp.game.scene.getScene('Boot').loaderTotals?.totalComplete > 0, null, { timeout: 60000 });
  await waitScene(page, 'Street', 900);
  const H = await page.evaluate(() => Math.round(window.__tpp.game.scale.gameSize.height));
  Object.assign(row, await page.evaluate(() => ({ loader: window.__tpp.game.scene.getScene('Boot').loaderTotals, scene: window.__tpp.store.getState().scene,
    lockedBeforeInput: window.__tpp.game.sound.locked ?? null, avatarClips: ['idle-down', 'idle-up', 'idle-side', 'walk-down', 'walk-up', 'walk-side'].map(c => [c, window.__tpp.game.anims.exists(`avatar-${c}`)]),
    sfx: ['sfx/place', 'sfx/heart', 'sfx/complete', 'sfx/reaction', 'sfx/phase-pop', 'sfx/tick', 'sfx/riser', 'sfx/reveal'].map(id => [id, window.__tpp.game.cache.audio.exists(id)]), canShareType: typeof navigator.canShare, canShareFiles: typeof navigator.canShare === 'function' ? navigator.canShare({ files: [new File([''], 'x.jsonl', { type: 'application/x-ndjson' })] }) : null,
    gameSize: { w: window.__tpp.game.scale.gameSize.width, h: window.__tpp.game.scale.gameSize.height }, inner: [innerWidth, innerHeight], dpr: devicePixelRatio, ua: navigator.userAgent })));
  row.stills = [await still(page, browser, `street-${H}`, { target: target.name })];
  // First tap: the dialogue box (a real click/tap), then read sound.locked again (DEC-034 first-tap unlock).
  const box = page.locator('[data-panel="dialogue"]');
  if (await box.isVisible()) { if (target === PHONE) await box.tap({ position: { x: 300, y: 60 } }); else await box.click({ position: { x: 300, y: 60 } }); }
  await page.waitForTimeout(400);
  row.lockedAfterFirstTap = await page.evaluate(() => window.__tpp.game.sound.locked ?? null);
  await drain(page);
  // Share gating: the button's visibility equals canShare({files}).
  await setDebug(page, true);
  row.shareButton = await page.locator('.tpp-debug-row').filter({ has: page.locator('label', { hasText: /^Export log$/ }) }).first().locator('button').evaluateAll(bs => bs.map(b => ({ text: b.textContent, hidden: b.hidden })));
  row.shareVisibilityMatches = row.shareButton[2]?.hidden === !row.canShareFiles;
  row.stills.push(await still(page, browser, `debug-panel-${H}`, { target: target.name }));
  await setDebug(page, false);
  // Interior through the Starter House door (keyboard on desktop; touch has no keys, so the door step is desktop-only), then a charm placed.
  if (target === DESK) {
    await page.keyboard.down('KeyA'); await until(page, () => window.__tpp.store.getState().avatar.x <= 480, null, 10000).catch(() => null); await page.keyboard.up('KeyA');
    await page.keyboard.down('KeyW'); await until(page, () => window.__tpp.store.getState().scene.kind === 'interior', null, 10000).catch(() => null); await page.keyboard.up('KeyW');
    await waitScene(page, 'Interior', 900).catch(() => null); await drain(page);
    row.interior = (await getState(page)).scene;
    row.stills.push(await still(page, browser, `interior-${H}`, { target: target.name }));
  }
  const all = await lines(page);
  const firstTap = all.find(l => l.type === 'input.tap'), locked = all.filter(l => l.type === 'audio.locked');
  Object.assign(row, { audioLockedLines: locked.length, audioLockedBeforeFirstTap: locked.every(l => !firstTap || l.t <= firstTap.t), errors: errorsSummary(w.errors, all) });
  await w.context.close();
  return row;
}

/** The reveal popup (save-v1.milestone → Collect) at the given target, for the layout still. */
async function revealStill(browser, target, saveText) {
  const w = await boot(browser, { query: '', save: saveText, contextOptions: target.contextOptions }), { page } = w;
  await waitScene(page, 'Street', 900);
  await until(page, () => !document.querySelector('.tpp-milestonePopup').hidden, null, 15000);
  await page.locator('.tpp-milestonePopup .tpp-collect').click();
  await until(page, () => [...document.querySelectorAll('.tpp-revealPopup:not([hidden]) .tpp-clue')].filter(c => !c.hidden).length === 3, null, 10000); await page.waitForTimeout(500);
  const H = await page.evaluate(() => Math.round(window.__tpp.game.scale.gameSize.height));
  const png = await still(page, browser, `reveal-popup-${H}`, { target: target.name, save: 'save-v1.milestone (make-fixture)' });
  const errors = errorsSummary(w.errors, await lines(page)); await w.context.close();
  return { png, errors };
}

const browser = await webkit.launch();
try {
  const { makeFixture } = await import('./lib/harness.mjs');
  const rows = [await run(browser, DESK), await run(browser, PHONE)];
  const milestone = makeFixture(['--scenario', 'save-v1.milestone']).text;
  const reveal = [await revealStill(browser, DESK, milestone), await revealStill(browser, PHONE, milestone)];
  const checks = rows.map(r => ({ target: r.target, totalFailed0: r.loader?.totalFailed === 0, totalCompleteEqualsChromiumPin: r.loader?.totalComplete === CHROMIUM_TOTAL, sfxCachedAll8: r.sfx?.length === 8 && r.sfx.every(([, v]) => v), street: r.scene?.kind === 'street',
    zeroErrors: !r.errors.consoleErrors.length && !r.errors.pageErrors.length && !r.errors.assetLoadErrors.length, avatarClips: r.avatarClips.every(([, e]) => e),
    soundLockedTrueToFalse: r.lockedBeforeInput === true && r.lockedAfterFirstTap === false, audioLockedAtMostOnceBeforeTap: r.audioLockedLines <= 1 && r.audioLockedBeforeFirstTap, shareVisibilityMatches: r.shareVisibilityMatches }));
  const report = { work: WORK, sha, browser: `webkit ${browser.version()}`, result: 'partial (headless WebKit stand-in)', note: 'not Mac Safari and not an iPhone: VERIFY-PRES-011 ENV-MAC-SA and ENV-IPH device cells stay not-run (user, dry-run session); sound.locked values are recorded as observed',
    chromiumTotalPin: CHROMIUM_TOTAL, rows, reveal, checks };
  writeJson(join(out, 'report.json'), report);
  console.log(JSON.stringify(checks), JSON.stringify(rows.map(r => [r.target, r.loader, r.lockedBeforeInput, r.lockedAfterFirstTap, r.canShareType, r.canShareFiles])));
} finally { await browser.close(); }

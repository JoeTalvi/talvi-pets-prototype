// WORK-025-1 debug rows 11 (Tester label) and 13 (Export log) live: stills at 1080 / 823 / 897 and the real Download button
// (Playwright library, pinned chromium-1243 by executablePath; no install). Strict boot (no ?lenient=1), fresh save.
//   TPP_BASE=http://127.0.0.1:5203 TPP_EVIDENCE=<EV> TPP_WORK=WORK-025-1 TPP_MILESTONE=MILESTONE-007 node tests/view/capture/work-025-1.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha, launch, boot, waitScene, lines, getState, setDebug, shot, writeJson, errorsSummary, createSteps } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const captures = join(EV, 'captures'), LABEL = 'dry-run-025-1';
const { steps, step } = createSteps();
const errorsByWindow = [];
const row = (page, label) => page.locator('.tpp-debug-row').filter({ has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) }).first();

/** Opens the panel, types the label (Enter fires `change`), reads rows 11 and 13. */
async function labelAndRead(page) {
  await setDebug(page, true);
  const input = row(page, 'Tester label').locator('input');
  await input.fill(LABEL); await input.press('Enter'); await page.waitForTimeout(200);
  await row(page, 'Export log').scrollIntoViewIfNeeded(); await page.waitForTimeout(150); // rows 11–13 in frame for the still
  const buttons = await row(page, 'Export log').locator('button').evaluateAll(bs => bs.map(b => ({ text: b.textContent, disabled: b.disabled, hidden: b.hidden })));
  return { inputDisabled: await input.isDisabled(), inputValue: await input.inputValue(), buttons,
    canShare: await page.evaluate(() => typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'x.jsonl', { type: 'application/x-ndjson' })] })),
    testerLabel: (await getState(page)).session.testerLabel };
}

async function still(browser, height) {
  const w = await boot(browser, { height, query: '' });
  await waitScene(w.page, 'Street');
  const read = await labelAndRead(w.page);
  const applied = (await lines(w.page, 'debug.applied')).some(l => l.action?.type === 'debugSetTesterLabel' && l.action.text === LABEL);
  const live = !read.inputDisabled && read.buttons.filter(b => !b.hidden).every(b => !b.disabled) && read.testerLabel === LABEL && applied;
  step(`rows 11 and 13 live at 1920×${height}`, live && read.buttons[2].hidden === !read.canShare,
    `label input enabled, debug.applied debugSetTesterLabel "${LABEL}", Download/Copy enabled, Share hidden iff !canShare({files})`, { ...read, applied });
  const png = await shot(w.page, browser, captures, `debug-rows-11-13-${height}`, { save: 'fresh (none)', label: LABEL, query: '(strict)' });
  return { w, png };
}

async function download(w) {
  const { page } = w;
  const before = await lines(page);
  const [file] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), row(page, 'Export log').locator('button', { hasText: /^Download$/ }).click()]);
  const out = join(EV, 'export-download.jsonl');
  await file.saveAs(out);
  await page.waitForTimeout(200);
  const exported = readFileSync(out, 'utf8').trimEnd().split('\n').map(l => JSON.parse(l));
  const after = await lines(page);
  const last = after.at(-1);
  step('row 13 Download through the real button: .jsonl arrives, its last line is the latest pre-export record',
    exported.length >= before.length && JSON.stringify(exported.at(-1)) === JSON.stringify(before.at(-1)) && exported[0].type === 'session.started',
    'file lines >= pre-click ring; last = latest pre-export record; first = session.started',
    { filename: file.suggestedFilename(), fileLines: exported.length, ringBefore: before.length, fileLast: exported.at(-1)?.type, ringBeforeLast: before.at(-1)?.type });
  step('lines() then ends with log.exported {method: download}', last.type === 'log.exported' && last.method === 'download' && last.lines === exported.length,
    `log.exported {method: 'download', lines: ${exported.length}}`, last);
}

const browser = await launch();
try {
  for (const height of [1080, 823, 897]) {
    const { w } = await still(browser, height);
    if (height === 1080) await download(w);
    errorsByWindow.push({ window: `street-${height}`, ...errorsSummary(w.errors, await lines(w.page)) });
    await w.context.close();
  }
} finally { await browser.close(); }
const clean = errorsByWindow.every(e => !e.consoleErrors.length && !e.pageErrors.length && !e.assetLoadErrors.length && !e.appErrors.length);
step('no console, page, asset.loadError or app.error in any window', clean, 'all zero', errorsByWindow.map(e => [e.window, e.consoleErrors.length, e.pageErrors.length, e.assetLoadErrors.length, e.appErrors.length]));
const ok = steps.every(s => s.ok);
writeJson(join(EV, 'capture-report.json'), { kind: 'capture', work: 'WORK-025-1', sha, ok, steps, errorsByWindow });
console.log(JSON.stringify({ ok, steps: steps.map(s => [s.step, s.ok]) }, null, 1));
process.exitCode = ok ? 0 : 1;

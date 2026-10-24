// WORK-021-3 renders half of the TECH-018 visual pass: element screenshots of the twelve MILESTONE-005 screens of renders.html
// (read-only, file://) with a sidecar per frame. Usage: node tests/e2e/renders-capture.mjs <renders.html> <outDir>
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { executablePath } from './lib/harness.mjs';

const SCREENS = [[1, 'street-idle'], [2, 'street-attention'], [3, 'street-celebration'], [4, 'street-reveal-popup'], [6, 'interior'], [7, 'design-mode'],
  [8, 'chooser'], [9, 'replace-remove'], [10, 'want-states'], [11, 'dialogue'], [13, 'toast'], [15, 'stars']];
const [source, outDir] = process.argv.slice(2);
if (!source || !outDir) { console.error('usage: node tests/e2e/renders-capture.mjs <renders.html> <outDir>'); process.exit(2); }
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, executablePath });
let failed = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(source).href);
  await page.waitForLoadState('networkidle');
  for (const [n, id] of SCREENS) {
    const frame = page.locator(`section#${id} svg.frame`).first();
    if (!(await frame.count())) { console.error(`missing frame: ${id}`); failed += 1; continue; }
    const png = join(outDir, `${n}-${id}.png`);
    await frame.screenshot({ path: png });
    const box = await frame.boundingBox();
    const viewBox = await frame.getAttribute('viewBox');
    const title = await page.locator(`section#${id} h2`).textContent();
    const notes = await page.locator(`section#${id} ol.notes li`).allTextContents();
    writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify({ kind: 'screenshot', milestone: 'MILESTONE-005', work: 'WORK-021-3', point: `${n}-${id}`, source, revision: 123,
      selector: `section#${id} svg.frame`, crop: box, viewBox, title, notes, bytes: statSync(png).size, tool: 'playwright-library', binary: executablePath, version: browser.version(), captured_at: new Date().toISOString() }, null, 2)}\n`);
    console.log(`${n}-${id}: ${png}`);
  }
} finally { await browser.close(); }
process.exit(failed ? 1 : 0);

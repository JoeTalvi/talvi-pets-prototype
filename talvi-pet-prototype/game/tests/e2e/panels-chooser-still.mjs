// WORK-033-2: still of the /tools/panels.html chooser states (badge cards + one "none left" card), the shared charmCard markup.
//   TPP_BASE=http://127.0.0.1:5214 TPP_EVIDENCE=<EV>/m3 TPP_WORK=WORK-033-2 TPP_MILESTONE=MILESTONE-009 node tests/e2e/panels-chooser-still.mjs
import { join } from 'node:path';
import { base, evidenceRoot, launch, shot } from './lib/harness.mjs';

const browser = await launch();
try {
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${base}/tools/panels.html`);
  await page.waitForSelector('#chooser-open .tpp-charm-card');
  await page.locator('#chooser-open').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  const cards = await page.evaluate(() => ['chooser-open', 'chooser-overflow', 'chooser-selected'].map(id => ({ id,
    cards: [...document.querySelectorAll(`#${id} .tpp-charm-card`)].map(c => ({ label: c.querySelector('.tpp-charm-copies')?.textContent, ariaDisabled: c.getAttribute('aria-disabled'), noneLeft: c.classList.contains('none-left') })) })));
  const png = await shot(page, browser, join(evidenceRoot, 'captures'), 'panels-chooser-states-1080', { target: `${base}/tools/panels.html#chooser-open`, note: 'panel gallery chooser states: "×1" badges and one "none left" card', cards, pageErrors: errors });
  const ok = cards.every(f => f.cards.length > 0 && f.cards.at(-1).noneLeft && f.cards.at(-1).label === 'none left' && f.cards.slice(0, -1).every(c => c.label === '×1' && !c.noneLeft)) && !errors.length;
  console.log(JSON.stringify({ ok, png, cards }, null, 1));
  process.exitCode = ok ? 0 : 1;
} finally { await browser.close(); }

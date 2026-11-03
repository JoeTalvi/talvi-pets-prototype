// WORK-036-1 capture points 1–2 (VERIFY-WORK-036-1-11): on the street with the mate's want 3 active, row 24 "Greet now"
// greets the Owl and fulfils greet-the-owl in the same dispatch. Playwright library, pinned chromium-1243; no install.
//   TPP_BASE=http://127.0.0.1:5219 TPP_EVIDENCE=<EV> TPP_WORK=WORK-036-1 TPP_MILESTONE=MILESTONE-011 node tests/view/capture/work-036-1.mjs
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha, launch, boot, waitScene, getState, lines, until, shot, writeJson, errorsSummary, setDebug, debugClick }
  from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const save = readFileSync('tests/view/capture/mate-arrived.real.json', 'utf8');
const browser = await launch();
const w = await boot(browser, { height: 1080, save, query: '' }), { page } = w;
await waitScene(page, 'Street', 1200);

/** Close the vignette (and any queued script) the way a player would, then wait out the Heart moment. */
async function finishHeart() {
  const ended = page.evaluate(() => new Promise(done => { window.addEventListener('tpp:heartMomentEnd', () => done(true), { once: true });
    setTimeout(() => done(false), 8000); }));
  while ((await getState(page)).dialogue.current) {
    await page.evaluate(() => window.__tpp.store.dispatch({ type: 'advanceDialogue' }));
    await page.waitForTimeout(150);
  }
  return ended;
}

await debugClick(page, 'Pets outside', 'All out');
const heartEnds = [];
for (let i = 0; i < 2; i++) {
  await setDebug(page, true);
  await page.locator('.tpp-debug-row').filter({ has: page.locator('label', { hasText: /^Fulfil active want$/ }) }).first()
    .locator('select').selectOption('owl-mate');
  await debugClick(page, 'Fulfil active want', 'Fulfil');
  heartEnds.push(await finishHeart());
}
const before = await getState(page);
const cursor = (await lines(page)).length;
await debugClick(page, 'Greet now', 'Greet');
await until(page, () => window.__tpp.log.lines().some(l => l.type === 'greeting.played'), null, 3000);
const state = await getState(page);
await page.locator('button[aria-label="Close debug"]').first().click();
await page.waitForTimeout(300);
const png = await shot(page, browser, join(EV, 'captures'), 'greet-now-1080',
  { note: 'street right after row 24 Greet now: Owl and mate in meeting, facing each other; no bubble expected in this lane' });
const all = await lines(page);
const slice = all.slice(cursor);
const from = slice.findIndex(l => l.type === 'greeting.played');
const to = slice.findIndex(l => l.type === 'wants.exhausted');
const pick = ({ type, petA, petB, emoteA, emoteB, petId, wantId, hearts, focusSlotId }) =>
  Object.fromEntries(Object.entries({ type, petA, petB, emoteA, emoteB, petId, wantId, hearts, focusSlotId }).filter(([, v]) => v !== undefined));
const played = slice.find(l => l.type === 'greeting.played');
const fulfilled = slice.find(l => l.type === 'want.fulfilled' && l.wantId === 'greet-the-owl');
const errs = errorsSummary(w.errors, all);
const key = 'owl-mate|owl';
const row = {
  work: 'WORK-036-1', sha, check: 'VERIFY-WORK-036-1-11',
  wantBeforeGreet: { mateHearts: before.pets['owl-mate'].hearts, owlOutside: before.pets.owl.outside, dialogueOpen: before.dialogue.current !== null },
  heartMomentEnded: heartEnds,
  greetings: state.greetings, cooldownMs: state.greetings[key]?.cooldownMs ?? null,
  phases: { 'owl-mate': state.pets['owl-mate'].behaviour.phase, owl: state.pets.owl.behaviour.phase },
  facing: { 'owl-mate': [state.pets['owl-mate'].behaviour.x, state.pets['owl-mate'].behaviour.facing], owl: [state.pets.owl.behaviour.x, state.pets.owl.behaviour.facing] },
  mateHearts: state.pets['owl-mate'].hearts,
  log: from >= 0 ? slice.slice(from, to >= 0 ? to + 1 : undefined).map(pick) : [],
  debugPanelClosed: !(await page.evaluate(() => { const p = document.querySelector('.tpp-debug-window'); return !!p && p.getClientRects().length > 0; })),
  errors: errs, png,
};
row.pass = row.cooldownMs > 55000 && row.mateHearts === 3 && !!played && !!played.emoteA && !!played.emoteB && !!fulfilled &&
  slice.indexOf(played) < slice.indexOf(fulfilled) && errs.consoleErrors.length === 0 && errs.pageErrors.length === 0;
writeJson(join(EV, 'rows', 'greet-now.json'), row);
console.log(JSON.stringify({ pass: row.pass, cooldownMs: row.cooldownMs, mateHearts: row.mateHearts, phases: row.phases, log: row.log.map(l => l.type) }, null, 1));
await w.context.close();
await browser.close();
process.exit(row.pass ? 0 : 1);

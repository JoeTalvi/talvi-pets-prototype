// WORK-032-2 capture points 1–4 (fixes 4, 5, 6a, 6b) live on the lane's dev server (Playwright library, pinned chromium-1243; no install).
//   TPP_BASE=http://127.0.0.1:5212 TPP_EVIDENCE=<EV> TPP_WORK=WORK-032-2 TPP_MILESTONE=MILESTONE-009 node tests/view/capture/work-032-2.mjs
// Saves come from the game's own fixture tool (dog-room-intro-done) into <EV>/fixtures; actions go through window.__tpp.store.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, boot, waitScene, lines, getState, shot, writeJson, errorsSummary, createSteps, makeFixture, startStreamRecording, encode, until } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const captures = join(EV, 'captures'), loops = join(EV, 'loops'), rows = join(EV, 'rows');
const { steps, step } = createSteps();
const errorsByWindow = [];
mkdirSync(join(EV, 'fixtures'), { recursive: true });
const save = makeFixture(['--scenario', 'dog-room-intro-done'], join(EV, 'fixtures')).text;

const dispatch = (page, action) => page.evaluate(a => window.__tpp.store.dispatch(a), action);
const drain = page => page.evaluate(() => { const { store } = window.__tpp; for (let i = 0; i < 20 && store.getState().dialogue.current; i++) store.dispatch({ type: 'advanceDialogue' }); });
const tintOn = page => page.evaluate(() => window.__tpp.game.scene.getScene('Interior').designTint.on);

async function room(browser) {
  const w = await boot(browser, { save });
  await waitScene(w.page, 'Interior', 900);
  await drain(w.page);
  await w.page.waitForTimeout(300);
  return w;
}

async function fix4(browser) {
  const w = await room(browser);
  const play = await shot(w.page, browser, captures, 'fix4-tint-play-1080', { save: 'dog-room-intro-done' });
  await w.page.locator('.tpp-design-toggle').click();
  await w.page.waitForTimeout(500);
  const hud = await w.page.evaluate(() => { const r = document.querySelector('#overlay') ?? document.querySelector('#panels').parentElement; return { filter: getComputedStyle(r).filter, panelsFilter: getComputedStyle(document.querySelector('#panels')).filter }; });
  const design = await shot(w.page, browser, captures, 'fix4-tint-design-1080', { save: 'dog-room-intro-done', mode: 'design' });
  step('fix 4: Decorate turns the world tint on; HUD overlay carries no filter', (await getState(w.page)).mode === 'design' && await tintOn(w.page) && hud.filter === 'none' && hud.panelsFilter === 'none',
    'mode design, Interior.designTint.on, overlay filter none', { hud, play, design });
  errorsByWindow.push({ window: 'fix4', ...errorsSummary(w.errors, await lines(w.page)) });
  await w.context.close();
}

async function fix5(browser) {
  const w = await room(browser);
  await dispatch(w.page, { type: 'debugUnlockAllTypes' });
  await dispatch(w.page, { type: 'setDesignMode', on: true });
  const out = {};
  for (const [wall, slotId] of [['left', 'wall-2'], ['right', 'wall-3']]) {
    await dispatch(w.page, { type: 'placeCharm', slotId, typeId: 'hanging-plant' });
    await dispatch(w.page, { type: 'setDesignMode', on: false });
    await w.page.waitForTimeout(1100); // past the Stars burst
    const flipX = await w.page.evaluate(id => window.__tpp.game.scene.getScene('Interior').charms.get(id)?.flipX, slotId);
    out[wall] = { slotId, flipX, png: await shot(w.page, browser, captures, `fix5-plant-${wall}-1080`, { slotId, typeId: 'hanging-plant' }) };
    await dispatch(w.page, { type: 'setDesignMode', on: true });
    await dispatch(w.page, { type: 'removeCharm', slotId });
  }
  step('fix 5: hanging-plant mirrored on the left wall, as drawn on the right wall', out.left.flipX === true && out.right.flipX === false, 'left flipX true, right flipX false', out);
  errorsByWindow.push({ window: 'fix5', ...errorsSummary(w.errors, await lines(w.page)) });
  await w.context.close();
}

async function fix6a(browser) {
  const w = await room(browser);
  await w.page.locator('.tpp-design-toggle').click();
  await w.page.waitForTimeout(400);
  const rec = await startStreamRecording(w.page, join(EV, 'frames-fix6a'));
  await w.page.waitForTimeout(300);
  const t0 = Date.now();
  const typeId = await w.page.evaluate(() => { const { store, content } = window.__tpp, counts = store.getState().inventory.counts;
    return content.charms.types.find(t => counts[t.id] > 0 && t.sizeClass === 'small').id; });
  await dispatch(w.page, { type: 'placeCharm', slotId: 'floor-3', typeId });
  const burst = await w.page.evaluate(() => ({ stars: document.querySelectorAll('.tpp-burst-star').length, pe: getComputedStyle(document.querySelector('.tpp-stars-burst')).pointerEvents }));
  await w.page.waitForTimeout(200);
  await w.page.locator('.tpp-design-toggle').click(); // a tap during the burst is handled
  const modeAfterTap = (await getState(w.page)).mode;
  await w.page.waitForTimeout(800);
  const gone = await w.page.evaluate(() => document.querySelectorAll('.tpp-stars-burst').length === 0);
  await w.page.waitForTimeout(500);
  const sidecar = encode(loops, 'fix6a-burst', await rec.stop(), { save: 'dog-room-intro-done', action: `placeCharm floor-3 ${typeId}` });
  const changed = (await lines(w.page, 'stars.changed')).at(-1);
  const row = { burst, modeAfterTap, goneBy1000ms: gone, starsChanged: changed, elapsedMs: Date.now() - t0, loop: sidecar.outputs?.mp4 ?? sidecar.gap };
  writeJson(join(rows, 'fix6a.json'), row);
  step('fix 6a: gain → 8 stars, pointer-events none, tap during the burst toggles the mode, gone by ~1 s', burst.stars === 8 && burst.pe === 'none' && modeAfterTap === 'play' && gone && changed?.delta > 0, '8 / none / play / gone', row);
  errorsByWindow.push({ window: 'fix6a', ...errorsSummary(w.errors, await lines(w.page)) });
  await w.context.close();
}

async function fix6b(browser, skip) {
  const w = await room(browser);
  await dispatch(w.page, { type: 'setDesignMode', on: true });
  const rec = await startStreamRecording(w.page, join(EV, `frames-fix6b${skip ? '-skip' : ''}`));
  await w.page.waitForTimeout(300);
  await dispatch(w.page, { type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
  const at0 = await w.page.evaluate(() => ({ moment: !!document.querySelector('.tpp-heart-moment'), pet: window.__tpp.game.scene.getScene('Interior').heartPet?.anims.currentAnim?.key ?? null,
    boxHidden: document.querySelector('.tpp-dialogue').hidden }));
  let skipped = null;
  if (skip) { await w.page.waitForTimeout(800); await w.page.mouse.click(960, 300); skipped = await w.page.evaluate(() => !document.querySelector('.tpp-heart-moment')); }
  const boxShown = await until(w.page, () => !document.querySelector('.tpp-dialogue').hidden, null, 9000);
  const line = await w.page.evaluate(() => document.querySelector('.tpp-dialogue-line').textContent);
  await w.page.waitForTimeout(800);
  const name = skip ? 'fix6b-heart-skip' : 'fix6b-heart';
  const sidecar = encode(loops, name, await rec.stop(), { save: 'dog-room-intro-done', action: 'placeCharm large-1 dog-bed', skipAtMs: skip ? 800 : null });
  const row = { at0, skipped, boxShown, line, source: (await getState(w.page)).dialogue.current?.source ?? null, loop: sidecar.outputs?.mp4 ?? sidecar.gap };
  writeJson(join(rows, `${name}.json`), row);
  step(`fix 6b${skip ? ' skip' : ''}: moment + big react at heart.earned, box hidden, then the vignette box`, at0.moment && at0.pet === 'pet-dog-react' && at0.boxHidden && boxShown && (!skip || skipped), 'moment, react, box later', row);
  errorsByWindow.push({ window: name, ...errorsSummary(w.errors, await lines(w.page)) });
  await w.context.close();
}

const browser = await launch();
try {
  await fix4(browser);
  await fix5(browser);
  await fix6a(browser);
  await fix6b(browser, false);
  await fix6b(browser, true);
  step('zero console/page errors in every window', errorsByWindow.every(e => !e.consoleErrors.length && !e.pageErrors.length && !e.assetLoadErrors.length && !e.appErrors.length), 'none', errorsByWindow);
} finally {
  await browser.close();
  writeJson(join(EV, 'capture-report.json'), { steps, errorsByWindow });
}
for (const s of steps) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.step}`);
process.exitCode = steps.every(s => s.ok) ? 0 : 1;

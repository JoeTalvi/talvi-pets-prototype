// WORK-038-2 capture points (spec §5 Heart moment v2) live on the lane's dev server (Playwright library, pinned chromium-1243; no install).
//   TPP_BASE=http://127.0.0.1:5213 TPP_EVIDENCE=<EV> TPP_WORK=WORK-038-2 TPP_MILESTONE=MILESTONE-011 node tests/view/capture/work-038-2.mjs
// Windows: (1) the Dog's first Heart, tapped every 200 ms from 600 ms (unskippable until its cards show); (2) its next Heart, tapped at
// ≈ 800 ms (skip-to-result); (3) the mate's first Heart on the street. Each row records t of `heart`, `tpp:heartArrived`, each card mount and the end.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, boot, waitScene, lines, shot, writeJson, errorsSummary, createSteps, makeFixture, startStreamRecording, encode, until, GAME_DIR } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const captures = join(EV, 'captures'), loops = join(EV, 'loops'), rows = join(EV, 'rows');
const { steps, step } = createSteps();
const errorsByWindow = [];
mkdirSync(join(EV, 'fixtures'), { recursive: true });
const roomSave = makeFixture(['--scenario', 'dog-room-intro-done'], join(EV, 'fixtures')).text;
const mateSave = makeFixture(['--steps', join(GAME_DIR, 'tests/view/capture/mate-arrived.steps.json')], join(EV, 'fixtures')).text;

const dispatch = (page, action) => page.evaluate(a => window.__tpp.store.dispatch(a), action);
const drain = page => page.evaluate(() => { const { store } = window.__tpp; for (let i = 0; i < 20 && store.getState().dialogue.current; i++) store.dispatch({ type: 'advanceDialogue' }); });

/** Times (ms after `heart.earned`) of the `heart` play, the hit, the arrival, each card mount, the settle and the end. */
const instrument = page => page.evaluate(() => {
  const rec = window.__heartRec = { earned: null, hearts: null, heart: [], hit: [], arrived: [], cards: [], settle: [], end: [], sounds: [] };
  const t = () => (rec.earned === null ? null : Math.round(performance.now() - rec.earned));
  window.__tpp.store.subscribe('heart.earned', e => { rec.earned = performance.now(); rec.hearts = e.hearts; });
  const audio = window.__tpp.context.audio, play = audio.play.bind(audio);
  audio.play = (id, opts) => { rec.sounds.push([id, opts?.semitones ?? 0, t()]); if (id === 'heart') rec.heart.push(t()); return play(id, opts); };
  for (const [type, key] of [['tpp:heartHit', 'hit'], ['tpp:heartArrived', 'arrived'], ['tpp:heartSettle', 'settle'], ['tpp:heartMomentEnd', 'end']]) window.addEventListener(type, () => rec[key].push(t()));
  new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.classList?.contains('tpp-reward-card')) rec.cards.push([n.dataset.kind, t()]); })
    .observe(document.querySelector('#panels'), { childList: true, subtree: true });
});
const record = page => page.evaluate(() => window.__heartRec);
const momentGone = page => until(page, () => !document.querySelector('.tpp-heart-moment'), null, 9000);

async function firstHeart(browser) {
  const w = await boot(browser, { save: roomSave });
  await waitScene(w.page, 'Interior', 900); await drain(w.page); await w.page.waitForTimeout(300);
  await dispatch(w.page, { type: 'setDesignMode', on: true });
  await instrument(w.page);
  const rec = await startStreamRecording(w.page, join(EV, 'frames-heart-first'));
  await w.page.waitForTimeout(300);
  await dispatch(w.page, { type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
  await w.page.waitForTimeout(455);
  const hitShot = await shot(w.page, browser, captures, 'heart-hit-1080', { save: 'dog-room-intro-done', beat: 'hit ≈ 455 ms' });
  const beats = [];
  for (let at = 600; at <= 2600; at += 200) {
    await w.page.waitForFunction(at => performance.now() - window.__heartRec.earned >= at, at);
    if (at === 2200) await shot(w.page, browser, captures, 'heart-cards-1080', { save: 'dog-room-intro-done', beat: 'cards shown ≈ 2200 ms' });
    const beat = await w.page.evaluate(() => document.querySelector('.tpp-heart-moment')?.dataset.beat ?? null);
    beats.push([at, beat]);
    if (beat) await w.page.mouse.click(960, 300);
  }
  await momentGone(w.page);
  const boxShown = await until(w.page, () => !document.querySelector('.tpp-dialogue').hidden, null, 9000);
  await w.page.waitForTimeout(600);
  const row = { ...(await record(w.page)), tapBeats: beats, boxShown, hitShot };
  const sidecar = encode(loops, 'heart-first', await rec.stop(), { save: 'dog-room-intro-done', action: 'placeCharm large-1 dog-bed; taps every 200 ms from 600' });
  row.loop = sidecar.outputs?.mp4 ?? sidecar.gap;
  writeJson(join(rows, 'heart-first.json'), row);
  const resultBefore = beats.filter(([at]) => at < 2070).every(([, b]) => b !== 'result');
  step('first Heart: unskippable until its cards show; heart at the hit (450) once; arrival 1750; vignette box after', row.hearts === 1 && resultBefore && row.heart.length === 1 && row.heart[0] >= 430 && row.heart[0] <= 520 && boxShown,
    'taps before 2070 do nothing; heart once ≈ 450', row);
  errorsByWindow.push({ window: 'heart-first', ...errorsSummary(w.errors, await lines(w.page)) });
  return w;
}

async function skipHeart(browser, w) {
  await drain(w.page); await w.page.waitForTimeout(500);
  const rec = await startStreamRecording(w.page, join(EV, 'frames-heart-skip'));
  await w.page.waitForTimeout(300);
  await dispatch(w.page, { type: 'debugFulfilActiveWant', petId: 'dog' });
  await w.page.waitForFunction(() => performance.now() - window.__heartRec.earned >= 800);
  await w.page.mouse.click(960, 300);
  await w.page.waitForTimeout(60);
  const resultShot = await shot(w.page, browser, captures, 'heart-skip-result-1080', { save: 'dog-room-intro-done + 1 Heart', beat: 'skip result ≈ 860 ms' });
  const beat = await w.page.evaluate(() => document.querySelector('.tpp-heart-moment')?.dataset.beat ?? null);
  await momentGone(w.page);
  await w.page.waitForTimeout(600);
  const row = { ...(await record(w.page)), beatAfterTap: beat, resultShot };
  const sidecar = encode(loops, 'heart-skip', await rec.stop(), { save: 'dog-room-intro-done', action: 'debugFulfilActiveWant dog; tap at ≈ 800 ms' });
  row.loop = sidecar.outputs?.mp4 ?? sidecar.gap;
  writeJson(join(rows, 'heart-skip.json'), row);
  const end = row.end.at(-1);
  step('later Heart: a tap at ≈ 800 ms jumps to the result, holds 600, then half send/settle (end ≈ 1750)', row.hearts === 2 && beat === 'result' && end >= 1650 && end <= 1950,
    'result; end ≈ 800 + 600 + 350', row);
  errorsByWindow.push({ window: 'heart-skip', ...errorsSummary(w.errors, await lines(w.page)) });
  await w.context.close();
}

async function mateHeart(browser) {
  const w = await boot(browser, { save: mateSave });
  await waitScene(w.page, 'Street', 1200); await drain(w.page); await w.page.waitForTimeout(500);
  await instrument(w.page);
  const rec = await startStreamRecording(w.page, join(EV, 'frames-heart-mate'));
  await w.page.waitForTimeout(300);
  await dispatch(w.page, { type: 'debugFulfilActiveWant', petId: 'owl-mate' });
  await w.page.waitForTimeout(455);
  const big = await w.page.evaluate(() => window.__tpp.game.scene.getScene('Street').heartPet?.anims.currentAnim?.key ?? null);
  await momentGone(w.page);
  await w.page.waitForTimeout(600);
  const row = { ...(await record(w.page)), bigPet: big };
  const sidecar = encode(loops, 'heart-mate', await rec.stop(), { save: 'mate-arrived', action: 'debugFulfilActiveWant owl-mate' });
  row.loop = sidecar.outputs?.mp4 ?? sidecar.gap;
  writeJson(join(rows, 'heart-mate.json'), row);
  const ticks = row.sounds.filter(s => s[0] === 'tick' && s[1] === 7 && s[2] < 2000);
  step('mate first Heart on the street: ×2 mate at the hit, the ♥ fades in place (no +7 tick), the moment ends', row.hearts === 1 && big === 'pet-owl-mate-react' && ticks.length === 0 && row.end.length >= 1,
    'street variant', row);
  errorsByWindow.push({ window: 'heart-mate', ...errorsSummary(w.errors, await lines(w.page)) });
  await w.context.close();
}

const browser = await launch();
try {
  const w = await firstHeart(browser);
  await skipHeart(browser, w);
  await mateHeart(browser);
  step('zero console/page errors in every window', errorsByWindow.every(e => !e.consoleErrors.length && !e.pageErrors.length && !e.assetLoadErrors.length && !e.appErrors.length), 'none', errorsByWindow);
} finally {
  await browser.close();
  writeJson(join(EV, 'capture-report.json'), { steps, errorsByWindow });
}
for (const s of steps) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.step}`);
process.exitCode = steps.every(s => s.ok) ? 0 : 1;

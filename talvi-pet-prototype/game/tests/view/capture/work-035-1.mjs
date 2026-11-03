// WORK-035-1 capture points 2–4: B1 stills (the avatar stopped below each widened blocker), debug row 23, the B16 mate arrival
// walk at 1080 and 823. Playwright library, pinned chromium-1243; no install. Numbers are read from window.__tpp.
//   TPP_BASE=http://127.0.0.1:5216 TPP_EVIDENCE=<EV> TPP_WORK=WORK-035-1 TPP_MILESTONE=MILESTONE-011 node tests/view/capture/work-035-1.mjs [b1|debug|b16]...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha, launch, boot, waitScene, getState, lines, until, steer, holdUntil, shot, encode, startStreamRecording, writeJson,
  errorsSummary, setDebug, debugClick, waitLine } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const stills = join(EV, 'stills'), loops = join(EV, 'loops');
const modes = process.argv.slice(2).length ? process.argv.slice(2) : ['b1', 'debug', 'b16'];
const save = name => readFileSync(join('tests/view/capture', `${name}.real.json`), 'utf8');
const browser = await launch();
const errors = [], rows = {};
const close = async (w, name) => { errors.push({ window: name, ...errorsSummary(w.errors, await lines(w.page)) }); await w.context.close(); };
const open = async (name, height = 1080) => { const w = await boot(browser, { height, save: save(name), query: '' }); await waitScene(w.page, 'Street', 1200); return w; };

async function b1() {
  const w = await open('mate-arrived'), { page } = w;
  const result = {};
  for (const [key, x, y] of [['starter', 410, 965], ['pet', 1300, 1000]]) {
    await steer(page, x, y, `() => Math.abs(window.__tpp.store.getState().avatar.x - ${x}) < 14 && Math.abs(window.__tpp.store.getState().avatar.y - ${y}) < 14`, 15000);
    await holdUntil(page, 'KeyW', () => false, null, 1500).catch(() => null);
    const { avatar, scene } = await getState(page);
    const png = await shot(page, browser, stills, `b1-${key}-1080`, { note: `avatar held up from (${x}, ${y}) for 1.5 s: stops below the B1 blocker` });
    result[key] = { avatar: { x: avatar.x, y: avatar.y }, scene: scene.kind, png };
  }
  rows.b1 = { sha, ...result, pass: result.starter.avatar.y >= 880 && result.pet.avatar.y >= 940 };
  await close(w, 'b1');
}

async function debug() {
  const w = await open('mate-arrived'), { page } = w;
  await setDebug(page, true);
  await page.locator('.tpp-debug-row').filter({ has: page.locator('label', { hasText: /^Pets outside$/ }) }).first().scrollIntoViewIfNeeded();
  await debugClick(page, 'Pets outside', 'All out');
  const png = await shot(page, browser, stills, 'debug-row-23', { note: 'debug panel open, row 23 Pets outside after All out' });
  const state = await getState(page);
  rows.debug = { sha, petsOutside: state.session.petsOutside, png, pass: state.session.petsOutside === 'all' };
  await close(w, 'debug');
}

async function b16() {
  rows.b16 = [];
  for (const height of [1080, 823]) {
    const w = await open('site-unlocked', height), { page } = w;
    const rec = await startStreamRecording(page, join(EV, 'frames', `b16-${height}`));
    await debugClick(page, 'Fill garden');
    await setDebug(page, false);
    const started = await until(page, () => window.__tpp.log.lines().some(l => l.type === 'space.arrivalStarted'), null, 3000).catch(() => null);
    if (!started) await page.getByRole('button', { name: /done/i }).first().click().catch(() => null);
    const a = await waitLine(page, 'space.arrivalStarted', {}, 10000).catch(() => null);
    const b = await waitLine(page, 'pet.arrived', {}, 20000).catch(() => null);
    await page.waitForTimeout(800);
    const frames = await rec.stop();
    const t0 = a?.t ?? frames[0]?.t, t1 = (b?.t ?? frames.at(-1)?.t) + 800;
    const mp4 = frames.length ? encode(loops, `b16-mate-arrival-${height}`, frames.filter(f => f.t >= t0 - 300 && f.t <= t1),
      { viewport: { width: 1920, height }, seededSave: 'site-unlocked.real.json', note: 'Fill garden -> arrival walk -> pet.arrived' }, { maxMs: 12000 }) : null;
    rows.b16.push({ height, arrivalStartedT: a?.t ?? null, arrivedT: b?.t ?? null, walkMs: a && b ? b.t - a.t : null, loop: mp4, pass: !!(a && b) });
    await close(w, `b16-${height}`);
  }
}

for (const mode of modes) await { b1, debug, b16 }[mode]();
writeJson(join(EV, 'captures-work-035-1.json'), { work: 'WORK-035-1', sha, rows, errors });
console.log(JSON.stringify(rows, null, 1));
await browser.close();

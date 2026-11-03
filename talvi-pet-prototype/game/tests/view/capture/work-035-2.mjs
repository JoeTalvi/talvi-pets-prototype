// WORK-035-2 capture (review WORK-035-1-1 advisory A1): re-record the B16 mate arrival walk at this head, 1920×1080 and 1920×823.
// work-035-1.mjs cut its frames by the game log's `t` (game clock) against the screencast's epoch timestamps, so no frame matched and
// the encode recorded "no screencast frames"; this script cuts by wall-clock marks taken around the same log lines.
//   TPP_BASE=http://127.0.0.1:5218 TPP_EVIDENCE=<EV>/b16 TPP_WORK=WORK-035-2 TPP_MILESTONE=MILESTONE-011 node tests/view/capture/work-035-2.mjs
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { sha, launch, boot, waitScene, lines, until, encode, startStreamRecording, writeJson, errorsSummary, setDebug, debugClick, waitLine } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const loops = join(EV, 'loops');
const save = readFileSync('tests/view/capture/site-unlocked.real.json', 'utf8');
const browser = await launch();
const rows = [];
for (const height of [1080, 823]) {
  const w = await boot(browser, { height, save, query: '' }), { page } = w;
  await waitScene(page, 'Street', 1200);
  const dir = join(EV, 'frames-035-2', `b16-${height}`);
  const rec = await startStreamRecording(page, dir, { maxWidth: 1920, maxHeight: height, quality: 70 });
  const wallStart = Date.now();
  await debugClick(page, 'Fill garden');
  await setDebug(page, false);
  const started = await until(page, () => window.__tpp.log.lines().some(l => l.type === 'space.arrivalStarted'), null, 3000).catch(() => null);
  if (!started) await page.getByRole('button', { name: /done/i }).first().click().catch(() => null);
  await waitLine(page, 'space.arrivalStarted', {}, 10000);
  await waitLine(page, 'pet.arrived', {}, 20000);
  await page.waitForTimeout(800);
  const wallEnd = Date.now();
  const frames = await rec.stop();
  const log = await lines(page, 'space.arrivalStarted', 'pet.arrived');
  const startLine = log.find(l => l.type === 'space.arrivalStarted'), endLine = log.find(l => l.type === 'pet.arrived');
  const loop = encode(loops, `b16-mate-arrival-${height}`, frames.filter(f => f.t >= wallStart - 300 && f.t <= wallEnd),
    { viewport: { width: 1920, height }, seededSave: 'site-unlocked.real.json', note: 'Fill garden -> B16 arrival walk -> pet.arrived (re-recorded, A1)' }, { maxMs: 12000 });
  rows.push({ height, walkMs: startLine && endLine ? endLine.t - startLine.t : null, frames: frames.length, loop: loop.outputs ?? loop.gap,
    errors: errorsSummary(w.errors, await lines(page)), pass: !!(startLine && endLine && loop.outputs) });
  rmSync(dir, { recursive: true, force: true });
  await w.context.close();
}
await browser.close();
writeJson(join(EV, 'captures-work-035-2.json'), { sha, b16: rows });
console.log(JSON.stringify(rows.map(r => [r.height, r.walkMs, r.frames, r.pass]), null, 1));
process.exit(rows.every(r => r.pass) ? 0 : 1);

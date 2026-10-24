// WORK-020-2 celebration loops, stills and the timing report (Playwright library, pinned chromium-1243 by executablePath; no install).
//   node tests/view/capture/work-020-2.mjs <evidence dir holding the *.real.json saves>
//   (dev server on 5197 with ?lenient=1; TPP_BASE / TPP_EVIDENCE / TPP_SHA override)
// Loops: CDP Page.startScreencast JPEG frames -> system ffmpeg -> H.264 MP4 + palette GIF (≤ 480 px). Timed runs take no screenshots
// (a page.screenshot stalls the game loop); stills come from separate, untimed runs of the same seed.
// Every number in celebration-timing.json is read from window.__tpp: log t stamps, the Street's CelebrationDirector (plan, timeline),
// and per-frame poststep samples (camera midPoint/zoom, house texture, dust frame). No popups exist in this lane (WORK-020-3):
// after cutsceneFinished the script drives collectRewards / closeReveal through window.__tpp.store, and the sidecars say so.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5197';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const sha = process.env.TPP_SHA ?? execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const lane = join(evidence, 'WORK-020-2'), captures = join(lane, 'captures'), loops = join(lane, 'loops'), tmpRoot = join(lane, 'tmp');
for (const dir of [captures, loops]) mkdirSync(dir, { recursive: true });
const saves = process.argv[2] ?? lane;
const save = name => readFileSync(join(saves, `${name}.real.json`), 'utf8');
const only = (process.env.TPP_ONLY ?? '').split(',').filter(Boolean);
const ffVersion = execFileSync(ffmpeg, ['-version']).toString().split('\n')[0];
const RECORDS = ['input.tap', 'action.rejected', 'phase.reached', 'celebration.started', 'celebration.stepped', 'celebration.ended', 'rewards.collected',
  'project.completed', 'arrival.started', 'scene.changed', 'debug.applied', 'asset.loadError', 'app.error'];
const PLANNED = { 'ack1-to4': 6660, '0to1': 2920, '0to1-leftover': 3320, completion: 4620 };

let browser;
async function boot(height, save, query = '', beforeGoto = null) {
  const context = await browser.newContext({ viewport: { width: 1920, height }, deviceScaleFactor: 1 });
  await context.addInitScript(text => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear(); localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1');
  }, save);
  const page = await context.newPage(), errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e)));
  if (beforeGoto) await beforeGoto(page);
  await page.goto(`${base}/?lenient=1${query}`);
  return { context, page, errors };
}
async function waitScene(page, key) {
  await page.waitForFunction(key => window.__tpp && window.__tpp.game.scene.isActive(key), key, { timeout: 30000 });
  await page.waitForTimeout(700);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
}
async function startRecording(page) {
  const cdp = await page.context().newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => { frames.push({ data, t: metadata.timestamp * 1000 }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });
  return { stop: async () => { await cdp.send('Page.stopScreencast'); await cdp.detach().catch(() => {}); return frames; } };
}
/** MP4 (libx264 yuv420p +faststart, ≤ 12 s) and a ≤ 480 px wide GIF of the crop at 12 fps; a failed encode leaves ≤ 24 frames as a recorded gap. */
function encode(name, frames, crop, meta) {
  const tmp = join(tmpRoot, name); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const t0 = frames[0].t, kept = frames.filter(f => f.t - t0 <= 14000);
  let list = '';
  kept.forEach((f, i) => { const file = join(tmp, `f${String(i).padStart(5, '0')}.jpg`); writeFileSync(file, Buffer.from(f.data, 'base64'));
    list += `file '${file}'\nduration ${((i + 1 < kept.length ? kept[i + 1].t - f.t : 100) / 1000).toFixed(6)}\n`; });
  list += `file '${join(tmp, `f${String(kept.length - 1).padStart(5, '0')}.jpg`)}'\n`; writeFileSync(join(tmp, 'list.txt'), list);
  const durationMs = Math.round(kept.at(-1).t - t0), sourceFps = Math.round(kept.length / (durationMs / 1000) * 10) / 10;
  const sidecar = { kind: 'loop', milestone: 'MILESTONE-005', work: 'WORK-020-2', point: name, captured_at: new Date().toISOString(), sha, frames: kept.length, durationMs,
    fps: sourceFps, sourceFps, encodedFps: { mp4: 30, gif: 12 }, tool: 'cdp-screencast+ffmpeg', ffmpeg: ffVersion, binary: executablePath, chromiumVersion: browser.version(), firstFrameWall: Math.round(t0), ...meta, gifCrop: crop };
  try {
    const input = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')];
    execFileSync(ffmpeg, [...input, '-vf', 'fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(loops, `${name}.mp4`)]);
    execFileSync(ffmpeg, [...input, '-vf', `fps=12,crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale='min(480,iw)':-2,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer`, '-loop', '0', join(loops, `${name}.gif`)]);
    sidecar.outputs = { mp4: join(loops, `${name}.mp4`), mp4Bytes: statSync(join(loops, `${name}.mp4`)).size, gif: join(loops, `${name}.gif`), gifBytes: statSync(join(loops, `${name}.gif`)).size };
  } catch (error) {
    const dir = join(lane, 'frames'); mkdirSync(dir, { recursive: true });
    const step = Math.max(1, Math.floor(kept.length / 24));
    sidecar.gap = { reason: String(error).slice(0, 400), frames: kept.filter((_, i) => i % step === 0).slice(0, 24).map((f, i) => {
      const file = join(dir, `${name}-${String(i).padStart(3, '0')}.jpg`); writeFileSync(file, Buffer.from(f.data, 'base64')); return { file, t: Math.round(f.t - t0) }; }) };
  }
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(loops, `${name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
  return sidecar;
}


const read = page => page.evaluate(records => {
  const { store, log, game } = window.__tpp, s = store.getState();
  const street = game.scene.isActive('Street') ? game.scene.getScene('Street') : null, cam = street?.cameras.main, d = street?.director;
  const rect = game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  const toPage = (x, y) => ({ x: Math.round(rect.left + (x - (cam?.scrollX ?? 0)) * scale), y: Math.round(rect.top + (y - (cam?.scrollY ?? 0)) * scale) });
  const house = street?.houses.get('pet-house'), b = house?.getBounds();
  return {
    t: Math.round(performance.now()), scene: s.scene, celebration: s.celebration, arrival: s.arrival, project: s.projects['pet-house'],
    camera: cam ? { midPoint: { x: cam.midPoint.x, y: cam.midPoint.y }, zoom: cam.zoom, scroll: { x: cam.scrollX, y: cam.scrollY }, panRunning: cam.panEffect.isRunning, zoomRunning: cam.zoomEffect.isRunning } : null,
    house: house ? { texture: house.texture.key, phase: house.phase, bounds: { x: b.x, y: b.y, w: b.width, h: b.height, centerX: b.centerX, centerY: b.centerY },
      icon: { visible: house.icon.visible, page: toPage(house.icon.x, house.icon.y) } } : null,
    director: d ? { running: d.running, cue: d.cue, totalMs: d.plan?.totalMs ?? null, timeline: d.timeline, startedAtPerf: d.startedAtPerf,
      bar: d.bar && d.bar.active ? { x: d.bar.x, y: d.bar.y, depth: d.bar.depth, alpha: d.bar.alpha, pct: d.bar.pct, label: d.bar.label.text } : null } : null,
    popupDrawn: !!document.querySelector('.tpp-milestonePopup:not([hidden]), .tpp-revealPopup:not([hidden])'),
    lines: log.lines().filter(l => records.includes(l.type)),
  };
}, RECORDS);

function nextPng(point) {
  const taken = readdirSync(captures).filter(f => f.startsWith(`${point}-`) && f.endsWith('.png')).length;
  return join(captures, `${point}-${String(taken + 1).padStart(3, '0')}.png`);
}
async function shot(page, point, height, target, seededSave, note) {
  const png = nextPng(point);
  await page.screenshot({ path: png });
  const state = await read(page);
  const sidecar = { kind: 'still', milestone: 'MILESTONE-005', work: 'WORK-020-2', point, target, captured_at: new Date().toISOString(), sha,
    viewport: { width: 1920, height }, bytes: statSync(png).size, tool: 'playwright-library', binary: executablePath, chromiumVersion: browser.version(), seededSave, note, state };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  return { png, state };
}

/** Per-frame poststep samples of the Street: camera, house texture/x/scale, the dust poof's frame, the world bar, flash and confetti. */
const sampleFrames = page => page.addInitScript(() => {
  window.__samples = [];
  window.__perf = { started: [], finished: [] };
  const attach = () => { if (!window.__tpp?.game) return setTimeout(attach, 0);
    // performance.now() of the dispatch that starts a celebration and of each cutsceneFinished (log t has its own origin).
    const store = window.__tpp.store, dispatch = store.dispatch.bind(store);
    store.dispatch = action => { const before = store.getState().celebration; const r = dispatch(action); const after = store.getState().celebration;
      if (after && (!before || before.fromPhase !== after.fromPhase || before.projectId !== after.projectId)) window.__perf.started.push(performance.now());
      if (action.type === 'cutsceneFinished') window.__perf.finished.push(performance.now()); return r; };
    window.__tpp.game.events.on('poststep', () => {
    const { game } = window.__tpp;
    if (!game.scene.isActive('Street')) return;
    const st = game.scene.getScene('Street'), cam = st.cameras.main, house = st.houses?.get('pet-house'), d = st.director;
    const dust = st.children.list.find(c => c.texture?.key === 'world/dust-poof' && c.active);
    window.__samples.push({ t: performance.now(), transitioning: st.transitioning, mid: [Math.round(cam.midPoint.x * 10) / 10, Math.round(cam.midPoint.y * 10) / 10],
      zoom: Math.round(cam.zoom * 1000) / 1000, house: house ? [house.texture.key, Math.round(house.x * 10) / 10, Math.round(house.scaleX * 1000) / 1000] : null,
      dust: dust ? [dust.anims.currentFrame?.index ?? null, Math.round(dust.alpha * 100) / 100] : null, bar: d?.bar?.active ? [Math.round(d.bar.pct * 10) / 10, Math.round(d.bar.alpha * 100) / 100] : null,
      flash: st.children.list.some(c => c.type === 'Rectangle' && c.depth === 9000), confetti: st.children.list.some(c => c.texture?.key === 'confetti') });
  }); };
  attach();
});

/** Dust frame intervals: the ms between consecutive frame-index changes within each poof (≈ 55.6 at 18 fps ± one display frame). */
function dustIntervals(samples) {
  const runs = [];
  let run = null, prev = null;
  for (const s of samples) {
    if (!s.dust) { if (run) { runs.push(run); run = null; } prev = null; continue; }
    if (!run) run = { changes: [] };
    if (prev === null || s.dust[0] !== prev) run.changes.push({ t: s.t, frame: s.dust[0] });
    prev = s.dust[0];
  }
  if (run) runs.push(run);
  return runs.map(r => ({ frames: r.changes.map(c => c.frame), intervalsMs: r.changes.slice(1).map((c, i) => Math.round((c.t - r.changes[i].t) * 10) / 10) }));
}
/** Camera midPoint/zoom and house texture at each beat's scene-time stamp (nearest following poststep sample). */
function beatFrames(timeline, startedAtPerf, samples) {
  return timeline.map(b => { const s = samples.find(x => x.t >= startedAtPerf + b.atMs) ?? samples.at(-1);
    return { ...b, sampleT: s ? Math.round(s.t - startedAtPerf) : null, mid: s?.mid, zoom: s?.zoom, house: s?.house, bar: s?.bar }; });
}
function textureSteps(samples, startedAtPerf) {
  const steps = []; let last = null;
  for (const s of samples) if (s.house && s.house[0] !== last) { steps.push({ atMs: Math.round(s.t - startedAtPerf), texture: s.house[0] }); last = s.house[0]; }
  return steps;
}
function timing(name, planned, state, samples, extra = {}, perf = null) {
  const started = state.lines.filter(l => l.type === 'celebration.started').at(-1), stepped = state.lines.filter(l => l.type === 'celebration.stepped' && l.step === 'milestone').at(-1);
  const d = state.director, measured = started && stepped ? Math.round((stepped.t - started.t) * 10) / 10 : null;
  const fin = perf?.finished.at(-1), st = perf?.started.at(-1);
  const fromDirectorStart = fin !== undefined && d ? Math.round((fin - d.startedAtPerf) * 10) / 10 : null;
  return { run: name, planned, planTotalMs: d?.totalMs ?? null, logStartedT: started?.t ?? null, logSteppedMilestoneT: stepped?.t ?? null,
    measuredStartedToMilestoneMs: measured, directorStartPerf: d ? Math.round(d.startedAtPerf * 10) / 10 : null, measuredDirectorStartToMilestoneMs: fromDirectorStart,
    perfStartedToFinishedMs: fin !== undefined && st !== undefined ? Math.round((fin - st) * 10) / 10 : null,
    perfStartedToDirectorStartMs: st !== undefined && d ? Math.round((d.startedAtPerf - st) * 10) / 10 : null,
    cutsceneFinishedCount: state.lines.filter(l => l.type === 'celebration.stepped' && l.step === 'milestone').length,
    rejected: state.lines.filter(l => l.type === 'action.rejected'), timeline: d ? beatFrames(d.timeline, d.startedAtPerf, samples) : null,
    textureSteps: d ? textureSteps(samples, d.startedAtPerf) : null, dust: dustIntervals(samples), cue: d?.cue ?? null, ...extra };
}
async function hold(page, key, test, ms) {
  await page.keyboard.down(key);
  try { await page.waitForFunction(test, null, { timeout: ms }); } finally { await page.keyboard.up(key); }
}
const debugRow = (page, label) => page.locator('.tpp-debug-row', { hasText: label });
async function closeDebug(page) { await page.locator('.tpp-debugPanel button.tpp-close').first().click(); await page.waitForTimeout(400); }
async function simulate(page) { await debugRow(page, 'Simulate a purchase').locator('button').first().click(); await page.waitForTimeout(120); }
const tapHouse = async page => { const s = await read(page); await page.mouse.click(s.house.icon.page.x, s.house.icon.page.y, { delay: 40 }); return s; };
const waitStep = (page, step, ms = 15000) => page.waitForFunction(step => window.__tpp.store.getState().celebration?.step === step, step, { timeout: ms });
const dispatch = (page, type) => page.evaluate(type => window.__tpp.store.dispatch({ type }), type);
const samplesOf = page => page.evaluate(() => window.__samples.splice(0));
const perfOf = page => page.evaluate(() => window.__perf);
const errorsOf = (errors, state) => ({ ...errors, assetLoadErrors: state.lines.filter(l => l.type === 'asset.loadError'), appErrors: state.lines.filter(l => l.type === 'app.error') });
const CHAIN_CROP = { w: 1520, h: 960, x: 400, y: 60 };
const FULL = { w: 1920, h: 1080, x: 0, y: 0 };
const NO_POPUP = 'no milestone/reveal popup in this lane (WORK-020-3); collectRewards/closeReveal dispatched through window.__tpp.store where named';

async function tapRun(report) {
  const { context, page, errors } = await boot(1080, save('street-ack1-owed3'), '', sampleFrames);
  await waitScene(page, 'Street');
  await samplesOf(page);
  let rec = await startRecording(page);
  await page.waitForTimeout(300);
  await tapHouse(page);
  await waitStep(page, 'milestone');
  await page.waitForTimeout(400);
  let frames = await rec.stop();
  const samples = await samplesOf(page), state = await read(page);
  const t = timing('ack1-to4-tap-1080', PLANNED['ack1-to4'], state, samples, {}, await perfOf(page));
  const loop = encode('celebration-ack1-to4-tap-1080', frames, CHAIN_CROP, { target: 'tap -> pan -> bar 20→40→60→80→84 with three pops -> lv3, lv4, lv5 under the dust poof with shiver and creep -> cutsceneFinished',
    viewport: { width: 1920, height: 1080 }, seededSave: 'street-ack1-owed3.real.json', note: `${NO_POPUP}; recording stops 400 ms after celebration.stepped {milestone}`,
    measured: { plannedMs: t.planned, logStartedToMilestoneMs: t.measuredStartedToMilestoneMs }, clipTiming: { clip: 'dust', measuredMs: t.dust.map(r => r.intervalsMs) } });
  rec = await startRecording(page);
  await page.waitForTimeout(200);
  const endedPerf = await page.evaluate(() => { window.__tpp.store.dispatch({ type: 'collectRewards' }); window.__tpp.store.dispatch({ type: 'closeReveal' }); return performance.now(); });
  await page.waitForTimeout(1400);
  frames = await rec.stop();
  const back = await samplesOf(page), after = await read(page);
  const rel = s => (s ? Math.round(s.t - endedPerf) : null);
  const panBack = { celebrationEndedLogT: after.lines.filter(l => l.type === 'celebration.ended').at(-1)?.t ?? null, endedPerf: Math.round(endedPerf),
    firstMoveAtMs: rel(back.find(x => x.t > endedPerf && (Math.abs(x.mid[0] - 1500) > 0.5))), midSettledAtMs: rel(back.find(x => x.t > endedPerf && Math.abs(x.mid[0] - 960) < 0.5 && Math.abs(x.mid[1] - 540) < 0.5)),
    barGoneAtMs: rel(back.find(x => x.t > endedPerf && !x.bar)), midAtEnd: back.at(-1)?.mid, zoomAtEnd: back.at(-1)?.zoom };
  const loop2 = encode('pan-back-1080', frames, FULL, { target: 'celebration.ended -> pan(960, 540, 500) and the world bar fades out 200', viewport: { width: 1920, height: 1080 },
    seededSave: 'continues the celebration-ack1-to4-tap-1080 session', note: `${NO_POPUP}: collectRewards then closeReveal at +200 ms`, measured: panBack });
  report.runs.push({ ...t, panBack, errors: errorsOf(errors, after), loops: [loop.outputs ?? loop.gap, loop2.outputs ?? loop2.gap] });
  await context.close();
}

async function hookRun(report) {
  const { context, page, errors } = await boot(1080, save('save-v1-at-door'), '', sampleFrames);
  await waitScene(page, 'Interior');
  const rec = await startRecording(page);
  await hold(page, 'KeyW', () => window.__tpp.store.getState().scene.kind === 'street', 8000);
  await waitStep(page, 'milestone');
  await page.waitForTimeout(400);
  const frames = await rec.stop();
  const samples = await samplesOf(page), state = await read(page);
  const fadeIn = samples.find(s => s.transitioning === false)?.t ?? null;
  const t = timing('save-v1-hook-1080', PLANNED['ack1-to4'], state, samples, { streetFirstSampleT: samples[0]?.t ?? null, streetFadeInCompleteSampleT: fadeIn,
    panBeforeFadeIn: samples.some(s => s.transitioning && (Math.abs(s.mid[0] - 960) > 0.5 || Math.abs(s.mid[1] - 540) > 0.5)),
    hookNote: 'celebration.started is published in the Interior door tick; the director starts at the Street FADE_IN_COMPLETE (perfStartedToDirectorStartMs = the fade wait); measuredDirectorStartToMilestoneMs is the row (6660 ± 100)' }, await perfOf(page));
  t.hookWaitMs = t.perfStartedToDirectorStartMs;
  const loop = encode('celebration-save-v1-hook-1080', frames, FULL, { target: 'dog-room door -> fade -> street fade-in, then (not before) the pan and the chain -> cutsceneFinished',
    viewport: { width: 1920, height: 1080 }, seededSave: 'save-v1-at-door.real.json', note: `KeyW held until scene.kind = street; ${NO_POPUP}`,
    measured: { plannedMs: t.planned, directorStartToMilestoneMs: t.measuredDirectorStartToMilestoneMs, hookWaitMs: t.hookWaitMs }, clipTiming: { clip: 'dust', measuredMs: t.dust.map(r => r.intervalsMs) } });
  report.runs.push({ ...t, errors: errorsOf(errors, state), loops: [loop.outputs ?? loop.gap] });
  await context.close();
}

async function phase1Run(report) {
  const { context, page, errors } = await boot(1080, save('street-near-phase1'), '', sampleFrames);
  await waitScene(page, 'Street');
  await page.click('.tpp-hudStreet .tpp-debug-entry'); await page.waitForTimeout(400);
  let clicks = 0;
  while (clicks < 40 && !(await read(page)).lines.some(l => l.type === 'phase.reached')) { await simulate(page); clicks++; }
  await closeDebug(page);
  await samplesOf(page);
  const rec = await startRecording(page);
  await page.waitForTimeout(300);
  await tapHouse(page);
  await waitStep(page, 'milestone');
  await page.waitForTimeout(400);
  const frames = await rec.stop();
  const samples = await samplesOf(page), state = await read(page);
  const leftover = state.director?.cue && state.director.cue.pctEnd > 20;
  const t = timing('0to1-1080', PLANNED[leftover ? '0to1-leftover' : '0to1'], state, samples, { simulateClicks: clicks, currentCents: state.project.currentCents }, await perfOf(page));
  const loop = encode('celebration-0to1-1080', frames, CHAIN_CROP, { target: 'bar 0 → 20 % (→ pctEnd when > 20), one pop, lv1 → lv2 under dust, single-stage hold -> cutsceneFinished',
    viewport: { width: 1920, height: 1080 }, seededSave: 'street-near-phase1.real.json + debug "Simulate a purchase" until phase.reached {phase:1}', note: NO_POPUP,
    measured: { plannedMs: t.planned, logStartedToMilestoneMs: t.measuredStartedToMilestoneMs }, clipTiming: { clip: 'dust', measuredMs: t.dust.map(r => r.intervalsMs) } });
  report.runs.push({ ...t, errors: errorsOf(errors, state), loops: [loop.outputs ?? loop.gap] });
  await context.close();
}

async function completionRun(report) {
  const { context, page, errors } = await boot(1080, save('street-ack4-complete'), '', sampleFrames);
  await waitScene(page, 'Street');
  await samplesOf(page);
  const rec = await startRecording(page);
  await page.waitForTimeout(300);
  await tapHouse(page);
  await waitStep(page, 'milestone');
  await page.waitForTimeout(600);
  const frames = await rec.stop();
  const samples = await samplesOf(page), state = await read(page);
  const flashAt = samples.find(s => s.flash)?.t, confettiAt = samples.find(s => s.confetti)?.t;
  const t = timing('completion-1080', PLANNED.completion, state, samples, { flashAndConfettiSameFrame: flashAt !== undefined && flashAt === confettiAt,
    flashFrames: samples.filter(s => s.flash).length, nonGating: 'VERIFY-PRES-007 is WORK-023\'s; built and captured here, not accepted' }, await perfOf(page));
  const loop = encode('celebration-completion-1080', frames, FULL, { target: 'cascade of five pops, lv5 → lv6 under dust, bloom, confetti and flash together, 1750 hold -> cutsceneFinished (non-gating)',
    viewport: { width: 1920, height: 1080 }, seededSave: 'street-ack4-complete.real.json', note: `${NO_POPUP}; last step of the session (arrival stays set after closeReveal until WORK-020-3)`,
    measured: { plannedMs: t.planned, logStartedToMilestoneMs: t.measuredStartedToMilestoneMs }, clipTiming: { clip: 'dust', measuredMs: t.dust.map(r => r.intervalsMs) } });
  report.runs.push({ ...t, errors: errorsOf(errors, state), loops: [loop.outputs ?? loop.gap] });
  await context.close();
}

const waitBeat = (page, beat, offsetMs = 0) => page.waitForFunction(([beat, offsetMs]) => {
  const d = window.__tpp.game.scene.getScene('Street').director, b = d?.timeline.find(x => x.beat === beat);
  return b && performance.now() - d.startedAtPerf >= b.atMs + offsetMs;
}, [beat, offsetMs], { timeout: 15000 });

async function stills(report) {
  let { context, page, errors } = await boot(1080, save('street-ack1-owed3'));
  await waitScene(page, 'Street');
  await tapHouse(page);
  await waitBeat(page, 'fill', 250);
  const bar = await shot(page, 'cutscene-world-bar-1080', 1080, 'world bar mid-fill above the framed Pet House', 'street-ack1-owed3.real.json', 'untimed still run (a screenshot stalls the loop)');
  await waitBeat(page, 'dust', 120);
  const dust = await shot(page, 'cutscene-dust-swap-1080', 1080, 'dust poof covering the Pet House at the first swap', 'street-ack1-owed3.real.json', 'untimed still run');
  report.stills.push({ point: 'cutscene-world-bar-1080', png: bar.png, director: bar.state.director?.bar }, { point: 'cutscene-dust-swap-1080', png: dust.png, house: dust.state.house?.texture });
  await context.close();
  ({ context, page, errors } = await boot(1080, save('street-ack4-complete')));
  await waitScene(page, 'Street');
  await tapHouse(page);
  await waitBeat(page, 'confetti', 60);
  const done = await shot(page, 'completion-confetti-1080', 1080, 'confetti burst and flash over the lv6 Pet House (non-gating; WORK-023 accepts)', 'street-ack4-complete.real.json', 'untimed still run');
  report.stills.push({ point: 'completion-confetti-1080', png: done.png, house: done.state.house?.texture, errors });
  await context.close();
}

async function replays(report) {
  for (const [name, height] of [['save-v1.milestone', 1080], ['save-v1.milestone', 823], ['save-v1.reveal', 1080]]) {
    const { context, page, errors } = await boot(height, save(name));
    await waitScene(page, 'Street');
    await page.waitForTimeout(600);
    const point = `replay-${name.split('.')[1]}-${height}`;
    const s = await shot(page, point, height, 'replay snap: framed on the Pet House, lv5, world bar 84 %', `${name}.real.json`, 'no popup drawn yet (WORK-020-3)');
    const st = s.state;
    report.replays.push({ point, png: s.png, step: st.celebration?.step, camera: st.camera, houseTexture: st.house?.texture, houseCentre: st.house && [st.house.bounds.centerX, st.house.bounds.centerY],
      bar: st.director?.bar, running: st.director?.running, popupDrawn: st.popupDrawn,
      dispatched: st.lines.filter(l => l.type === 'celebration.stepped' || l.type === 'action.rejected'), errors: errorsOf(errors, st) });
    await context.close();
  }
}

const report = { work: 'WORK-020-2', sha, captured_at: new Date().toISOString(), base, chromium: null, runs: [], stills: [], replays: [],
  intervalOfRecord: 'log t of celebration.started -> celebration.stepped {step:milestone} (convention 3); the director timeline is view-only' };
browser = await chromium.launch({ headless: true, executablePath });
report.chromium = browser.version();
const units = { tap: tapRun, hook: hookRun, phase1: phase1Run, completion: completionRun, stills, replays };
try {
  for (const [key, fn] of Object.entries(units)) if (!only.length || only.includes(key)) {
    try { await fn(report); } catch (error) { report[`${key}Error`] = String(error).slice(0, 600); }
  }
} finally { await browser.close(); }
const out = join(lane, only.length ? `celebration-timing-${only.join('-')}.json` : 'celebration-timing.json');
writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
console.log(out);

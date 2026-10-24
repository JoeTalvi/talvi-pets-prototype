// WORK-020-1 street stills, loops and state reads (Playwright library, pinned chromium-1243 by executablePath; no install).
//   node tests/view/capture/work-020-1.mjs <street-ack1-owed3.real.json> <street-near-phase1.real.json> <dog-room-intro-done.real.json>
//   (dev server on 5197 with ?lenient=1; TPP_BASE / TPP_EVIDENCE / TPP_SHA override)
// Loops: CDP Page.startScreencast JPEG frames with their timestamps -> system ffmpeg -> H.264 MP4 (full frame) + palette GIF (≤ 480 px crop).
// Every fact in street-report.json is read from window.__tpp (log lines, store state, the Street's sprites, the HUD DOM); nothing is assumed.
// No CelebrationDirector or popups exist in this lane (WORK-020-2/-3): after the house tap the script drives
// cutsceneFinished -> collectRewards -> closeReveal through window.__tpp.store, and the sidecars say so.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5197';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const sha = process.env.TPP_SHA ?? execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const lane = join(evidence, 'WORK-020-1'), captures = join(lane, 'captures'), loops = join(lane, 'loops'), tmpRoot = join(lane, 'tmp');
for (const dir of [captures, loops]) mkdirSync(dir, { recursive: true });
const [ackPath, nearPath, introPath] = process.argv.slice(2);
// TPP_FIX1=1: only the 1080 attention session, ending in hud-bar-nudge-fix1 (no stills rewritten) and street-report-fix1.json.
const fix1 = process.env.TPP_FIX1 === '1';
const ackSave = readFileSync(ackPath, 'utf8'), nearSave = readFileSync(nearPath, 'utf8'), introDone = readFileSync(introPath, 'utf8');
const ffVersion = execFileSync(ffmpeg, ['-version']).toString().split('\n')[0];
const RECORDS = ['input.tap', 'input.drag', 'action.rejected', 'roundup.fired', 'phase.reached', 'celebration.started', 'celebration.stepped', 'celebration.ended',
  'rewards.collected', 'ui.revealPanel', 'ui.debugPanel', 'scene.changed', 'debug.applied', 'asset.loadError', 'app.error'];

/** The dog-room save with the avatar inside the walk area just below the `to-street` door rect (662, 551, 63, 53), facing up. */
function doorSave() {
  const save = JSON.parse(introDone);
  save.state.avatar = { ...save.state.avatar, x: 700, y: 625, facing: 'up', immunityMs: 0, facingCandidate: null };
  writeFileSync(join(lane, 'door-interior-to-street.edited.json'), `${JSON.stringify(save, null, 2)}\n`);
  return JSON.stringify(save);
}

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
const read = page => page.evaluate(records => {
  const { store, log, game } = window.__tpp, s = store.getState();
  const street = game.scene.isActive('Street') ? game.scene.getScene('Street') : null, cam = street?.cameras.main;
  const rect = game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  const toPage = (x, y) => ({ x: Math.round(rect.left + (x - (cam?.scrollX ?? 0)) * scale), y: Math.round(rect.top + (y - (cam?.scrollY ?? 0)) * scale) });
  const hud = document.querySelector('.tpp-hudStreet');
  const houses = street ? [...street.houses.values()].map(h => {
    const b = h.getBounds();
    return { projectId: h.projectId, texture: h.texture.key, phase: h.phase, x: h.x, y: h.y, depth: h.depth, bounds: { x: b.x, y: b.y, w: b.width, h: b.height },
      icon: { visible: h.icon.visible, x: h.icon.x, y: h.icon.y, depth: h.icon.depth, page: toPage(h.icon.x, h.icon.y) } };
  }) : null;
  const bounds = cam?.getBounds();
  return {
    t: Math.round(performance.now()), scene: s.scene, avatar: s.avatar, celebration: s.celebration, dialogueOpen: s.dialogue.current !== null, arrival: s.arrival,
    project: s.projects['pet-house'], session: { feedPresentation: s.session.feedPresentation, eventIntervalMs: s.session.eventIntervalMs },
    street: street ? { tiles: street.tiles.length, tileTextures: [...new Set(street.tiles.map(t => t.texture.key))], bounds: { x: bounds.x, y: bounds.y, w: bounds.width, h: bounds.height },
      scroll: { x: cam.scrollX, y: cam.scrollY }, houses, props: street.children.list.filter(c => c.type === 'Image' && String(c.texture.key).startsWith('world/') && c.depth >= 0).map(c => ({ texture: c.texture.key, x: c.x, y: c.y, depth: c.depth })) } : null,
    hud: hud ? { hidden: hud.hidden, frozen: hud.classList.contains('frozen'), style: hud.getAttribute('style'), barCents: hud.dataset.barCents ?? null, barMs: hud.dataset.barMs ?? null,
      label: hud.querySelector('.tpp-project-label')?.textContent, widths: [...hud.querySelectorAll('.tpp-chunks b')].map(b => b.style.width),
      computedWidths: [...hud.querySelectorAll('.tpp-chunks b')].map(b => Math.round(b.getBoundingClientRect().width)),
      moreHomesHidden: hud.querySelector('.tpp-more-homes')?.hidden ?? null, revealHidden: hud.querySelector('.tpp-reveal-link')?.hidden ?? null,
      revealDisabled: hud.querySelector('.tpp-reveal-link')?.disabled ?? null } : null,
    debugOpen: window.__tpp.context.debugOpen,
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
  const sidecar = { kind: 'still', milestone: 'MILESTONE-005', work: 'WORK-020-1', point, target, captured_at: new Date().toISOString(), sha,
    viewport: { width: 1920, height }, bytes: statSync(png).size, tool: 'playwright-library', binary: executablePath, chromiumVersion: browser.version(), seededSave, note,
    state: { scene: state.scene, project: state.project, celebration: state.celebration, street: state.street, hud: state.hud, debugOpen: state.debugOpen } };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  return { png, state };
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
  const t0 = frames[0].t, kept = frames.filter(f => f.t - t0 <= 12000);
  let list = '';
  kept.forEach((f, i) => { const file = join(tmp, `f${String(i).padStart(5, '0')}.jpg`); writeFileSync(file, Buffer.from(f.data, 'base64'));
    list += `file '${file}'\nduration ${((i + 1 < kept.length ? kept[i + 1].t - f.t : 100) / 1000).toFixed(6)}\n`; });
  list += `file '${join(tmp, `f${String(kept.length - 1).padStart(5, '0')}.jpg`)}'\n`; writeFileSync(join(tmp, 'list.txt'), list);
  const durationMs = Math.round(kept.at(-1).t - t0), sourceFps = Math.round(kept.length / (durationMs / 1000) * 10) / 10;
  const sidecar = { kind: 'loop', milestone: 'MILESTONE-005', work: 'WORK-020-1', point: name, captured_at: new Date().toISOString(), sha, frames: kept.length, durationMs,
    fps: sourceFps, sourceFps, encodedFps: { mp4: 30, gif: 12 }, tool: 'cdp-screencast+ffmpeg', ffmpeg: ffVersion, binary: executablePath, chromiumVersion: browser.version(), firstFrameWall: Math.round(t0), ...meta, gifCrop: crop };
  try {
    const input = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')];
    execFileSync(ffmpeg, [...input, '-vf', 'fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(loops, `${name}.mp4`)]);
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

/** Per-frame page samples (poststep): active scene, camera fade, avatar (state and sprite), stamped in page time. */
const sampleFrames = page => page.addInitScript(() => {
  window.__samples = [];
  const attach = () => { if (!window.__tpp?.game) return setTimeout(attach, 0); window.__tpp.game.events.on('poststep', () => {
    const { store, game } = window.__tpp, s = store.getState(), key = ['Street', 'Interior'].find(k => game.scene.isActive(k)) ?? null;
    const scene = key ? game.scene.getScene(key) : null, cam = scene?.cameras.main;
    window.__samples.push({ t: Math.round(performance.now()), active: key, transitioning: scene?.transitioning ?? null, fadeRunning: cam ? cam.fadeEffect.isRunning : null,
      fadeDirection: cam ? cam.fadeEffect.direction : null, fadeAlpha: cam ? Math.round(cam.fadeEffect.alpha * 100) / 100 : null, sceneState: s.scene.kind,
      avatar: { x: Math.round(s.avatar.x * 10) / 10, y: Math.round(s.avatar.y * 10) / 10 }, sprite: scene?.avatar ? { x: Math.round(scene.avatar.x), y: Math.round(scene.avatar.y) } : null });
  }); };
  attach();
});
/** Fade timing from the samples: first faded-out frame of the old scene, the swap, and the new scene's FADE_IN_COMPLETE (transitioning false). */
function fadeTiming(samples, from, to) {
  const outStart = samples.find(s => s.active === from && s.fadeRunning && s.fadeDirection === true);
  const swap = samples.find(s => outStart && s.t >= outStart.t && s.active === to);
  const inDone = samples.find(s => swap && s.t > swap.t && s.active === to && s.transitioning === false);
  const during = samples.filter(s => outStart && inDone && s.t >= outStart.t && s.t <= inDone.t);
  const positions = (scene) => ({ state: [...new Set(during.filter(s => s.active === scene).map(s => `${s.avatar.x},${s.avatar.y}`))],
    sprite: [...new Set(during.filter(s => s.active === scene && s.sprite).map(s => `${s.sprite.x},${s.sprite.y}`))] });
  return { fadeOutStartT: outStart?.t ?? null, swapT: swap?.t ?? null, fadeInCompleteT: inDone?.t ?? null,
    outToSwapMs: outStart && swap ? swap.t - outStart.t : null, totalMs: outStart && inDone ? inDone.t - outStart.t : null,
    avatarPositionsDuringFade: { [from]: positions(from), [to]: positions(to) } };
}
async function hold(page, key, test, ms) {
  await page.keyboard.down(key);
  try { await page.waitForFunction(test, null, { timeout: ms }); } finally { await page.keyboard.up(key); }
}

async function doors(report) {
  const { context, page, errors } = await boot(1080, doorSave(), '', sampleFrames);
  await waitScene(page, 'Interior');
  let rec = await startRecording(page);
  const t0 = Date.now();
  await hold(page, 'KeyW', () => window.__tpp.store.getState().scene.kind === 'street', 6000);
  await page.waitForFunction(() => { const s = window.__tpp.game.scene.getScene('Street'); return window.__tpp.game.scene.isActive('Street') && s.transitioning === false; }, null, { timeout: 5000 });
  await page.waitForTimeout(1200);
  let frames = await rec.stop();
  let samples = await page.evaluate(() => window.__samples);
  const toStreet = { ...fadeTiming(samples, 'Interior', 'Street'), heldMs: Date.now() - t0 };
  const afterStreet = await read(page);
  const loopA = encode('door-interior-to-street', frames, { w: 960, h: 540, x: 0, y: 270 }, { target: 'dog-room to-street door: fade-out -> swap -> fade-in onto the street', viewport: { width: 1920, height: 1080 },
    seededSave: 'door-interior-to-street.edited.json (dog-room-intro-done.real.json, avatar (700, 625) facing up)', note: 'KeyW held until scene.kind = street', measured: toStreet });
  await page.evaluate(() => { window.__samples.length = 0; });
  rec = await startRecording(page);
  await page.waitForTimeout(400);
  await hold(page, 'KeyW', () => window.__tpp.store.getState().scene.kind === 'interior', 8000);
  await page.waitForFunction(() => { const s = window.__tpp.game.scene.getScene('Interior'); return window.__tpp.game.scene.isActive('Interior') && s.transitioning === false; }, null, { timeout: 5000 });
  await page.waitForTimeout(1200);
  frames = await rec.stop();
  samples = await page.evaluate(() => window.__samples);
  const toInterior = fadeTiming(samples, 'Street', 'Interior');
  const loopB = encode('door-street-to-interior', frames, { w: 960, h: 540, x: 0, y: 270 }, { target: 'street starter-front door: fade-out -> swap -> fade-in into the dog-room', viewport: { width: 1920, height: 1080 },
    seededSave: 'continues the door-interior-to-street session', note: 'KeyW held from the arrival spawn until scene.kind = interior', measured: toInterior });
  const end = await read(page);
  report.doors = { toStreet, toInterior, afterStreet, end: { scene: end.scene, lines: end.lines.filter(l => l.type === 'scene.changed' || l.type === 'asset.loadError') },
    loops: [loopA.outputs ?? loopA.gap, loopB.outputs ?? loopB.gap], errors };
  await context.close();
}

const debugRow = (page, label) => page.locator('.tpp-debug-row', { hasText: label });
/** Once open, the debug panel's backdrop covers the street entry: the panel closes through its own close control (the second-tap toggle is the jsdom row). */
async function closeDebug(page) { await page.locator('.tpp-debugPanel button.tpp-close').first().click(); await page.waitForTimeout(400); }
async function simulate(page) { await debugRow(page, 'Simulate a purchase').locator('button').first().click(); await page.waitForTimeout(120); }

async function idle(report) {
  for (const height of [1080, 823]) {
    const { context, page, errors } = await boot(height, nearSave);
    await waitScene(page, 'Street');
    const idleShot = await shot(page, `street-idle-${height}`, height, 'Street idle: no icon, bar at $2.90, Pet House lv1 (screen 1)', 'street-near-phase1.real.json', 'ack 0, current 290');
    report[`idle${height}`] = { still: idleShot.png, state: idleShot.state, errors };
    if (height === 1080) await phaseReached(page, report);
    await context.close();
  }
}
async function phaseReached(page, report) {
  await page.click('.tpp-hudStreet .tpp-debug-entry');
  await page.waitForTimeout(400);
  const open = await shot(page, 'street-debug-open-1080', 1080, 'debug panel opened through the street entry', 'street-near-phase1.real.json', 'one tap on the invisible street entry');
  const iconBefore = open.state.street.houses.find(h => h.projectId === 'pet-house').icon.visible;
  let clicks = 0;
  while (clicks < 40 && !(await read(page)).lines.some(l => l.type === 'phase.reached')) { await simulate(page); clicks++; }
  await closeDebug(page);
  const reached = await shot(page, 'street-phase1-reached-1080', 1080, 'phase 1 reached on the street: icon visible, house still lv1, bar ≥ $3.00 (screen 2)', 'street-near-phase1.real.json', `${clicks} "Simulate a purchase" clicks; debug panel closed through its close button`);
  report.phaseReached = { clicks, iconBefore, iconAfter: reached.state.street.houses.find(h => h.projectId === 'pet-house').icon.visible, debugOpenShot: open.png, still: reached.png,
    debugLines: reached.state.lines.filter(l => l.type === 'ui.debugPanel'), phaseLines: reached.state.lines.filter(l => l.type === 'phase.reached'),
    celebration: reached.state.celebration, house: reached.state.street.houses.find(h => h.projectId === 'pet-house') };
}

async function preview(report) {
  const { context, page, errors } = await boot(1080, nearSave, '&preview=geometry');
  await waitScene(page, 'Street');
  const s = await shot(page, 'street-preview-geometry-1080', 1080, '?preview=geometry over the real street', 'street-near-phase1.real.json', 'TOOL-002 street geometry layer at depth 10000');
  report.previewGeometry = { still: s.png, errors };
  await context.close();
}

/** Page-side bar sampler: the summed drawn chunk width each animation frame, and the page time of each roundup.fired. */
const sampleBar = page => page.evaluate(() => {
  window.__bar = []; window.__roundups = [];
  if (!window.__roundupSub) window.__roundupSub = window.__tpp.store.subscribe('roundup.fired', e => window.__roundups.push({ t: performance.now(), currentCents: e.currentCents }));
  const tick = () => { const w = [...document.querySelectorAll('.tpp-hudStreet .tpp-chunks b')].reduce((a, b) => a + b.getBoundingClientRect().width, 0);
    window.__bar.push({ t: performance.now(), w: Math.round(w * 10) / 10 }); window.__barRaf = requestAnimationFrame(tick); };
  tick();
});
/** Per round-up: ms from the event until the summed width stops changing (the measured fill duration). */
async function barDurations(page) {
  const { bar, roundups } = await page.evaluate(() => { cancelAnimationFrame(window.__barRaf); return { bar: window.__bar, roundups: window.__roundups }; });
  return roundups.map((r, i) => {
    const next = roundups[i + 1]?.t ?? Infinity, span = bar.filter(s => s.t >= r.t && s.t < next);
    const changes = span.filter((s, j) => j > 0 && s.w !== span[j - 1].w);
    return { currentCents: r.currentCents, t: Math.round(r.t), measuredFillMs: changes.length ? Math.round(changes.at(-1).t - r.t) : 0, widthFrom: span[0]?.w ?? null, widthTo: span.at(-1)?.w ?? null };
  });
}

async function attention(report) {
  for (const height of fix1 ? [1080] : [823, 1080]) {
    const { context, page, errors } = await boot(height, ackSave);
    await waitScene(page, 'Street');
    // The fix-1 run keeps the TASK-137 stills: it reads state without writing a PNG.
    const a = fix1 ? { png: null, state: await read(page) } : await shot(page, `street-attention-${height}`, height, 'ack 1, owed 3: house lv2, "$12.60 / $15.00", attention icon at (1500, 300) (screen 2)', 'street-ack1-owed3.real.json', 'no celebration');
    report[`attention${height}`] = { still: a.png, state: a.state, errors };
    if (height === 1080) await tapAndBar(page, a.state, report);
    else await context.close();
    if (height === 1080) { report.attention1080.errors = errors; await context.close(); }
  }
}
async function tapAndBar(page, before, report) {
  const icon = before.street.houses.find(h => h.projectId === 'pet-house').icon;
  await page.mouse.click(icon.page.x, icon.page.y, { delay: 40 });
  await page.waitForTimeout(300);
  const tapped = await read(page);
  const ends = [];
  for (const type of ['cutsceneFinished', 'collectRewards', 'closeReveal']) {
    await page.evaluate(type => window.__tpp.store.dispatch({ type }), type);
    ends.push({ type, celebration: (await read(page)).celebration?.step ?? null });
  }
  const drained = await page.evaluate(() => { let n = 0; while (window.__tpp.store.getState().dialogue.current && n < 20) { window.__tpp.store.dispatch({ type: 'advanceDialogue' }); n++; } return n; });
  await page.waitForTimeout(300);
  const after = await read(page);
  report.attentionTap = { iconPage: icon.page, iconBefore: icon.visible, tapLines: tapped.lines.filter(l => ['input.tap', 'action.rejected', 'celebration.started'].includes(l.type)),
    frozenAfterTap: tapped.hud.frozen, hudStyleAfterTap: tapped.hud.style, iconAfterTap: tapped.street.houses.find(h => h.projectId === 'pet-house').icon.visible,
    drivenThroughStore: ends, dialogueAdvancesDrained: drained, frozenAfterEnd: after.hud.frozen, endLines: after.lines.filter(l => l.type === 'celebration.ended' || l.type === 'celebration.stepped'),
    houseAfter: after.street.houses.find(h => h.projectId === 'pet-house'), note: 'no CelebrationDirector/popups in this lane: cutsceneFinished, collectRewards, closeReveal dispatched through window.__tpp.store' };
  if (fix1) return nudgeLoopFix1(page, report);
  await nudgeLoop(page, report);
  await glideLoop(page, report);
}
const HUD_CROP = { w: 660, h: 104, x: 0, y: 0 };
async function nudgeLoop(page, report) {
  await page.click('.tpp-hudStreet .tpp-debug-entry'); await page.waitForTimeout(400);
  await sampleBar(page);
  const rec = await startRecording(page);
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) { await simulate(page); await page.waitForTimeout(1500); }
  await page.waitForTimeout(1500);
  const frames = await rec.stop(), durations = await barDurations(page), state = await read(page);
  const loop = encode('hud-bar-nudge', frames, HUD_CROP, { target: 'three events-arm nudges of the street HUD bar (300 ms each)', viewport: { width: 1920, height: 1080 },
    seededSave: 'street-ack1-owed3.real.json after the celebration driven through the store', note: 'debug panel open (Simulate a purchase ×3, ≈ 1 s apart); GIF crops the HUD bar', roundups: durations, hud: state.hud });
  report.nudge = { durations, hud: state.hud, loop: loop.outputs ?? loop.gap };
  await closeDebug(page);
}
/** Review WORK-020-1-1 F-2: the debug panel stays closed (purchases fire through window.__tpp.store) and the crop is measured from the whole HUD bar. */
async function nudgeLoopFix1(page, report) {
  // The ack-4 floor (1200): chunk 5 starts empty and three round-ups (1–99 ¢ each) cannot reach the 1500 goal.
  await page.evaluate(() => window.__tpp.store.dispatch({ type: 'debugSetCurrent', projectId: 'pet-house', cents: 1200 }));
  await page.waitForTimeout(500);
  const panelOpen = await page.evaluate(() => [...document.querySelectorAll('.tpp-debugPanel')].some(p => !p.hidden && p.getBoundingClientRect().width > 0));
  // The HUD strip spans the full width; the crop is the bar itself (label row + five chunks) so a ≤ 480 px GIF keeps the fill readable.
  const box = await page.evaluate(() => { const rs = ['.tpp-project-label', '.tpp-chunks'].map(q => document.querySelector(`.tpp-hudStreet ${q}`).getBoundingClientRect());
    const x = Math.min(...rs.map(r => r.left)), y = Math.min(...rs.map(r => r.top));
    return { x, y, w: Math.max(...rs.map(r => r.right)) - x, h: Math.max(...rs.map(r => r.bottom)) - y }; });
  const crop = { x: Math.max(0, Math.floor(box.x) - 8), y: Math.max(0, Math.floor(box.y) - 8) };
  Object.assign(crop, { w: Math.min(1920 - crop.x, Math.ceil(box.w) + 16) & ~1, h: Math.min(1080 - crop.y, Math.ceil(box.h) + 16) & ~1 });
  await sampleBar(page);
  const rec = await startRecording(page);
  await page.waitForTimeout(1500);
  for (let i = 0; i < 3; i++) { await page.evaluate(() => window.__tpp.store.dispatch({ type: 'debugSimulatePurchase' })); await page.waitForTimeout(1500); }
  await page.waitForTimeout(1000);
  const frames = await rec.stop(), durations = await barDurations(page), state = await read(page);
  const loop = encode('hud-bar-nudge-fix1', frames, crop, { target: 'three events-arm nudges of the street HUD bar (300 ms each), bar unobstructed', viewport: { width: 1920, height: 1080 },
    seededSave: 'street-ack1-owed3.real.json after the celebration driven through the store, then debugSetCurrent 1200', hudBox: box, debugPanelOpen: panelOpen,
    note: 'fix round 1 (review F-2): debug panel closed for the whole recording; debugSimulatePurchase ×3 (≈ 1.5 s apart) through window.__tpp.store from 1200 ¢, so the fill grows inside chunk 5; GIF crop = the label row ∪ .tpp-chunks box + 8 px', roundups: durations, hud: state.hud });
  report.nudge = { durations, hud: state.hud, debugPanelOpen: panelOpen, crop, loop: loop.outputs ?? loop.gap };
}
async function glideLoop(page, report) {
  // Back to the ack-4 floor (1200) first so two round-ups (1–99 ¢ each) cannot reach the goal during the loop.
  await page.evaluate(() => { const { store } = window.__tpp; store.dispatch({ type: 'debugSetCurrent', projectId: 'pet-house', cents: 1200 }); });
  await page.waitForTimeout(300);
  await sampleBar(page);
  const rec = await startRecording(page);
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const { store } = window.__tpp; store.dispatch({ type: 'debugSetFeedPresentation', mode: 'trickle' }); store.dispatch({ type: 'debugSetEventInterval', ms: 2000 }); });
  await page.waitForFunction(() => window.__roundups.length >= 2, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(2300);
  const frames = await rec.stop(), durations = await barDurations(page), state = await read(page);
  const loop = encode('hud-bar-glide-trickle', frames, HUD_CROP, { target: 'trickle arm: the bar glides over one 2000 ms interval per round-up, no toast', viewport: { width: 1920, height: 1080 },
    seededSave: 'continues the hud-bar-nudge session', note: 'debugSetCurrent 1200 (the ack-4 floor), then debugSetFeedPresentation trickle + debugSetEventInterval 2000 through window.__tpp.store; GIF crops the HUD bar', roundups: durations, hud: state.hud });
  report.glide = { durations, hud: state.hud, toastVisible: await page.evaluate(() => [...document.querySelectorAll('.tpp-toast')].some(t => !t.hidden)), loop: loop.outputs ?? loop.gap };
}

browser = await chromium.launch({ headless: true, executablePath });
const report = { work: 'WORK-020-1', base, sha, browser: browser.version(), captured_at: new Date().toISOString() };
try {
  const runs = fix1 ? [['attention', attention]] : [['idle', idle], ['attention', attention], ['doors', doors], ['preview', preview]];
  for (const [name, fn] of runs) {
    try { await fn(report); } catch (error) { report[`${name}Error`] = String(error).slice(0, 800); }
  }
} finally {
  await browser.close();
  rmSync(tmpRoot, { recursive: true, force: true });
  writeFileSync(join(lane, fix1 ? 'street-report-fix1.json' : 'street-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

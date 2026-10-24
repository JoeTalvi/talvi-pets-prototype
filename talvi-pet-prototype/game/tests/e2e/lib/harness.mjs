// Shared helpers for the WORK-021-2 e2e scripts (Playwright library pinned to chromium-1243 by executablePath; no install, no @playwright/test).
// Every expectation is read from window.__tpp (log lines, store state) and the DOM; a step that is not met is ok:false with what was found.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, readdirSync, statSync, rmSync, mkdtempSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

export const GAME_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5190';
export const evidenceRoot = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence/smoke';
export const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
export const ffmpeg = '/opt/homebrew/bin/ffmpeg';
export const sha = process.env.TPP_SHA ?? execFileSync('git', ['-C', GAME_DIR, 'rev-parse', '--short', 'HEAD']).toString().trim();
export const WORK = 'WORK-021-2';

export function createSteps() {
  const steps = [];
  const step = (name, ok, expected, found, extra = {}) => { steps.push({ step: name, ok: Boolean(ok), expected, found, ...extra, at: new Date().toISOString() }); return Boolean(ok); };
  return { steps, step };
}

export const launch = () => chromium.launch({ headless: true, executablePath });

/** Real-content saves through the game's own fixture tool (npx tsx tools/make-fixture.ts), into a tmp dir; no committed file changes. */
export function makeFixture(args, outDir) {
  const dir = outDir ?? mkdtempSync(join(tmpdir(), 'tpp-fixture-'));
  const name = args.includes('--scenario') ? args[args.indexOf('--scenario') + 1] : args[args.indexOf('--steps') + 1].split('/').pop().replace('.steps.json', '');
  const out = join(dir, `${name}.real.json`);
  execFileSync('npx', ['tsx', 'tools/make-fixture.ts', ...args, '--out', out], { cwd: GAME_DIR, stdio: 'pipe' });
  return { path: out, text: readFileSync(out, 'utf8') };
}

/** New context at 1920×height, fresh localStorage (optionally seeded once), console + page errors collected. */
export async function boot(browser, { height = 1080, width = 1920, save = null, query = '?lenient=1', init = null, contextOptions = {} } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, acceptDownloads: true, ...contextOptions });
  await context.addInitScript(text => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear(); if (text) localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1');
  }, save);
  if (init) await context.addInitScript(init);
  const page = await context.newPage(), errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e).slice(0, 400)));
  const target = `${base}/${query}`;
  await page.goto(target);
  return { context, page, errors, target };
}
export async function waitScene(page, key, settle = 800) {
  await page.waitForFunction(key => window.__tpp && window.__tpp.game.scene.isActive(key), key, { timeout: 30000 });
  await page.waitForTimeout(settle);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
}
export const lines = (page, ...types) => page.evaluate(types => window.__tpp.log.lines().filter(l => !types.length || types.includes(l.type)), types);
export const getState = page => page.evaluate(() => window.__tpp.store.getState());
export const count = (all, type, pred = () => true) => all.filter(l => l.type === type && pred(l)).length;
export const match = (l, m) => Object.entries(m).every(([k, v]) => JSON.stringify(l[k]) === JSON.stringify(v));
export const first = (all, type, m = {}, afterT = -Infinity) => all.find(l => l.type === type && l.t >= afterT && match(l, m)) ?? null;
export const strip = l => l && Object.fromEntries(Object.entries(l).filter(([k]) => !['script', 'action', 'state'].includes(k)));
export const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export async function until(page, fn, arg = null, ms = 10000, polling = 50) {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling }); return true; } catch { return false; }
}
export const waitLine = (page, type, m = {}, ms = 10000) => until(page, ([type, m]) => window.__tpp.log.lines()
  .some(l => l.type === type && Object.entries(m).every(([k, v]) => JSON.stringify(l[k]) === JSON.stringify(v))), [type, m], ms);

/** World point → page point for the active world scene (camera scroll + canvas scale). */
export const pagePoint = (page, x, y) => page.evaluate(([x, y]) => {
  const { game } = window.__tpp, key = game.scene.isActive('Interior') ? 'Interior' : 'Street', cam = game.scene.getScene(key).cameras.main;
  const rect = game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  return { x: rect.left + (x - cam.scrollX) * scale, y: rect.top + (y - cam.scrollY) * scale };
}, [x, y]);
export async function tapWorld(page, x, y, wait = 350) { const p = await pagePoint(page, x, y); await page.mouse.click(p.x, p.y, { delay: 40 }); await page.waitForTimeout(wait); return p; }
/** Centroid of a slot outline polygon (the tap target the earlier lanes used). */
export const slotPoint = (page, slotId) => page.evaluate(slotId => {
  const interior = window.__tpp.game.scene.getScene('Interior'), outline = interior.outlines.get(slotId);
  const pts = outline.polygon.points, c = pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
  const rect = window.__tpp.game.canvas.getBoundingClientRect(), scale = rect.width / 1920, cam = interior.cameras.main;
  return { x: rect.left + (c.x - cam.scrollX) * scale, y: rect.top + (c.y - cam.scrollY) * scale };
}, slotId);
export async function tapSlot(page, slotId, wait = 350) { const p = await slotPoint(page, slotId); await page.mouse.click(p.x, p.y, { delay: 40 }); await page.waitForTimeout(wait); return p; }

export async function holdUntil(page, keys, test, arg = null, ms = 20000) {
  keys = [].concat(keys);
  for (const k of keys) await page.keyboard.down(k);
  try { return await until(page, test, arg, ms, 16); } finally { for (const k of keys) await page.keyboard.up(k); }
}
/** Steer the avatar with WASD toward (x, y) until `done` is true in the page (or the time runs out). Real keyboard input only. */
export async function steer(page, x, y, done, ms = 20000, tol = 14) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await page.evaluate(done => ({ a: window.__tpp.store.getState().avatar, done: new Function(`return (${done})()`)() }), done.toString());
    if (s.done) return true;
    const keys = [];
    if (s.a.x < x - tol) keys.push('KeyD'); else if (s.a.x > x + tol) keys.push('KeyA');
    if (s.a.y < y - tol) keys.push('KeyS'); else if (s.a.y > y + tol) keys.push('KeyW');
    if (!keys.length) keys.push(y <= s.a.y ? 'KeyW' : 'KeyS');
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(90);
    for (const k of keys) await page.keyboard.up(k);
  }
  return false;
}

/** Debug panel helpers (rows found by their <label> text; WORK-014-3 FLAG). */
export const debugOpen = page => page.evaluate(() => { const p = document.querySelector('.tpp-debugPanel'); return !!p && !p.hidden; });
export async function setDebug(page, open) { if ((await debugOpen(page)) !== open) { await page.keyboard.press('Backquote'); await page.waitForTimeout(350); } }
export async function debugClick(page, label, buttonText = null, value = undefined) {
  await setDebug(page, true);
  const row = page.locator('.tpp-debug-row').filter({ has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) }).first();
  if (value !== undefined) await row.locator('input, select').first().fill(String(value));
  const btn = buttonText === 'switch' ? row.locator('button[role=switch]').first() : buttonText ? row.locator('button', { hasText: buttonText }).first() : row.locator('button:not([role=switch])').first();
  await btn.click(); await page.waitForTimeout(200);
}

/** Continuous CDP screencast streamed to JPEG files on disk (no frames held in memory); frames() → [{file, t}]. */
export async function startStreamRecording(page, dir, { maxWidth = 1280, maxHeight = 720, quality = 70 } = {}) {
  mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    const file = join(dir, `f${String(frames.length).padStart(6, '0')}.jpg`); writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp * 1000 }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, everyNthFrame: 1, maxWidth, maxHeight });
  return { frames: () => frames, between: (a, b) => frames.filter(f => f.t >= a && f.t <= b), stop: async () => { await cdp.send('Page.stopScreencast').catch(() => {}); await cdp.detach().catch(() => {}); return frames; } };
}
/** Joystick drag (real pointer input on the canvas): press on the base centre, move by (dx, dy) game px, hold until `test` or `ms`. */
export async function joystickHold(page, dx, dy, test, arg = null, ms = 15000) {
  const c = await page.evaluate(() => { const { game } = window.__tpp, k = game.scene.isActive('Interior') ? 'Interior' : 'Street', j = game.scene.getScene(k).joystick, r = game.canvas.getBoundingClientRect(), s = r.width / 1920;
    return { x: r.left + j.base.x * s, y: r.top + j.base.y * s, s, visible: j.base.visible }; });
  await page.mouse.move(c.x, c.y); await page.mouse.down();
  await page.mouse.move(c.x + dx * c.s, c.y + dy * c.s, { steps: 4 });
  try { return { ...c, reached: await until(page, test, arg, ms, 16) }; } finally { await page.mouse.up(); }
}

/** CDP screencast recorder (JPEG frames with timestamps). */
export async function startRecording(page, { maxWidth = 1920, maxHeight = 1080, quality = 80 } = {}) {
  const cdp = await page.context().newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => { frames.push({ data, t: metadata.timestamp * 1000 }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, everyNthFrame: 1, maxWidth, maxHeight });
  const startedWall = Date.now();
  return { startedWall, count: () => frames.length, stop: async () => { await cdp.send('Page.stopScreencast').catch(() => {}); await cdp.detach().catch(() => {}); return frames; } };
}
let ffVersion = null;
/** frames → MP4 (H.264 yuv420p, 30 fps, ≤ maxMs) [+ GIF ≤ 480 px] + sidecar; an encode failure is a recorded gap (never a placeholder). */
export function encode(loopsDir, name, frames, meta, { maxMs = 12000, crf = 26, gif = null, scale = null, fps = 30 } = {}) {
  ffVersion ??= execFileSync(ffmpeg, ['-version']).toString().split('\n')[0];
  mkdirSync(loopsDir, { recursive: true });
  const sidecar = { kind: 'loop', milestone: 'MILESTONE-005', work: WORK, point: name, sha, captured_at: new Date().toISOString(), tool: 'cdp-screencast+ffmpeg', ffmpeg: ffVersion, binary: executablePath, ...meta };
  if (!frames.length) { sidecar.gap = { reason: 'no screencast frames' }; writeFileSync(join(loopsDir, `${name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`); return sidecar; }
  const tmp = mkdtempSync(join(tmpdir(), `tpp-loop-${name}-`));
  const t0 = frames[0].t, kept = frames.filter(f => f.t - t0 <= maxMs);
  let list = '';
  const files = kept.map((f, i) => { if (f.file) return f.file; const file = join(tmp, `f${String(i).padStart(5, '0')}.jpg`); writeFileSync(file, Buffer.from(f.data, 'base64')); return file; });
  kept.forEach((f, i) => { list += `file '${files[i]}'\nduration ${((i + 1 < kept.length ? kept[i + 1].t - f.t : 100) / 1000).toFixed(6)}\n`; });
  list += `file '${files.at(-1)}'\n`; writeFileSync(join(tmp, 'list.txt'), list);
  const durationMs = Math.round(kept.at(-1).t - t0), sourceFps = Math.round(kept.length / Math.max(durationMs / 1000, 0.001) * 10) / 10;
  const deltas = kept.slice(1).map((f, i) => f.t - kept[i].t).sort((a, b) => a - b);
  Object.assign(sidecar, { frames: kept.length, framesDropped: frames.length - kept.length, durationMs, sourceFps, encodedFps: { mp4: fps, ...(gif ? { gif: 12 } : {}) },
    measuredFrameDeltaMs: deltas.length ? { median: Math.round(deltas[Math.floor(deltas.length / 2)]), max: Math.round(deltas.at(-1)) } : null, firstFrameWall: new Date(t0).toISOString() });
  try {
    const input = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')];
    const vf = `fps=${fps},${scale ? `scale=${scale},` : ''}crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p`;
    execFileSync(ffmpeg, [...input, '-vf', vf, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(crf), '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(loopsDir, `${name}.mp4`)]);
    sidecar.outputs = { mp4: join(loopsDir, `${name}.mp4`), mp4Bytes: statSync(join(loopsDir, `${name}.mp4`)).size, crf, scale: scale ?? 'source' };
    if (gif) {
      execFileSync(ffmpeg, [...input, '-vf', `fps=12,crop=${gif.w}:${gif.h}:${gif.x}:${gif.y},scale='min(480,iw)':-2,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer`, '-loop', '0', join(loopsDir, `${name}.gif`)]);
      Object.assign(sidecar.outputs, { gif: join(loopsDir, `${name}.gif`), gifBytes: statSync(join(loopsDir, `${name}.gif`)).size, gifCrop: gif });
    }
  } catch (error) { sidecar.gap = { reason: String(error).slice(0, 400) }; }
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(loopsDir, `${name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
  return sidecar;
}

/** PNG + sidecar with the next free NNN for `point` in `dir`. */
export async function shot(page, browser, dir, point, meta = {}) {
  mkdirSync(dir, { recursive: true });
  const taken = readdirSync(dir).map(f => f.match(new RegExp(`^${point.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d{3})\\.png$`))).filter(Boolean).map(m => Number(m[1]));
  const n = taken.length ? Math.max(...taken) + 1 : 1;
  const png = join(dir, `${point}-${String(n).padStart(3, '0')}.png`);
  await page.screenshot({ path: png });
  const vp = page.viewportSize();
  const sidecar = { kind: 'screenshot', milestone: 'MILESTONE-005', work: WORK, point, sequence: n, sha, captured_at: new Date().toISOString(), viewport: vp, bytes: statSync(png).size,
    tool: 'playwright-library', binary: executablePath, version: browser.version(), ...meta };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  return png;
}

/** Log export through the game's own exporter (download), falling back to lines() with the reason recorded. */
export async function exportLog(page, out) {
  try {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 8000 }), page.evaluate(() => window.__tpp.log.exportLog('download'))]);
    await download.saveAs(out);
    return { method: 'exportLog(download)', path: out, bytes: statSync(out).size };
  } catch (error) {
    const text = await page.evaluate(() => window.__tpp.log.lines().map(l => JSON.stringify(l)).join('\n'));
    writeFileSync(out, `${text}\n`);
    return { method: 'lines() fallback', reason: String(error).slice(0, 200), path: out, bytes: statSync(out).size };
  }
}

/** DOM read of the panels the trace and rows look at. */
export const domRead = page => page.evaluate(() => {
  const q = s => document.querySelector(s), vis = el => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
  const d = q('[data-panel="dialogue"]'), t = q('[data-panel="toast"]'), w = q('.tpp-wantPanel'), m = q('.tpp-milestonePopup'), r = q('.tpp-revealPopup'), hs = q('.tpp-hudStreet'), hi = q('.tpp-hudInterior');
  const slots = el => el ? [...el.querySelectorAll('.tpp-asset-slot')].map(x => x.dataset.assetId ?? '?') : [];
  return {
    dialogue: d && { visible: vis(d), source: d.dataset.source ?? null, textOnly: d.classList.contains('text-only-game'), speaker: q('[data-panel="dialogue"] .tpp-speaker')?.textContent ?? null, line: q('[data-panel="dialogue"] .tpp-dialogue-line')?.textContent ?? null },
    toast: t && { visible: vis(t), text: t.textContent.trim().replace(/\s+/g, ' ') },
    want: w && { visible: vis(w), text: w.innerText.replace(/\s+/g, ' ').trim(), dim: w.classList.contains('dim') },
    hudInterior: hi && { visible: vis(hi), text: hi.innerText.replace(/\s+/g, ' ').trim(), badge: vis(hi.querySelector('button.tpp-attention')), delta: hi.querySelector('.tpp-stars-delta')?.textContent ?? null },
    hudStreet: hs && { visible: vis(hs), text: hs.innerText.replace(/\s+/g, ' ').trim(), frozen: hs.classList.contains('frozen'), barCents: hs.dataset.barCents ?? null },
    milestone: m && { visible: vis(m), state: m.dataset.state ?? null, heading: m.querySelector('.tpp-heading')?.textContent ?? null, tiles: [...m.querySelectorAll('.tpp-reward-tile')].map(x => x.dataset.typeId),
      skip: m.querySelector('.tpp-skip') ? { hidden: m.querySelector('.tpp-skip').hidden, label: m.querySelector('.tpp-skip button')?.textContent ?? null, free: m.querySelector('.tpp-skip-free')?.textContent ?? null } : null, assetSlots: slots(m) },
    reveal: r && { visible: vis(r), title: r.querySelector('.tpp-reveal-popup-title')?.textContent ?? null, mystery: r.querySelector('.tpp-mystery-tile [data-asset-id]')?.dataset.assetId ?? null,
      cards: [...r.querySelectorAll('.tpp-clue')].filter(c => !c.hidden).map(c => ({ phase: c.querySelector('.tpp-clue-phase')?.textContent, icon: c.querySelector('[data-asset-id]')?.dataset.assetId, real: !!c.querySelector('img[data-asset-id]'), line: c.querySelector('.tpp-clue-line')?.textContent })), assetSlots: slots(r) },
    chooser: (() => { const c = q('.tpp-chooser'); return c && { visible: vis(c), cards: [...c.querySelectorAll('.tpp-charm-card')].map(x => x.dataset.typeId), empty: c.querySelector('.tpp-empty')?.textContent ?? null }; })(),
    joystickVisible: (() => { const { game } = window.__tpp; const k = game.scene.isActive('Interior') ? 'Interior' : 'Street'; return game.scene.getScene(k).joystick?.base?.visible ?? null; })(),
  };
});

export const errorsSummary = (errors, all) => ({ consoleErrors: errors.consoleErrors, pageErrors: errors.pageErrors, assetLoadErrors: all.filter(l => l.type === 'asset.loadError'), appErrors: all.filter(l => l.type === 'app.error') });
export const writeJson = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`); };

// WORK-015-1 room editor stills, drag loops and state reads (Playwright library, pinned chromium-1243 by executablePath; no install).
//   node tests/view/capture/work-015-1.mjs <dog-room-intro-done.real.json>
//   (dev server on 5198; TPP_BASE / TPP_EVIDENCE override.) Loops: CDP Page.startScreencast -> system ffmpeg -> MP4 + 480 px GIF crop.
// Every fact in editor-report.json is read from window.__tpp (state, log) and __tpp.context.roomEditor (draft); nothing is assumed.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5198';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const lane = join(evidence, 'WORK-015-1'), captures = join(lane, 'captures'), loops = join(lane, 'loops'), tmpRoot = join(lane, 'tmp');
for (const dir of [captures, loops]) mkdirSync(dir, { recursive: true });
const introDone = readFileSync(process.argv[2], 'utf8');
const ffVersion = execFileSync(ffmpeg, ['-version']).toString().split('\n')[0];
const sha = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const URL_PATH = '/?lenient=1&preview=geometry,segments';
let browser;

async function boot(height) {
  const context = await browser.newContext({ viewport: { width: 1920, height }, deviceScaleFactor: 1 });
  await context.addInitScript(text => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear(); localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1');
  }, introDone);
  const page = await context.newPage(), errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e)));
  await page.goto(`${base}${URL_PATH}`);
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Interior'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
  return { context, page, errors };
}
const read = page => page.evaluate(() => {
  const { store, log, game, context } = window.__tpp, interior = game.scene.getScene('Interior'), s = store.getState();
  const editor = context.roomEditor ?? null, draft = editor ? editor.draft() : null;
  const slot = room => { const o = room?.slots.find(x => x.id === 'floor-3'); return o ? { x: o.x, y: o.y, anchor: o.anchor } : null; };
  const lamp = interior.charms.get('floor-3');
  return {
    t: Math.round(performance.now()), scene: s.scene, mode: s.mode, editorOpen: editor?.open === true, requested: context.roomEditorRequested ?? false,
    visible: { avatar: interior.avatar.visible, pet: interior.pet?.visible ?? null, bubble: interior.bubble?.visible ?? null, joystick: interior.joystick.base.visible,
      outlines: [...interior.outlines.values()].some(o => o.visible) },
    draftFloor3: slot(draft), contentFloor3: slot(interior.room), walkAreaLength: draft?.walkArea.length ?? interior.room.walkArea.length,
    draftEqualsContent: draft ? JSON.stringify(draft) === JSON.stringify(interior.room) : null,
    historyPast: editor ? editor.history.past.length : null,
    segmentsLabel: interior.preview.layers.segments?.label() ?? null,
    floor3Charm: lamp ? { x: lamp.x, y: lamp.y, visible: lamp.visible } : null,
    avatar: { x: interior.avatar.x, y: interior.avatar.y }, simAvatar: s.avatar,
    records: log.lines().filter(l => ['ui.roomEditor', 'asset.loadError', 'app.error', 'input.tap'].includes(l.type)),
  };
});
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => {
  const interior = window.__tpp.game.scene.getScene('Interior'), rect = window.__tpp.game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  return { x: rect.left + x * scale, y: rect.top + (y - interior.cameras.main.scrollY) * scale };
}, [x, y]);
async function dragWorld(page, from, to, ms = 1800, steps = 36) {
  const a = await pagePoint(page, from.x, from.y), b = await pagePoint(page, to.x, to.y);
  await page.mouse.move(a.x, a.y); await page.waitForTimeout(150); await page.mouse.down(); await page.waitForTimeout(150);
  for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await page.waitForTimeout(ms / steps); }
  await page.waitForTimeout(150); await page.mouse.up(); await page.waitForTimeout(300);
}
async function shot(page, point, height, target, note) {
  const png = join(captures, `${point}.png`);
  await page.screenshot({ path: png });
  const state = await read(page);
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify({ milestone: 'MILESTONE-005', work: 'WORK-015-1', kind: 'screenshot', point, target, sha,
    captured_at: new Date().toISOString(), viewport: { width: 1920, height }, bytes: statSync(png).size, tool: 'playwright-library', binary: executablePath,
    version: browser.version(), url: URL_PATH, seededSave: 'dog-room-intro-done.real.json', note, state }, null, 2)}\n`);
  return png;
}
async function startRecording(page) {
  const cdp = await page.context().newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => { frames.push({ data, t: metadata.timestamp * 1000 }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });
  return { count: () => frames.length, stop: async () => { await cdp.send('Page.stopScreencast'); await cdp.detach().catch(() => {}); return frames; } };
}
/** MP4 (libx264 yuv420p +faststart, ≤ 10 s) and a ≤ 480 px crop GIF at 12 fps; a failed encode leaves ≤ 24 PNG frames as a recorded gap. */
function encode(name, frames, crop, meta) {
  const tmp = join(tmpRoot, name); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const t0 = frames[0].t, kept = frames.filter(f => f.t - t0 <= 10000);
  let list = '';
  kept.forEach((f, i) => { const file = join(tmp, `f${String(i).padStart(5, '0')}.jpg`); writeFileSync(file, Buffer.from(f.data, 'base64'));
    list += `file '${file}'\nduration ${((i + 1 < kept.length ? kept[i + 1].t - f.t : 100) / 1000).toFixed(6)}\n`; });
  list += `file '${join(tmp, `f${String(kept.length - 1).padStart(5, '0')}.jpg`)}'\n`; writeFileSync(join(tmp, 'list.txt'), list);
  const durationMs = Math.round(kept.at(-1).t - t0);
  const sidecar = { kind: 'loop', milestone: 'MILESTONE-005', work: 'WORK-015-1', point: name, captured_at: new Date().toISOString(), frames: kept.length, durationMs,
    fps: Math.round(kept.length / (durationMs / 1000) * 10) / 10, sourceFps: Math.round(kept.length / (durationMs / 1000) * 10) / 10, encodedFps: { mp4: 30, gif: 12 }, tool: 'cdp-screencast+ffmpeg', ffmpeg: ffVersion, binary: executablePath, chromiumVersion: browser.version(), ...meta,
    gifCrop: crop };
  try {
    const input = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')];
    execFileSync(ffmpeg, [...input, '-vf', 'fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(loops, `${name}.mp4`)]);
    execFileSync(ffmpeg, [...input, '-vf', `fps=12,crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer`, '-loop', '0', join(loops, `${name}.gif`)]);
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
const crop = (x, y) => ({ w: 480, h: 480, x: Math.max(0, Math.min(1440, Math.round(x - 240))), y: Math.max(0, Math.min(600, Math.round(y - 240))) });
async function loop(page, name, crop, target, act) {
  const rec = await startRecording(page), before = await read(page);
  await page.waitForTimeout(600);
  await act();
  await page.waitForTimeout(900);
  const after = await read(page);
  const sidecar = encode(name, await rec.stop(), crop, { target, sha, viewport: { width: 1920, height: 1080 }, seededSave: 'dog-room-intro-done.real.json', url: URL_PATH,
    measured: { before: { draftFloor3: before.draftFloor3, walkAreaLength: before.walkAreaLength, historyPast: before.historyPast, segmentsLabel: before.segmentsLabel },
      after: { draftFloor3: after.draftFloor3, walkAreaLength: after.walkAreaLength, historyPast: after.historyPast, segmentsLabel: after.segmentsLabel } } });
  return { before, after, loop: sidecar.outputs ?? sidecar.gap ?? null, sidecar: join(loops, `${name}.json`) };
}
async function main1080(report) {
  const { context, page, errors } = await boot(1080);
  report.atBoot = await read(page);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(500);
  report.opened = await read(page);
  report.stills = [await shot(page, 'work-015-1-editor-open-1080', 1080, 'editor open over the Dog room: handles, anchor ghosts, band guides, geometry + segments layers; avatar and Dog hidden', 'opened with E')];
  report.slotDrag = await loop(page, 'work-015-1-slot-drag', crop(860, 560), 'floor-3 base handle dragged 90 px toward floor-2; its anchor ghost follows',
    () => dragWorld(page, { x: 907, y: 618 }, { x: 817, y: 618 }));
  report.altDrag = await loop(page, 'work-015-1-anchor-alt-drag', crop(816, 560), 'Alt-drag on floor-3: the anchor alone leaves the walk area; segments turn red', async () => {
    await page.keyboard.down('Alt'); await dragWorld(page, { x: 817, y: 618 }, { x: 817, y: 439 }); await page.keyboard.up('Alt');
  });
  report.stills.push(await shot(page, 'work-015-1-anchor-outside-1080', 1080, 'after the Alt-drag: red segments to floor-3 anchor (816, 470)', 'Alt held through the mouse drag'));
  report.undo = await loop(page, 'work-015-1-undo', crop(860, 560), 'two undos (Cmd+Z) restoring the room', async () => {
    await page.keyboard.press('Meta+KeyZ'); await page.waitForTimeout(700); await page.keyboard.press('Meta+KeyZ');
  });
  report.vertexInsert = await loop(page, 'work-015-1-vertex-insert', crop(826, 500), 'edge-midpoint insert on walk edge 0 then a drag of the new vertex', async () => {
    const mid = { x: Math.round((688 + 965) / 2), y: Math.round((568 + 441) / 2) };
    const p = await pagePoint(page, mid.x, mid.y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(500);
    await dragWorld(page, mid, { x: mid.x - 40, y: mid.y - 40 });
  });
  await page.keyboard.press('Meta+KeyZ'); await page.keyboard.press('Meta+KeyZ'); await page.waitForTimeout(300);
  report.afterVertexUndo = await read(page);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(500);
  report.closed = await read(page);
  report.errors1080 = errors;
  await context.close();
}
async function still823(report) {
  const { context, page, errors } = await boot(823);
  await page.keyboard.press('KeyE'); await page.waitForTimeout(500);
  report.stills.push(await shot(page, 'work-015-1-editor-open-823', 823, 'editor open over the Dog room at 1920x823', 'opened with E'));
  report.errors823 = errors;
  await context.close();
}

browser = await chromium.launch({ headless: true, executablePath });
const report = { work: 'WORK-015-1', base, sha, browser: browser.version(), captured_at: new Date().toISOString(), stills: [] };
try {
  for (const [name, fn] of [['main1080', main1080], ['still823', still823]]) {
    try { await fn(report); } catch (error) { report[`${name}Error`] = String(error).slice(0, 600); }
  }
} finally {
  await browser.close();
  rmSync(tmpRoot, { recursive: true, force: true });
  writeFileSync(join(lane, 'editor-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

// WORK-019-2 HUD, want panel and UI-CN05 locator stills, the Stars-delta loop and hud-report.json (Playwright library,
// pinned chromium-1243 by executablePath; no install).
//   node tests/view/capture/work-019-2.mjs <dog-room-intro-done.real.json> <save-v1.real.json>
//   (dev server on 5196 with ?lenient=1; TPP_BASE / TPP_EVIDENCE override)
// Loop: CDP Page.startScreencast JPEG frames with their timestamps -> system ffmpeg -> H.264 MP4 (full frame) + palette GIF (HUD crop).
// Every fact in hud-report.json is read from window.__tpp (log lines, store state) and the DOM of #panels; nothing is assumed.
// No dialogue box is drawn in this lane (WORK-019-3); where a script is open the state read says so; drains go through __tpp.store.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5196';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const lane = join(evidence, 'WORK-019-2'), captures = join(lane, 'captures'), loops = join(lane, 'loops'), tmpRoot = join(lane, 'tmp');
for (const dir of [captures, loops]) mkdirSync(dir, { recursive: true });
const [introPath, savePath] = process.argv.slice(2);
const introDone = readFileSync(introPath, 'utf8'), saveV1 = readFileSync(savePath, 'utf8');
const ffVersion = execFileSync(ffmpeg, ['-version']).toString().split('\n')[0];
const RECORDS = ['stars.changed', 'stars.visibilityChanged', 'heart.earned', 'want.activated', 'want.progressed', 'want.fulfilled', 'wants.exhausted', 'phase.reached',
  'ui.starsExplained', 'ui.wantPanel', 'ui.chooserOpened', 'ui.chooserClosed', 'charm.placed', 'dialogue.opened', 'dialogue.closed', 'action.rejected', 'asset.loadError', 'app.error'];

let browser;
async function boot(height, save) {
  const context = await browser.newContext({ viewport: { width: 1920, height }, deviceScaleFactor: 1 });
  await context.addInitScript(text => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear(); localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1');
  }, save);
  const page = await context.newPage(), errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e)));
  await page.goto(`${base}/?lenient=1`);
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Interior'), null, { timeout: 30000 });
  await page.waitForTimeout(900);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
  return { context, page, errors };
}
/** Store state + the #panels DOM the reviewer asks about (pill classes and texts, badge, locator inline geometry). */
const read = page => page.evaluate(records => {
  const { store, log } = window.__tpp, s = store.getState(), q = sel => document.querySelector(sel);
  const want = q('.tpp-wantPanel'), loc = q('.tpp-chooser-locator'), mini = loc?.querySelector('.tpp-locator-miniature');
  return {
    t: Math.round(performance.now()), scene: s.scene, mode: s.mode, dialogueOpen: s.dialogue.current !== null, dialogueSource: s.dialogue.current?.source ?? null,
    starsVisible: s.session.starsVisible, hearts: s.pets.dog.hearts, fulfilled: s.pets.dog.fulfilledWantIds,
    hud: { label: q('.tpp-stars [data-string-key="tpp.stars.label"]')?.textContent, fill: q('.tpp-stars-track i')?.style.width, fillTransition: q('.tpp-stars-track i')?.style.transition,
      starsHidden: q('.tpp-stars')?.hidden, deltas: [...document.querySelectorAll('.tpp-stars-delta')].map(e => ({ text: e.textContent, color: e.style.color })),
      hearts: q('.tpp-hearts')?.textContent, heartsPulses: q('.tpp-hearts')?.dataset.pulses ?? null, badgeHidden: q('button.tpp-attention')?.hidden ?? null,
      tooltips: [...document.querySelectorAll('.tpp-stars-explained')].map(e => ({ cls: e.className, text: e.textContent })) },
    wantPanel: want ? { hidden: want.hidden, state: want.dataset.state, dim: want.classList.contains('dim'), title: want.querySelector('.tpp-want-title')?.textContent,
      brief: want.querySelector('.tpp-want-brief')?.textContent, pills: [...want.querySelectorAll('.tpp-tag')].map(p => ({ text: p.textContent.trim(), cls: p.className })),
      notes: [...want.querySelectorAll('.tpp-want-note')].map(n => n.textContent), reward: want.querySelector('.tpp-want-reward')?.textContent ?? null } : null,
    locator: loc ? { left: loc.style.left, width: loc.style.width, height: loc.style.height, bottom: loc.style.bottom, pointerEvents: loc.style.pointerEvents,
      heading: loc.querySelector('.tpp-locator-heading')?.textContent, backgroundImage: mini?.style.backgroundImage, backgroundSize: mini?.style.backgroundSize,
      backgroundPosition: mini?.style.backgroundPosition, polygon: mini?.querySelector('polygon')?.getAttribute('points'), rect: loc.getBoundingClientRect().toJSON() } : null,
    lines: log.lines().filter(l => records.includes(l.type)),
  };
}, RECORDS);
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => {
  const interior = window.__tpp.game.scene.getScene('Interior'), rect = window.__tpp.game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  return { x: rect.left + x * scale, y: rect.top + (y - interior.cameras.main.scrollY) * scale };
}, [x, y]);
async function tapWorld(page, x, y) { const p = await pagePoint(page, x, y); await page.mouse.click(p.x, p.y, { delay: 40 }); await page.waitForTimeout(300); }
const slotXY = (page, id) => page.evaluate(id => { const o = window.__tpp.game.scene.getScene('Interior').room.slots.find(s => s.id === id); return { x: o.x, y: o.y }; }, id);
const drain = page => page.evaluate(() => { const { store } = window.__tpp; let n = 0; while (store.getState().dialogue.current !== null && n < 60) { store.dispatch({ type: 'advanceDialogue' }); n++; } return n; });
async function until(page, test, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const s = await read(page); if (test(s)) return s; await page.waitForTimeout(60); }
  return null;
}

function nextPng(point) {
  const taken = readdirSync(captures).filter(f => f.startsWith(`${point}-`) && f.endsWith('.png')).length;
  return join(captures, `${point}-${String(taken + 1).padStart(3, '0')}.png`);
}
async function shot(page, point, height, target, seededSave, note) {
  const png = nextPng(point);
  await page.screenshot({ path: png });
  const state = await read(page);
  const sidecar = { milestone: 'MILESTONE-005', work: 'WORK-019-2', kind: 'screenshot', point, sequence: Number(png.slice(-7, -4)), target,
    captured_at: new Date().toISOString(), viewport: { width: 1920, height }, bytes: statSync(png).size, tool: 'playwright-library',
    binary: executablePath, version: browser.version(), seededSave, note, state };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
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
  const sidecar = { kind: 'loop', milestone: 'MILESTONE-005', work: 'WORK-019-2', point: name, captured_at: new Date().toISOString(), frames: kept.length, durationMs,
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
const HUD_CROP = { w: 720, h: 200, x: 0, y: 0 };
const INTRO = 'dog-room-intro-done.real.json', SAVE = 'save-v1.real.json', NO_BOX = 'a script open in state is drawn by no panel in this lane (WORK-019-3)';

async function mainSession(report) {
  const { context, page, errors } = await boot(1080, introDone);
  report.a = await read(page);
  report.a.still = await shot(page, 'want-panel-a-1080', 1080, 'want panel state a: soft nap, Soft/Seat unticked, Reward named before it is earned', INTRO, 'play mode, before any placement');
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  const large1 = await slotXY(page, 'large-1');
  await tapWorld(page, large1.x, large1.y); await page.waitForSelector('.tpp-chooser:not([hidden])');
  const rec = await startRecording(page);
  await page.waitForTimeout(500);
  await page.click('.tpp-charm-card[data-type-id="dog-bed"]');
  const placed = await until(page, s => s.lines.some(l => l.type === 'charm.placed'), 3000);
  await page.waitForTimeout(240);
  report.delta = await read(page);
  report.delta.still = await shot(page, 'stars-delta-1080', 1080, 'Stars bar mid-tween with the floating "+4 ★" (~300 ms after charm.placed)', INTRO, `design mode; ${NO_BOX}`);
  report.delta.placedAt = placed?.t ?? null;
  await page.waitForTimeout(2300);
  const frames = await rec.stop();
  report.delta.loop = encode('stars-delta', frames, HUD_CROP, { target: 'dog-bed card click -> Stars fill tween 0 -> 4/48 (250 ms) and "+4 ★" rising 40 px and fading over 900 ms', viewport: { width: 1920, height: 1080 },
    seededSave: INTRO, note: `recorded from 500 ms before the card click; ${NO_BOX}` });
  report.d = await read(page);
  report.d.still = await shot(page, 'want-panel-d-1080', 1080, 'want panel state d: both ticks, "Want fulfilled!", reward line kept', INTRO, `held while the reward script is open in state; ${NO_BOX}`);
  report.d.drained = await drain(page); await page.waitForTimeout(400);
  report.afterDrain = await read(page);
  const floor3 = await slotXY(page, 'floor-3');
  await tapWorld(page, floor3.x, floor3.y); await page.waitForSelector('.tpp-chooser:not([hidden])'); await page.waitForTimeout(300);
  report.locatorFloor3 = await read(page);
  report.locatorFloor3.still = await shot(page, 'locator-floor-3-1080', 1080, 'UI-CN05 locator above the sheet: floor-3 outline in the room miniature + link line', INTRO, 'design mode, chooser open on floor-3');
  await page.click('.tpp-charm-card[data-type-id="lamp"]'); await page.waitForTimeout(1200);
  report.b = await read(page);
  report.b.still = await shot(page, 'want-panel-b-1080', 1080, 'want panel state b: Light ✓, Plant dashed + note, beside each other ☐; ♥ 1', INTRO, `design mode, after the drain and the lamp at floor-3; ${NO_BOX}`);
  await page.click('.tpp-stars'); await page.waitForTimeout(300);
  report.explained = await read(page);
  report.explained.still = await shot(page, 'stars-explained-1080', 1080, 'tpp.stars.explain under the Stars bar after a bar tap', INTRO, 'design mode (HUD dimmed but live)');
  await page.evaluate(() => window.__tpp.store.dispatch({ type: 'debugSetStarsVisible', on: false }));
  await page.waitForTimeout(3200);
  await page.click('.tpp-stars', { force: true }).catch(() => {});
  report.hidden = await read(page);
  await page.click('.tpp-wantPanel'); await page.waitForTimeout(200);
  report.expanded = await read(page);
  report.mainErrors = errors;
  await context.close();
}

async function badgeSession(report) {
  const { context, page, errors } = await boot(1080, saveV1);
  report.badge = await read(page);
  report.badge.still = await shot(page, 'attention-badge-1080', 1080, 'Q13(a) attention badge "!" beside the HUD pill (phases owed inside)', SAVE, 'play mode; save-v1 owes Pet House phases');
  await page.click('button.tpp-attention'); await page.waitForTimeout(300);
  report.badgeText = await read(page);
  report.badgeText.still = await shot(page, 'attention-badge-text-1080', 1080, 'badge tapped: "A home phase is ready, step outside" for 3 s', SAVE, 'no record written for the tap (core §3 has no name)');
  report.badgeErrors = errors;
  await context.close();
}

async function locator823(report) {
  const { context, page, errors } = await boot(823, introDone);
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  const large1 = await slotXY(page, 'large-1');
  await tapWorld(page, large1.x, large1.y); await page.waitForSelector('.tpp-chooser:not([hidden])'); await page.waitForTimeout(300);
  report.locatorLarge1 = await read(page);
  report.locatorLarge1.still = await shot(page, 'locator-large-1-823', 823, 'UI-CN05 locator at 823: large-1 (hidden by the sheet) shown in the miniature', INTRO, 'design mode, chooser open on large-1');
  // MEC-002-028 interior part from intro-done: reaching phase 1 while inside shows the badge (phase.reached in the log).
  await page.click('.tpp-chooser [data-action="close"]').catch(() => {});
  await page.evaluate(() => window.__tpp.store.dispatch({ type: 'debugSetCurrent', projectId: 'pet-house', cents: 300 }));
  await page.waitForTimeout(300);
  report.phaseReached = await read(page);
  report.locator823Errors = errors;
  await context.close();
}

browser = await chromium.launch({ headless: true, executablePath });
const report = { work: 'WORK-019-2', base, browser: browser.version(), captured_at: new Date().toISOString() };
try {
  for (const [name, fn] of [['main', mainSession], ['badge', badgeSession], ['locator823', locator823]]) {
    try { await fn(report); } catch (error) { report[`${name}Error`] = String(error).slice(0, 600); }
  }
} finally {
  await browser.close();
  rmSync(tmpRoot, { recursive: true, force: true });
  writeFileSync(join(lane, 'hud-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

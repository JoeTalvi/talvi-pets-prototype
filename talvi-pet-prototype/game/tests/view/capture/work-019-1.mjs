// WORK-019-1 motion loops, stills and pet state reads (Playwright library, pinned chromium-1243 by executablePath; no install).
//   node tests/view/capture/work-019-1.mjs <dog-room-intro-done.real.json> <street-at-door.real.json>
//   (dev server on 5196 with ?lenient=1; TPP_BASE / TPP_EVIDENCE override)
// Loops: CDP Page.startScreencast JPEG frames with their timestamps -> system ffmpeg -> H.264 MP4 (full frame) + palette GIF (480 crop).
// Every fact in pet-report.json is read from window.__tpp (log lines, store state, the Interior's sprites); nothing is assumed.
// No dialogue box is drawn in this lane (WORK-019-3); where a script is open the state read says so and nothing drains it unless noted.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5196';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const lane = join(evidence, 'WORK-019-1'), captures = join(lane, 'captures'), loops = join(lane, 'loops'), tmpRoot = join(lane, 'tmp');
for (const dir of [captures, loops]) mkdirSync(dir, { recursive: true });
const [introPath, streetPath] = process.argv.slice(2);
const introDone = readFileSync(introPath, 'utf8'), streetAtDoor = readFileSync(streetPath, 'utf8');
const ffVersion = execFileSync(ffmpeg, ['-version']).toString().split('\n')[0];
const RECORDS = ['pet.reacted', 'pet.phaseChanged', 'pet.verbStarted', 'pet.verbEnded', 'pet.wantBubble', 'pet.tapped', 'input.tap', 'ui.bubbleTapped', 'action.rejected', 'asset.loadError', 'app.error', 'scene.changed'];

function edited(name, edit) {
  const save = JSON.parse(introDone); edit(save.state);
  const text = JSON.stringify(save); writeFileSync(join(lane, `${name}.edited.json`), `${JSON.stringify(save, null, 2)}\n`);
  return text;
}
const idleAt = (s, x = 919, y = 800) => { s.pets.dog.behaviour = { phase: 'idle', x, y, facing: 'left', timerMs: 600000, target: null, verb: null, reaction: null }; };
const lookSave = edited('use-look-wall-2', s => {
  s.rooms['dog-room'].placements['wall-2'] = 'painting';
  s.pets.dog.behaviour = { phase: 'using', x: 835, y: 533, facing: 'left', timerMs: 12000, target: { slotId: 'wall-2' }, verb: 'look-at', reaction: null };
});
const wantSave = edited('want-bubble', s => { s.pets.dog.wantBubbleInMs = 1500; idleAt(s); });

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
  return { context, page, errors };
}
async function waitScene(page, key) {
  await page.waitForFunction(key => window.__tpp && window.__tpp.game.scene.isActive(key), key, { timeout: 30000 });
  await page.waitForTimeout(400);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
}
/** Stamps every pet animation frame change (key, frame index, page time) so clip intervals are measured, not assumed. */
const hookPet = page => page.evaluate(() => {
  window.__animEvents = window.__animEvents ?? [];
  const attach = () => {
    const pet = window.__tpp.game.scene.getScene('Interior')?.pet;
    if (!pet || pet.__hooked) return; pet.__hooked = true;
    const stamp = (anim, frame) => window.__animEvents.push({ t: performance.now(), key: anim.key, frame: frame.index - 1 });
    pet.on('animationstart', stamp).on('animationupdate', stamp).on('animationrepeat', stamp);
  };
  attach(); window.__tpp.game.events.on('poststep', attach);
});
const read = page => page.evaluate(records => {
  const { store, log, game } = window.__tpp, interior = game.scene.isActive('Interior') ? game.scene.getScene('Interior') : null, s = store.getState();
  const pet = interior?.pet, bubble = interior?.bubble, sprite = id => { const c = interior?.charms.get(id); return c ? { texture: c.texture.key, x: c.x, y: c.y, depth: c.depth, box: c.getBounds() } : null; };
  return {
    t: Math.round(performance.now()), scene: s.scene, mode: s.mode, dialogueOpen: s.dialogue.current !== null, dialogueSource: s.dialogue.current?.source ?? null,
    behaviour: s.pets.dog.behaviour,
    sprite: pet ? { x: pet.x, y: pet.y, depth: pet.depth, flipX: pet.flipX, anim: pet.anims.currentAnim?.key ?? null, box: pet.getBounds(), bubbleOffset: pet.bubbleOffset, bubbleOffsetMeasured: pet.bubbleOffsetMeasured } : null,
    bubble: bubble ? { current: bubble.current(), depth: bubble.depth, x: bubble.x, y: bubble.y, visible: bubble.visible, alpha: bubble.alpha, bodyW: bubble.bodyW, bodyH: bubble.bodyH } : null,
    charms: { 'large-1': sprite('large-1'), 'wall-2': sprite('wall-2'), 'floor-3': sprite('floor-3') },
    lines: log.lines().filter(l => records.includes(l.type)),
  };
}, RECORDS);
/** World point -> page point through the canvas rect and the camera scroll. */
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => {
  const interior = window.__tpp.game.scene.getScene('Interior'), rect = window.__tpp.game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  return { x: rect.left + x * scale, y: rect.top + (y - interior.cameras.main.scrollY) * scale };
}, [x, y]);
async function tapWorld(page, x, y) { const p = await pagePoint(page, x, y); await page.mouse.click(p.x, p.y, { delay: 40 }); await page.waitForTimeout(250); }

function nextPng(point) {
  const taken = readdirSync(captures).filter(f => f.startsWith(`${point}-`) && f.endsWith('.png')).length;
  return join(captures, `${point}-${String(taken + 1).padStart(3, '0')}.png`);
}
async function shot(page, point, height, target, seededSave, note) {
  const png = nextPng(point);
  await page.screenshot({ path: png });
  const state = await read(page);
  const sidecar = { milestone: 'MILESTONE-005', work: 'WORK-019-1', kind: 'screenshot', point, sequence: Number(png.slice(-7, -4)), target,
    captured_at: new Date().toISOString(), viewport: { width: 1920, height }, bytes: statSync(png).size, tool: 'playwright-library',
    binary: executablePath, version: browser.version(), seededSave, note, state: { behaviour: state.behaviour, sprite: state.sprite, bubble: state.bubble, dialogueOpen: state.dialogueOpen } };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  return png;
}

async function startRecording(page) {
  const cdp = await page.context().newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => { frames.push({ data, t: metadata.timestamp * 1000 }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });
  return { stop: async () => { await cdp.send('Page.stopScreencast'); await cdp.detach().catch(() => {}); return frames; } };
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
  const sidecar = { kind: 'loop', milestone: 'MILESTONE-005', work: 'WORK-019-1', point: name, captured_at: new Date().toISOString(), frames: kept.length, durationMs,
    fps: Math.round(kept.length / (durationMs / 1000) * 10) / 10, tool: 'cdp-screencast+ffmpeg', ffmpeg: ffVersion, binary: executablePath, chromiumVersion: browser.version(), ...meta,
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
const cropAround = (x, y, height) => ({ w: 480, h: 480, x: Math.max(0, Math.min(1440, Math.round(x - 240))), y: Math.max(0, Math.min(height - 480, Math.round(y - (1080 - height) / 2 - 300))) });
/** Measured frame intervals of one clip from the page's animation stamps (first whole cycle). */
async function clipTiming(page, key) {
  const events = (await page.evaluate(() => window.__animEvents)).filter(e => e.key === key);
  const starts = events.filter((e, i, a) => i === 0 || e.frame !== a[i - 1].frame);
  const first = starts.findIndex(e => e.frame === 0);
  const cycle = starts.slice(first, first + 5);
  return { clip: key, measuredMs: cycle.slice(0, 4).map((e, i) => Math.round(cycle[i + 1] ? cycle[i + 1].t - e.t : NaN)), stamps: starts.length };
}
async function until(page, test, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const s = await read(page); if (test(s)) return s; await page.waitForTimeout(80); }
  return null;
}

async function greeting(report) {
  const { context, page, errors } = await boot(1080, streetAtDoor);
  await waitScene(page, 'Street');
  const rec = await startRecording(page);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await page.keyboard.up('KeyW');
  await page.waitForFunction(() => window.__tpp.game.scene.isActive('Interior'), null, { timeout: 10000 });
  await hookPet(page);
  const atBubble = await until(page, s => s.bubble?.current?.text === '🎵', 9000);
  const still = atBubble ? await shot(page, 'greeting-bubble-1080', 1080, '🎵 greeting bubble on arrival at the wander point', 'street-at-door.real.json', 'intro dialogue open in state, drawn by no panel in this lane (WORK-019-3)') : null;
  await page.waitForTimeout(3500);
  const frames = await rec.stop(), end = await read(page);
  const loop = encode('greeting-walk', frames, cropAround(end.behaviour.x, end.behaviour.y, 1080), { target: 'street door -> fade -> Interior; Dog walks from petSpawn to the nearest wander point, 🎵 on arrival, then idle', viewport: { width: 1920, height: 1080 }, seededSave: 'street-at-door.real.json', note: 'KeyW held 300 ms at the Starter House door; dialogue drawn by no panel in this lane' });
  report.greeting = { still, atBubble, end, loop: loop.outputs ?? loop.gap, errors };
  await context.close();
}

async function useLie(report, height) {
  const { context, page, errors } = await boot(height, introDone);
  await waitScene(page, 'Interior'); await hookPet(page);
  await until(page, s => s.behaviour.phase === 'idle', 8000);
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  await tapWorld(page, 970, 930); await page.waitForSelector('.tpp-chooser:not([hidden])');
  const rec = await startRecording(page);
  await page.click('.tpp-charm-card[data-type-id="dog-bed"]');
  const using = await until(page, s => s.behaviour.phase === 'using' && s.sprite.anim === 'pet-dog-use-lie', 12000);
  await page.waitForTimeout(2600);
  const still = await shot(page, `use-lie-large-1-${height}`, height, 'Dog using the bed at large-1 (use-lie on the cushion, drawn above the bed)', 'dog-room-intro-done.real.json', 'design mode; the soft-nap fulfilment opens a vignette in state, drawn by no panel in this lane');
  const frames = await rec.stop(), at = await read(page), timing = await clipTiming(page, 'pet-dog-use-lie');
  const loop = encode(`use-lie-large-1-${height}`, frames, cropAround(970, 900, height), { target: 'dog-bed card click -> walk-over -> ❤️ + react -> use-lie on the cushion', viewport: { width: 1920, height }, seededSave: 'dog-room-intro-done.real.json', note: 'recorded from the card click; vignette dialogue open in state, no box drawn (WORK-019-3)', clipTiming: timing });
  report[`useLie${height}`] = { using, at, still, timing, loop: loop.outputs ?? loop.gap, errors };
  await context.close();
}

async function useLook(report) {
  const { context, page, errors } = await boot(1080, lookSave);
  await waitScene(page, 'Interior'); await hookPet(page);
  const rec = await startRecording(page);
  await page.waitForTimeout(3500);
  const still = await shot(page, 'use-look-wall-2-1080', 1080, 'Dog using wall-2 (use-look, authored facing left) below the projected painting', 'use-look-wall-2.edited.json', 'facing left is the authored wall-2 anchor facing (gate default 2)');
  await page.waitForTimeout(4000);
  const frames = await rec.stop(), at = await read(page), timing = await clipTiming(page, 'pet-dog-use-look');
  const loop = encode('use-look-wall-2', frames, cropAround(835, 533, 1080), { target: 'Dog at (835, 533) playing use-look under the painting at wall-2', viewport: { width: 1920, height: 1080 }, seededSave: 'use-look-wall-2.edited.json', note: 'facing: left (authored); painting and Dog screen boxes in pet-report.json', facing: 'left', clipTiming: timing });
  report.useLook = { at, still, timing, loop: loop.outputs ?? loop.gap, errors };
  await context.close();
}

async function reactLike(report) {
  const { context, page, errors } = await boot(1080, introDone);
  await waitScene(page, 'Interior'); await hookPet(page);
  await until(page, s => s.behaviour.phase === 'idle', 8000);
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  const floor3 = await page.evaluate(() => { const o = window.__tpp.game.scene.getScene('Interior').room.slots.find(s => s.id === 'floor-3'); return { x: o.x, y: o.y }; });
  await tapWorld(page, floor3.x, floor3.y - 10); await page.waitForSelector('.tpp-chooser:not([hidden])');
  const rec = await startRecording(page);
  await page.click('.tpp-charm-card[data-type-id="lamp"]');
  const reacting = await until(page, s => s.behaviour.phase === 'reacting', 9000);
  const still = reacting ? await shot(page, 'react-like-1080', 1080, 'rear-up react with 🙂 after the lamp walk-over', 'dog-room-intro-done.real.json', 'design mode') : null;
  await until(page, s => s.behaviour.phase === 'using', 4000);
  await page.waitForTimeout(1500);
  const frames = await rec.stop(), at = await read(page), timing = await clipTiming(page, 'pet-dog-react');
  const loop = encode('react-like-floor-3', frames, cropAround(floor3.x, floor3.y + 100, 1080), { target: 'lamp card click -> walk-over -> react + 🙂 -> use-look at the floor-3 anchor', viewport: { width: 1920, height: 1080 }, seededSave: 'dog-room-intro-done.real.json', note: 'design mode', clipTiming: timing });
  report.reactLike = { reacting, at, still, timing, loop: loop.outputs ?? loop.gap, errors };
  await context.close();
}

async function want(report) {
  const { context, page, errors } = await boot(1080, wantSave);
  await waitScene(page, 'Interior'); await hookPet(page);
  const rec = await startRecording(page);
  const shown = await until(page, s => s.bubble?.current?.kind === 'icon', 6000);
  const still = shown ? await shot(page, 'want-bubble-1080', 1080, 'flat thought bubble with the tag icon above the Dog', 'want-bubble.edited.json', 'wantBubbleInMs 1500 seeded; Dog idle at petSpawn') : null;
  await page.waitForTimeout(2600);
  const frames = await rec.stop();
  const loop = encode('want-bubble-appear', frames, cropAround(919, 800, 1080), { target: 'want bubble appears (tag icon), holds 2 s and fades', viewport: { width: 1920, height: 1080 }, seededSave: 'want-bubble.edited.json', note: 'Dog idle at petSpawn' });
  const b = (await read(page)).behaviour;
  await tapWorld(page, b.x, b.y - 50);
  const afterPet = await read(page);
  const body = afterPet.bubble;
  await tapWorld(page, body.x + body.bodyW / 2 - 40, body.y - 50 - body.bodyH / 2);
  const afterBubble = await read(page);
  const textStill = await shot(page, 'want-bubble-text-1080', 1080, 'want bubble tapped: tpp.bubble.want text for 3 s', 'want-bubble.edited.json', 'Dog tapped first (tapPet -> pet.tapped want), then its bubble');
  report.want = { shown, still, afterPet, afterBubble, textStill, loop: loop.outputs ?? loop.gap, errors };
  await context.close();
}

browser = await chromium.launch({ headless: true, executablePath });
const report = { work: 'WORK-019-1', base, browser: browser.version(), captured_at: new Date().toISOString() };
try {
  for (const [name, fn] of [['greeting', greeting], ['useLie1080', r => useLie(r, 1080)], ['useLie823', r => useLie(r, 823)], ['useLook', useLook], ['reactLike', reactLike], ['want', want]]) {
    try { await fn(report); } catch (error) { report[`${name}Error`] = String(error).slice(0, 600); }
  }
} finally {
  await browser.close();
  rmSync(tmpRoot, { recursive: true, force: true });
  writeFileSync(join(lane, 'pet-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

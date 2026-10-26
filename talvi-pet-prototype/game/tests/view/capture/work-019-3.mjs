// WORK-019-3 package smoke (design §4 rows 0:30–2:30 + the Q13(a) badge), Playwright library, pinned chromium-1243 by executablePath; no install.
//   node tests/view/capture/work-019-3.mjs <street-at-door.real.json> <save-v1.vignette.real.json>
//   (dev server on 5196 with ?lenient=1; TPP_BASE / TPP_EVIDENCE override)
// Every expectation is read from window.__tpp (log lines, store state) and the DOM; a missing line is `ok: false` with what was found.
// Panel visibility is stamped in the page by a MutationObserver on `hidden` (Date.now()), compared with the log's `wall` stamps.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5196';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const lane = join(evidence, 'WORK-019-3'), captures = join(lane, 'captures'), loops = join(lane, 'loops'), tmpRoot = join(lane, 'tmp');
for (const dir of [captures, loops]) mkdirSync(dir, { recursive: true });
const [streetPath, vignettePath] = process.argv.slice(2);
const streetAtDoor = readFileSync(streetPath, 'utf8'), vignetteSave = readFileSync(vignettePath, 'utf8');
const ffVersion = execFileSync(ffmpeg, ['-version']).toString().split('\n')[0];
const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
const STREET = 'street-at-door.real.json', VIGNETTE = 'save-v1.vignette.real.json';

let browser;
const steps = [];
const step = (id, expected, found, ok) => { steps.push({ step: id, expected, found, ok: Boolean(ok) }); return ok; };

async function boot(height, save, beforeGoto = null) {
  const context = await browser.newContext({ viewport: { width: 1920, height }, deviceScaleFactor: 1 });
  await context.addInitScript(text => {
    if (!sessionStorage.getItem('seeded')) { localStorage.clear(); localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1'); }
    // Panel visibility timeline + the first frame the Interior is active (DOM-timed; core §3 has no record for a shown box).
    window.__vis = []; window.__interiorAt = null;
    const watch = () => {
      const panels = document.querySelector('#panels');
      if (!panels) return requestAnimationFrame(watch);
      // `hidden` from the mutation's old value: a hide and the next show in one task are two records, not one.
      const stamp = (el, hidden = el.hidden) => window.__vis.push({ t: Date.now(), panel: el.dataset.panel, hidden,
        text: hidden ? null : (el.querySelector('.tpp-dialogue-line, [data-string-key="tpp.toast.roundup"]')?.textContent ?? null),
        delta: el.dataset.panel === 'toast' && !hidden ? el.querySelector('.tpp-toast-delta')?.textContent : undefined });
      for (const el of panels.querySelectorAll('[data-panel="dialogue"], [data-panel="toast"]')) stamp(el);
      new MutationObserver(list => { for (const m of list) if (m.target.matches?.('[data-panel="dialogue"], [data-panel="toast"]')) stamp(m.target, m.oldValue === null); })
        .observe(panels, { subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['hidden'] });
    };
    const interior = () => { if (window.__tpp?.game?.scene?.isActive('Interior')) window.__interiorAt = Date.now(); else requestAnimationFrame(interior); };
    document.addEventListener('DOMContentLoaded', () => { watch(); interior(); });
  }, save);
  const page = await context.newPage(), errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e)));
  const hooked = beforeGoto ? await beforeGoto(page) : null;
  await page.goto(`${base}/?lenient=1`);
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.getScenes(true).length > 0, null, { timeout: 30000 });
  await page.waitForTimeout(500);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
  return { context, page, errors, hooked };
}
const lines = (page, ...types) => page.evaluate(types => window.__tpp.log.lines().filter(l => !types.length || types.includes(l.type)), types);
const state = page => page.evaluate(() => window.__tpp.store.getState());
const vis = page => page.evaluate(() => window.__vis);
const wallOf = line => (line ? Date.parse(line.wall) : null);
const boxHidden = page => page.evaluate(() => document.querySelector('[data-panel="dialogue"]').hidden);
async function until(page, fn, arg, ms) {
  try { await page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); return true; } catch { return false; }
}
const waitLine = (page, type, match, ms) => until(page, ([type, match]) => window.__tpp.log.lines()
  .some(l => l.type === type && Object.entries(match).every(([k, v]) => JSON.stringify(l[k]) === JSON.stringify(v))), [type, match], ms);
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => {
  const interior = window.__tpp.game.scene.getScene('Interior'), rect = window.__tpp.game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  return { x: rect.left + x * scale, y: rect.top + (y - interior.cameras.main.scrollY) * scale };
}, [x, y]);
async function tapWorld(page, x, y) { const p = await pagePoint(page, x, y); await page.mouse.click(p.x, p.y, { delay: 40 }); await page.waitForTimeout(350); }
const slotXY = (page, id) => page.evaluate(id => { const o = window.__tpp.game.scene.getScene('Interior').room.slots.find(s => s.id === id); return { x: o.x, y: o.y }; }, id);
async function debugRow(page, label, button, value) {
  await page.keyboard.press('Backquote'); await page.waitForSelector('.tpp-debugPanel:not([hidden])', { timeout: 3000 });
  const row = page.locator('.tpp-debug-row').filter({ has: page.locator('label', { hasText: new RegExp(`^${label}$`) }) }).first();
  if (value !== undefined) await row.locator('input').first().fill(String(value));
  await row.locator('button', { hasText: button }).first().click(); await page.waitForTimeout(250);
  await page.keyboard.press('Backquote'); await page.waitForTimeout(250);
}

function nextPng(point) {
  const taken = readdirSync(captures).filter(f => f.startsWith(`${point}-`) && f.endsWith('.png')).length;
  return join(captures, `${point}-${String(taken + 1).padStart(3, '0')}.png`);
}
async function shot(page, point, height, target, seededSave, note) {
  const png = nextPng(point);
  await page.screenshot({ path: png });
  const s = await state(page);
  const dom = await page.evaluate(() => { const d = document.querySelector('[data-panel="dialogue"]'), t = document.querySelector('[data-panel="toast"]');
    return { dialogue: { hidden: d.hidden, source: d.dataset.source ?? null, textOnly: d.classList.contains('text-only-game'), speaker: d.querySelector('.tpp-speaker')?.textContent, line: d.querySelector('.tpp-dialogue-line')?.textContent, portrait: d.querySelector('.tpp-portrait [data-asset-id]')?.outerHTML.slice(0, 160) ?? null, continue: d.querySelector('.tpp-continue')?.textContent },
      toast: { hidden: t.hidden, text: t.querySelector('[data-string-key="tpp.toast.roundup"]')?.textContent, delta: t.querySelector('.tpp-toast-delta')?.textContent },
      badge: (() => { const b = document.querySelector('button.tpp-attention'); return b ? { hidden: b.hidden || getComputedStyle(b).display === 'none' } : null; })() }; });
  const sidecar = { milestone: 'MILESTONE-005', work: 'WORK-019-3', sha, kind: 'screenshot', point, sequence: Number(png.slice(-7, -4)), target,
    captured_at: new Date().toISOString(), viewport: { width: 1920, height }, bytes: statSync(png).size, tool: 'playwright-library',
    binary: executablePath, version: browser.version(), seededSave, note, dom, state: { scene: s.scene, mode: s.mode, dialogue: s.dialogue.current && { source: s.dialogue.current.source, index: s.dialogue.current.index }, behaviour: s.pets.dog.behaviour } };
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify(sidecar, null, 2)}\n`);
  return { png, dom, behaviour: s.pets.dog.behaviour };
}

async function startRecording(page) {
  const cdp = await page.context().newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => { frames.push({ data, t: metadata.timestamp * 1000 }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });
  return { stop: async () => { await cdp.send('Page.stopScreencast'); await cdp.detach().catch(() => {}); return frames; } };
}
/** MP4 (libx264 yuv420p +faststart, ≤ 12 s) and a crop GIF at 10 fps that holds the whole box; a failed encode is a recorded gap. */
function encode(name, frames, crop, meta) {
  const tmp = join(tmpRoot, name); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  if (!frames.length) return { gap: { reason: 'no screencast frames' } };
  const t0 = frames[0].t, kept = frames.filter(f => f.t - t0 <= 12000);
  let list = '';
  kept.forEach((f, i) => { const file = join(tmp, `f${String(i).padStart(5, '0')}.jpg`); writeFileSync(file, Buffer.from(f.data, 'base64'));
    list += `file '${file}'\nduration ${((i + 1 < kept.length ? kept[i + 1].t - f.t : 100) / 1000).toFixed(6)}\n`; });
  list += `file '${join(tmp, `f${String(kept.length - 1).padStart(5, '0')}.jpg`)}'\n`; writeFileSync(join(tmp, 'list.txt'), list);
  const durationMs = Math.round(kept.at(-1).t - t0), sourceFps = Math.round(kept.length / (durationMs / 1000) * 10) / 10;
  const sidecar = { kind: 'loop', milestone: 'MILESTONE-005', work: 'WORK-019-3', sha, point: name, captured_at: new Date().toISOString(), frames: kept.length, durationMs,
    sourceFps, encodedFps: { mp4: 30, gif: 10 }, tool: 'cdp-screencast+ffmpeg', ffmpeg: ffVersion, binary: executablePath, chromiumVersion: browser.version(), recordStartWall: new Date(t0).toISOString(), ...meta, gifCrop: crop };
  try {
    const input = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')];
    execFileSync(ffmpeg, [...input, '-vf', 'fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(loops, `${name}.mp4`)]);
    execFileSync(ffmpeg, [...input, '-vf', `fps=10,crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${Math.round(crop.w / 2)}:-2,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer`, '-loop', '0', join(loops, `${name}.gif`)]);
    sidecar.outputs = { mp4: join(loops, `${name}.mp4`), mp4Bytes: statSync(join(loops, `${name}.mp4`)).size, gif: join(loops, `${name}.gif`), gifBytes: statSync(join(loops, `${name}.gif`)).size };
  } catch (error) { sidecar.gap = { reason: String(error).slice(0, 400) }; }
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(loops, `${name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
  return sidecar;
}
/** First time after `fromMs` the panel became visible (and optionally with a given line). */
const shownAfter = (timeline, panel, fromMs) => timeline.find(v => v.panel === panel && !v.hidden && v.t >= fromMs) ?? null;

const BOX_CROP = { w: 1920, h: 1080, x: 0, y: 0 };
const firstLine = (all, type, match = {}, after = 0) => all.find(l => l.type === type && wallOf(l) >= after && Object.entries(match).every(([k, v]) => JSON.stringify(l[k]) === JSON.stringify(v))) ?? null;
const pick = l => l && Object.fromEntries(Object.entries(l).filter(([k]) => !['script', 'action'].includes(k)));

/** (a) street door → Interior: the intro box hidden through the greeting walk, shown on {to:'greeting'} (Q-MEC007-2(a)). */
// The seeded avatar stands inside the door rect facing up, so the first tick enters (recording starts before the page loads); KeyW only if still outside.
async function enterRoom(page, report, rec) {
  if ((await state(page)).scene.kind === 'street') { await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await page.keyboard.up('KeyW'); }
  await waitLine(page, 'scene.changed', { to: { kind: 'interior', roomId: 'dog-room' } }, 5000);
  const hiddenSamples = [];
  for (let i = 0; i < 80; i++) {
    const [s, hidden] = await Promise.all([state(page), boxHidden(page)]);
    if (s.pets.dog.behaviour.phase === 'greeting' || !hidden) break;
    hiddenSamples.push({ phase: s.pets.dog.behaviour.phase, intro: s.dialogue.current?.source === 'intro', hidden });
    await page.waitForTimeout(80);
  }
  await until(page, () => !document.querySelector('[data-panel="dialogue"]').hidden, null, 7000);
  await page.waitForTimeout(350);
  report.introStill = await shot(page, 'dialogue-intro-1080', 1080, 'intro box: portrait, "Dog", intro line 1, "Tap to continue"', STREET, 'first DOM frame after the 200 ms slide; the greeting walk ran under the scene fade (WORK-019-1 FORK)');
  await page.waitForTimeout(6500);
  report.boxAfterGreeting = encode('box-after-greeting', await rec.stop(), BOX_CROP, { target: 'street door → fade-in → greeting walk (under the fade) → 🎵 → intro box slides up', viewport: { width: 1920, height: 1080 }, seededSave: STREET });
  const all = await lines(page), timeline = await vis(page);
  const changed = firstLine(all, 'scene.changed', { to: { kind: 'interior', roomId: 'dog-room' } }), reacted = firstLine(all, 'pet.reacted', { reaction: 'greeting' });
  const greet = firstLine(all, 'pet.phaseChanged', { to: 'greeting' }), opened = firstLine(all, 'dialogue.opened'), shown = shownAfter(timeline, 'dialogue', wallOf(changed) ?? 0);
  report.greetingDeferral = { sceneChangedWall: changed?.wall, greetingWall: greet?.wall, boxShownAt: shown && new Date(shown.t).toISOString(),
    boxMinusSceneChangedMs: shown && changed ? shown.t - wallOf(changed) : null, boxMinusGreetingMs: shown && greet ? shown.t - wallOf(greet) : null, hiddenSamples: hiddenSamples.length };
  step('a.scene.changed', 'scene.changed {to: interior dog-room}', pick(changed), changed);
  step('a.pet.reacted', 'pet.reacted {greeting, walkOver:true}', pick(reacted), reacted?.walkOver === true);
  step('a.intro.opened', 'dialogue.opened {intro} in the entering dispatch', opened?.script?.source, opened?.script?.source === 'intro');
  const firstStamp = timeline.find(v => v.panel === 'dialogue');
  step('a.box.hidden', 'box hidden from mount through scene.changed and the walk (DOM timeline), first visible only at/after {to:greeting}', { firstStamp, firstVisible: shown, polledHidden: hiddenSamples.length },
    firstStamp?.hidden === true && shown && greet && shown.t >= wallOf(greet) - 20 && hiddenSamples.every(h => h.hidden));
  step('a.greeting', "pet.phaseChanged {to:'greeting'}", pick(greet), greet);
  step('a.box.shown', 'box shown at/after {to:greeting}; ≤ walkOverMs + 100 after scene.changed', report.greetingDeferral,
    shown && greet && shown.t >= wallOf(greet) - 20 && report.greetingDeferral.boxMinusSceneChangedMs <= 5100);
  const dom = report.introStill.dom.dialogue;
  step('a.box.layout', 'portrait img pets/dog-portrait, speaker Dog, intro line 0, Tap to continue, not text-only', dom,
    dom.portrait?.includes('pets/dog-portrait') && dom.speaker === 'Dog' && !dom.textOnly && dom.continue === 'Tap to continue' && dom.line === opened?.script?.lines[0]);
  step('a.walk.visible', 'not asserted: the greeting walk is under the scene fade (WORK-019-1 FORK, return to Phase 2)', 'gap recorded', true);
}

/** (b) VERIFY-MEC-008-017: three taps (room, HUD toggle area, the Dog) → three dialogue transitions; nothing reaches the world. */
async function tapThrough(page, report) {
  const before = (await lines(page)).length;
  const toggle = await page.locator('.tpp-design-toggle').boundingBox();
  const dog = (await state(page)).pets.dog.behaviour, dogPt = await pagePoint(page, dog.x, dog.y - 50);
  const targets = [['room', { x: 1300, y: 600 }], ['hud', { x: toggle.x + toggle.width / 2, y: toggle.y + toggle.height / 2 }], ['dog', dogPt]];
  const perTap = [];
  for (const [name, p] of targets) {
    const n = (await lines(page)).length;
    await page.mouse.click(p.x, p.y, { delay: 40 }); await page.waitForTimeout(450);
    perTap.push({ tap: name, at: p, events: (await lines(page)).slice(n).filter(l => l.type.startsWith('dialogue.')).map(l => ({ type: l.type, index: l.index, source: l.source ?? l.script?.source })) });
  }
  const window = (await lines(page)).slice(before), count = t => window.filter(l => l.type === t).length;
  const transitions = window.filter(l => l.type === 'dialogue.advanced' || l.type === 'dialogue.closed');
  report.tapAnywhere = { perTap, transitions: transitions.length, inputTap: count('input.tap'), petTapped: count('pet.tapped'), chooserOpened: count('ui.chooserOpened'),
    tapPetRejected: window.filter(l => l.type === 'action.rejected' && l.action?.type === 'tapPet').length };
  step('b.advanced', 'dialogue.advanced {index:1} (intro line 2)', perTap[0], perTap[0].events.some(e => e.type === 'dialogue.advanced' && e.index === 1));
  step('b.announce', 'dialogue.closed {intro} + dialogue.opened {wantAnnounce}', perTap[1], perTap[1].events.some(e => e.type === 'dialogue.closed' && e.source === 'intro') && perTap[1].events.some(e => e.type === 'dialogue.opened' && e.source === 'wantAnnounce'));
  step('b.closed', 'dialogue.closed {wantAnnounce}', perTap[2], perTap[2].events.some(e => e.type === 'dialogue.closed' && e.source === 'wantAnnounce'));
  step('b.tapAnywhere', '3 taps → 3 dialogue transitions; 0 input.tap, 0 pet.tapped/tapPet, 0 ui.chooserOpened', report.tapAnywhere,
    transitions.length === 3 && !report.tapAnywhere.inputTap && !report.tapAnywhere.petTapped && !report.tapAnywhere.chooserOpened && !report.tapAnywhere.tapPetRejected);
  const s = await state(page);
  step('b.drained', 'dialogue.current === null after the taps (WORK-014-4 FLAG: asserted, not hardcoded)', s.dialogue.current, s.dialogue.current === null);
  const all = await lines(page), want = firstLine(all, 'want.activated', { wantId: 'soft-nap' });
  const panel = await page.evaluate(() => { const p = document.querySelector('.tpp-wantPanel'), w = window.__tpp.content.pets.dog.wants[0];
    return { hidden: p.hidden, brief: p.querySelector('.tpp-want-brief')?.textContent, expected: w.brief }; });
  step('b.want1', 'want.activated {soft-nap}; want panel state a visible with want 1\'s brief', { line: pick(want), panel }, want && !panel.hidden && panel.brief === panel.expected);
}

/** (c)+(d) interval 5000 so round-ups land during the vignette; the bed fulfils want 1 and the vignette waits for the use (VERIFY-MEC-008-015). */
async function placeBed(page, report) {
  await debugRow(page, 'Event interval', 'Apply', 5000);
  const applied = (await lines(page, 'debug.applied')).at(-1);
  step('c.interval', 'debug.applied for the 5000 ms event interval', pick(applied), applied && JSON.stringify(applied).includes('5000'));
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  const large1 = await slotXY(page, 'large-1');
  await tapWorld(page, large1.x, large1.y); await page.waitForSelector('.tpp-chooser:not([hidden])');
  const rec = await startRecording(page);
  await page.waitForTimeout(1500);
  const clickAt = Date.now();
  await page.click('.tpp-charm-card[data-type-id="dog-bed"]');
  const hiddenSamples = [];
  for (let i = 0; i < 120; i++) {
    const [s, hidden] = await Promise.all([state(page), boxHidden(page)]);
    if (!hidden) break;
    hiddenSamples.push({ phase: s.pets.dog.behaviour.phase, vignette: s.dialogue.current?.source === 'vignette' });
    await page.waitForTimeout(80);
  }
  await until(page, () => !document.querySelector('[data-panel="dialogue"]').hidden, null, 9000);
  await page.waitForTimeout(350);
  report.vignetteStill = await shot(page, 'dialogue-vignette-1080', 1080, 'vignette box over the room; the Dog lying on the bed cushion', 'street-at-door.real.json → session', 'the Dog sprite draws in the canvas under the HTML box; whether it is above the box top or behind it is read from behaviour.y in this sidecar (box top = 800 world y at 1080)');
  await page.waitForTimeout(5500);
  report.boxAfterUse = encode('box-after-use', await rec.stop(), BOX_CROP, { target: 'dog-bed card click → walk-over → ❤️ + react → lie down → vignette box slides up ≈ 2 s later', viewport: { width: 1920, height: 1080 }, seededSave: STREET });
  const all = await lines(page), timeline = await vis(page);
  const placed = firstLine(all, 'charm.placed', { slotId: 'large-1', typeId: 'dog-bed' }), at = wallOf(placed) ?? clickAt;
  const reacting = firstLine(all, 'pet.phaseChanged', { to: 'reacting', target: { slotId: 'large-1' } }, at), using = firstLine(all, 'pet.phaseChanged', { to: 'using', verb: 'nap' }, at);
  const shown = shownAfter(timeline, 'dialogue', at);
  report.fulfilDeferral = { charmPlacedWall: placed?.wall, reactingWall: reacting?.wall, boxShownAt: shown && new Date(shown.t).toISOString(),
    boxMinusPlacedMs: shown && placed ? shown.t - at : null, reactingMinusPlacedMs: reacting ? wallOf(reacting) - at : null, hiddenSamples: hiddenSamples.length };
  const d = report.fulfilDeferral;
  for (const [id, type, match] of [['d.placed', 'charm.placed', { slotId: 'large-1', typeId: 'dog-bed' }], ['d.stars', 'stars.changed', { from: 0, to: 4 }],
    ['d.fulfilled', 'want.fulfilled', { focusSlotId: 'large-1' }], ['d.heart', 'heart.earned', { hearts: 1 }], ['d.want2', 'want.activated', { wantId: 'bright-corner' }]]) {
    const l = firstLine(all, type, match, at - 50); step(id, `${type} ${JSON.stringify(match)}`, pick(l), l);
  }
  const vig = all.find(l => l.type === 'dialogue.opened' && l.script?.source === 'vignette');
  step('d.vignette.opened', 'dialogue.opened {vignette}', vig?.script?.source, vig);
  step('d.box.hidden', 'box hidden while the Dog walks over', hiddenSamples.slice(0, 3), hiddenSamples.length > 0 && hiddenSamples.every(h => h.vignette));
  step('d.reacting', "pet.phaseChanged {to:'reacting', target:{slotId:'large-1'}}", pick(reacting), reacting);
  step('d.using', "pet.phaseChanged {to:'using', verb:'nap'}", pick(using), using);
  step('d.deferral', 'wall(box) − wall(charm.placed) ≤ 7000 and ≥ wall(reacting) − wall(placed) + 1900', d,
    d.boxMinusPlacedMs !== null && d.boxMinusPlacedMs <= 7000 && (d.reactingMinusPlacedMs === null || d.boxMinusPlacedMs >= d.reactingMinusPlacedMs + 1900));
}

/** (e) tap through the vignette and the announce; held toasts drain one at a time (Q7(a), VERIFY-MEC-002-026 at the 5 s cadence). */
async function drainAndToasts(page, report) {
  const openedAt = wallOf((await lines(page, 'dialogue.opened')).find(l => l.script?.source === 'vignette'));
  let taps = 0;
  while ((await state(page)).dialogue.current !== null && taps < 8) { await page.mouse.click(1300, 600, { delay: 40 }); await page.waitForTimeout(500); taps++; }
  const closedLine = (await lines(page, 'dialogue.closed')).at(-1), closedAt = wallOf(closedLine);
  step('e.drained', 'vignette ×3 + announce tapped through; dialogue.current === null', { taps, last: pick(closedLine) }, (await state(page)).dialogue.current === null && closedLine?.source === 'wantAnnounce');
  await until(page, () => !document.querySelector('[data-panel="toast"]').hidden, null, 6000);
  await page.waitForTimeout(300);
  report.toastStill = await shot(page, 'toast-1080', 1080, 'a held toast appearing right after the announce closes', STREET, 'design mode; event interval 5000 ms');
  await page.waitForTimeout(16000);
  const all = await lines(page), timeline = (await vis(page)).filter(v => v.panel === 'toast');
  const heldDuring = timeline.filter(v => !v.hidden && v.t >= openedAt && v.t < closedAt);
  const intervals = []; let open = null;
  for (const v of timeline) { if (!v.hidden && !open) open = v; else if (v.hidden && open) { intervals.push({ shownAt: new Date(open.t).toISOString(), ms: v.t - open.t, text: open.text, delta: open.delta }); open = null; } }
  const fired = all.filter(l => l.type === 'roundup.fired'), firedDuring = fired.filter(l => wallOf(l) >= openedAt && wallOf(l) < closedAt);
  const firstAfter = timeline.find(v => !v.hidden && v.t >= closedAt);
  report.toasts = { intervals, fired: fired.length, firedDuringVignette: firedDuring.length, heldDuring: heldDuring.length, firstAfterCloseMs: firstAfter ? firstAfter.t - closedAt : null, openNow: Boolean(open),
    lastFiredWall: fired.at(-1)?.wall };
  step('e.held', '≥ 1 roundup.fired while the box was open and no toast visible then', { firedDuring: firedDuring.length, heldDuring: heldDuring.length }, firedDuring.length >= 1 && heldDuring.length === 0);
  step('e.drain', 'a held toast shows right after the last dialogue.closed (≤ 300 ms)', report.toasts.firstAfterCloseMs, report.toasts.firstAfterCloseMs !== null && report.toasts.firstAfterCloseMs <= 300);
  const complete = intervals.filter(i => i.ms > 0);
  step('e.timeline', '≥ 3 toasts over ≥ 15 s, each visible ≈ 3.0–3.5 s, never overlapping (one section)', complete.map(i => i.ms), complete.length >= 3 && complete.every(i => i.ms >= 3000 && i.ms <= 3600));
  const text = report.toastStill.dom.toast;
  step('e.text', 'pill "<Merchant> $x.xx → yy¢ to Pet Shelters" and "+yy¢" badge', text, /^.+ \$\d+\.\d\d → \d+¢ to Pet Shelters$/.test(text.text ?? '') && /^\+\d+¢$/.test(text.delta ?? ''));
}

/** (f) lamp at floor-3 → the Dog's like react; then Done. */
async function placeLamp(page) {
  const floor3 = await slotXY(page, 'floor-3'), before = Date.now();
  await tapWorld(page, floor3.x, floor3.y); await page.waitForSelector('.tpp-chooser:not([hidden])');
  await page.click('.tpp-charm-card[data-type-id="lamp"]');
  await waitLine(page, 'pet.reacted', { reaction: 'like' }, 12000);
  const all = await lines(page);
  const placed = firstLine(all, 'charm.placed', { slotId: 'floor-3', typeId: 'lamp' }, before - 50), like = firstLine(all, 'pet.reacted', { reaction: 'like' }, before - 50);
  step('f.lamp', 'charm.placed {floor-3, lamp}', pick(placed), placed);
  step('f.like', 'pet.reacted {like}', pick(like), like);
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
}

/** (g) VERIFY-MEC-010-015 desktop toast half: trickle logs round-ups and shows none. */
async function trickle(page, report) {
  await until(page, () => document.querySelector('[data-panel="toast"]').hidden, null, 8000);
  await debugRow(page, 'Feed presentation', 'Trickle');
  const from = Date.now();
  await page.waitForTimeout(11500);
  const all = await lines(page), fired = all.filter(l => l.type === 'roundup.fired' && wallOf(l) >= from);
  const shown = (await vis(page)).filter(v => v.panel === 'toast' && !v.hidden && v.t >= from);
  const applied = all.filter(l => l.type === 'debug.applied' && JSON.stringify(l).includes('trickle'));
  report.trickle = { fired: fired.length, toastsShown: shown.length, applied: applied.map(pick) };
  step('g.trickle', '≥ 2 roundup.fired, 0 toasts, debug.applied {trickle}', report.trickle, fired.length >= 2 && shown.length === 0 && applied.length >= 1);
  await debugRow(page, 'Feed presentation', 'Events');
}

/** (h) "Jump to next phase" → phase.reached {1} → the interior badge (Q13(a), WORK-019-2). */
async function jumpPhase(page, report) {
  await debugRow(page, 'Jump to next phase', 'Go');
  await waitLine(page, 'phase.reached', { phase: 1 }, 3000);
  await page.waitForTimeout(400);
  const reached = firstLine(await lines(page), 'phase.reached', { phase: 1 });
  report.badgeStill = await shot(page, 'badge-after-phase-1080', 1080, 'Q13(a) attention badge beside the HUD pill after phase 1', STREET, 'play mode, inside the Dog room');
  const badge = report.badgeStill.dom.badge;
  step('h.phase', 'phase.reached {phase:1}', pick(reached), reached);
  step('h.badge', 'button.tpp-attention visible', badge, badge && !badge.hidden);
}

/** (i) reload mid-chain at 823: the saved vignette is visible within 300 ms of the Interior's first active frame, line 0, no view replay. */
async function reload823(report) {
  const { context, page, errors } = await boot(823, vignetteSave);
  await page.waitForFunction(() => window.__interiorAt !== null, null, { timeout: 20000 });
  await page.waitForTimeout(600);
  const timeline = await vis(page), interiorAt = await page.evaluate(() => window.__interiorAt);
  const shown = timeline.find(v => v.panel === 'dialogue' && !v.hidden);
  const s = await state(page);
  report.reload = { interiorActiveAt: new Date(interiorAt).toISOString(), boxShownAt: shown && new Date(shown.t).toISOString(), boxMinusInteriorMs: shown ? shown.t - interiorAt : null,
    dialogue: s.dialogue.current && { source: s.dialogue.current.source, index: s.dialogue.current.index }, behaviour: s.pets.dog.behaviour };
  report.reloadStill = await shot(page, 'dialogue-vignette-823', 823, 'reload mid-chain: the vignette box open at line 0 at once', VIGNETTE, 'no deferral; the Dog resumes the saved walk from state (mec-007 §6)');
  const dom = report.reloadStill.dom.dialogue;
  step('i.reload', 'box visible ≤ 300 ms after the Interior is active, vignette index 0, line 0 shown', { ...report.reload, line: dom.line },
    shown && report.reload.boxMinusInteriorMs <= 300 && s.dialogue.current?.source === 'vignette' && s.dialogue.current.index === 0 && dom.line === s.dialogue.current.lines[0]);
  const replays = (await lines(page, 'dialogue.opened')).length;
  step('i.noReplay', 'no dialogue.opened replayed by the view on load; the Dog phase from state (walking/using)', { replays, phase: s.pets.dog.behaviour.phase }, replays === 0);
  report.reloadErrors = errors;
  await context.close();
}

browser = await chromium.launch({ headless: true, executablePath });
const report = { work: 'WORK-019-3', sha, base, browser: browser.version(), captured_at: new Date().toISOString(), interval: 'event interval 5000 ms (debug row) for (d)–(g)' };
try {
  const { context, page, errors, hooked } = await boot(1080, streetAtDoor, p => startRecording(p));
  for (const [name, fn] of [['a', (p, r) => enterRoom(p, r, hooked)], ['b', tapThrough], ['cd', placeBed], ['e', drainAndToasts], ['f', placeLamp], ['g', trickle], ['h', jumpPhase]]) {
    try { await fn(page, report); } catch (error) { report[`${name}Error`] = String(error).slice(0, 600); step(`${name}.error`, 'no exception', String(error).slice(0, 300), false); }
  }
  const all = await lines(page);
  writeFileSync(join(lane, 'smoke-log.jsonl'), all.map(l => JSON.stringify(l)).join('\n') + '\n');
  const writes = all.filter(l => l.type === 'save.written');
  report.saveWritten = { count: writes.length, spanMs: writes.length > 1 ? wallOf(writes.at(-1)) - wallOf(writes[0]) : 0 };
  report.assetLoadErrors = all.filter(l => l.type === 'asset.loadError').map(pick);
  report.appErrors = all.filter(l => l.type === 'app.error').map(pick);
  report.mainErrors = errors;
  step('j.errors', 'zero console errors, zero page errors, zero asset.loadError', { console: errors.consoleErrors.length, page: errors.pageErrors.length, assets: report.assetLoadErrors.length },
    !errors.consoleErrors.length && !errors.pageErrors.length && !report.assetLoadErrors.length);
  await context.close();
  try { await reload823(report); } catch (error) { report.reloadError = String(error).slice(0, 600); step('i.error', 'no exception', String(error).slice(0, 300), false); }
} finally {
  await browser.close();
  rmSync(tmpRoot, { recursive: true, force: true });
  report.steps = steps; report.ok = steps.every(s => s.ok);
  writeFileSync(join(lane, 'smoke-report.json'), `${JSON.stringify(report, null, 2)}\n`);
}

// WORK-015-3 VERIFY-TOOL-002 acceptance task (desktop Chrome half), export round trip, draft recovery, no state writes, street read-only.
//   node tests/view/capture/work-015-3.mjs <dog-room-intro-done.real.json>
//   (dev server on 5198; TPP_BASE / TPP_EVIDENCE override.) Playwright library, pinned chromium-1243 by executablePath (no install).
// Every `ok` is read from the page (window.__tpp, the panel DOM, localStorage, the clipboard, the download); nothing is hardcoded.
// The round trip writes the export into THIS worktree's src/content/rooms/dog-room.json transiently and restores it with git checkout (finally).
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5198';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const ffmpeg = '/opt/homebrew/bin/ffmpeg';
const ffVersion = execFileSync(ffmpeg, ['-version']).toString().split('\n')[0];
const lane = join(evidence, 'WORK-015-3'), captures = join(lane, 'captures'), loops = join(lane, 'loops'), exportDir = join(lane, 'export');
const tmpRoot = join(lane, '.tmp-frames');
for (const d of [captures, loops, exportDir]) mkdirSync(d, { recursive: true });
const gameDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const roomFile = join(gameDir, 'src/content/rooms/dog-room.json');
const introDone = readFileSync(process.argv[2], 'utf8');
const sha = execFileSync('git', ['-C', gameDir, 'rev-parse', 'HEAD']).toString().trim();
const URL_PATH = '/?lenient=1&preview=segments';
const ORIGIN = base;
const KEY = 'tpp.roomDraft.dog-room';
const steps = [];
let browser;

const step = (id, expected, observed, ok, extra = {}) => { steps.push({ id, expected, observed, ok: !!ok, ...extra }); return !!ok; };
const canonJson = v => JSON.stringify((function canon(x) { return Array.isArray(x) ? x.map(canon) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, canon(x[k])])) : x; })(v));

async function boot(height, { save = introDone, url = URL_PATH } = {}) {
  const context = await browser.newContext({ viewport: { width: 1920, height }, deviceScaleFactor: 1, acceptDownloads: true });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: ORIGIN });
  await context.addInitScript(text => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear(); if (text) localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1');
  }, save);
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  const errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e)));
  await page.goto(`${base}${url}`);
  return { context, page, errors };
}
async function ready(page, scene = 'Interior') {
  await page.waitForFunction(s => window.__tpp && window.__tpp.game.scene.isActive(s), scene, { timeout: 30000 });
  await page.waitForTimeout(800);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
}
/** Row 15 through the debug panel (Backquote opens it, the switch toggles, Backquote closes it). */
async function row15(page) {
  await page.mouse.click(300, 250);
  await page.keyboard.press('Backquote'); await page.waitForTimeout(300);
  await page.evaluate(() => {
    const r = [...document.querySelectorAll('.tpp-debug-row')].find(x => x.querySelector('label').textContent === 'Room editor');
    r.scrollIntoView({ block: 'center' }); r.querySelector('[role=switch]').click();
  });
  await page.waitForTimeout(300);
  await page.keyboard.press('Backquote'); await page.waitForTimeout(500);
}
async function openWithE(page) {
  await page.mouse.click(300, 250); await page.keyboard.press('KeyE');
  await page.waitForFunction(() => !!window.__tpp.context.roomEditor, null, { timeout: 5000 }); await page.waitForTimeout(400);
}
const read = page => page.evaluate(key => {
  const { context, log, game, store } = window.__tpp, panel = document.querySelector('[data-panel=roomEditor]'), editor = context.roomEditor ?? null;
  const interior = game.scene.isActive('Interior') ? game.scene.getScene('Interior') : null;
  const rows = panel ? [...panel.querySelectorAll('.tpp-editor-findings li')].map(li => ({ ids: li.dataset.ids, level: li.dataset.level, color: li.style.color, text: li.textContent })) : [];
  const slot = (room, id) => { const o = room?.slots.find(x => x.id === id); return o ? { x: o.x, y: o.y, anchor: o.anchor, adjacent: o.adjacent } : null; };
  const draft = editor?.draft() ?? null;
  return {
    t: Math.round(performance.now()), editorOpen: !!editor, panelVisible: panel ? !panel.hidden : false, findings: rows,
    checkStats: panel?.dataset.checkStats ? JSON.parse(panel.dataset.checkStats) : null,
    floor3: slot(draft, 'floor-3'), floor4: slot(draft, 'floor-4'), vertex0: draft?.walkArea[0] ?? null, vertex2: draft?.walkArea[2] ?? null,
    draftEqualsContent: draft ? JSON.stringify(draft) === JSON.stringify(context.content.rooms['dog-room']) : null,
    canUndo: editor?.canUndo() ?? null, historyPast: editor?.history?.past.length ?? null, selection: editor?.selection() ?? null,
    segmentsLabel: interior?.preview?.layers.segments?.label() ?? null, draftKey: localStorage.getItem(key),
    prompt: panel ? (p => (p.hidden ? null : p.textContent))(panel.querySelector('.tpp-editor-prompt')) : null,
    status: panel?.querySelector('.tpp-editor-status')?.textContent ?? null, mode: store.getState().mode,
  };
}, KEY);
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => {
  const scene = window.__tpp.game.scene.getScene('Interior'), rect = window.__tpp.game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  return { x: rect.left + x * scale, y: rect.top + (y - scene.cameras.main.scrollY) * scale };
}, [x, y]);
async function dragWorld(page, from, to, ms = 1500, n = 30) {
  const a = await pagePoint(page, from.x, from.y), b = await pagePoint(page, to.x, to.y);
  await page.mouse.move(a.x, a.y); await page.waitForTimeout(120); await page.mouse.down(); await page.waitForTimeout(120);
  for (let i = 1; i <= n; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n); await page.waitForTimeout(ms / n); }
  await page.waitForTimeout(120); await page.mouse.up(); await page.waitForTimeout(300);
}
async function clickWorld(page, x, y) { const p = await pagePoint(page, x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); }
async function shot(page, point, height, target, note) {
  const png = join(captures, `${point}.png`);
  await page.screenshot({ path: png });
  const state = await read(page).catch(() => null);
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify({ milestone: 'MILESTONE-005', work: 'WORK-015-3', kind: 'screenshot', point, target, sha,
    captured_at: new Date().toISOString(), viewport: { width: 1920, height }, bytes: statSync(png).size, tool: 'playwright-library', binary: executablePath,
    version: browser.version(), url: page.url().replace(base, ''), seededSave: 'dog-room-intro-done.real.json', note, state }, null, 2)}\n`);
  return png;
}
async function startRecording(page) {
  const cdp = await page.context().newCDPSession(page), frames = [];
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => { frames.push({ data, t: metadata.timestamp * 1000 }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 80, everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080 });
  return { stop: async () => { await cdp.send('Page.stopScreencast'); await cdp.detach().catch(() => {}); return frames; } };
}
/** MP4 (libx264 yuv420p) and a 480 px crop GIF at 12 fps; a failed encode or < 2 frames is a recorded gap with sample frames. */
function encode(name, frames, crop, meta) {
  const tmp = join(tmpRoot, name); rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const sidecar = { kind: 'loop', milestone: 'MILESTONE-005', work: 'WORK-015-3', point: name, sha, captured_at: new Date().toISOString(), tool: 'cdp-screencast+ffmpeg', ffmpeg: ffVersion,
    binary: executablePath, chromiumVersion: browser.version(), viewport: { width: 1920, height: 1080 }, url: URL_PATH, seededSave: 'dog-room-intro-done.real.json', gifCrop: crop, ...meta };
  if (frames.length < 2) { sidecar.gap = { reason: `only ${frames.length} screencast frames` }; writeFileSync(join(loops, `${name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`); return sidecar; }
  const t0 = frames[0].t, kept = frames.filter(f => f.t - t0 <= 10000);
  let list = '';
  kept.forEach((f, i) => { const file = join(tmp, `f${String(i).padStart(5, '0')}.jpg`); writeFileSync(file, Buffer.from(f.data, 'base64'));
    list += `file '${file}'\nduration ${((i + 1 < kept.length ? kept[i + 1].t - f.t : 100) / 1000).toFixed(6)}\n`; });
  list += `file '${join(tmp, `f${String(kept.length - 1).padStart(5, '0')}.jpg`)}'\n`; writeFileSync(join(tmp, 'list.txt'), list);
  const durationMs = Math.round(kept.at(-1).t - t0);
  Object.assign(sidecar, { frames: kept.length, durationMs, sourceFps: Math.round(kept.length / (durationMs / 1000) * 10) / 10, encodedFps: { mp4: 30, gif: 12 } });
  try {
    const input = ['-y', '-hide_banner', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', join(tmp, 'list.txt')];
    execFileSync(ffmpeg, [...input, '-vf', 'fps=30,crop=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '26', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', join(loops, `${name}.mp4`)]);
    execFileSync(ffmpeg, [...input, '-vf', `fps=12,crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer`, '-loop', '0', join(loops, `${name}.gif`)]);
    sidecar.outputs = { mp4: join(loops, `${name}.mp4`), mp4Bytes: statSync(join(loops, `${name}.mp4`)).size, gif: join(loops, `${name}.gif`), gifBytes: statSync(join(loops, `${name}.gif`)).size };
  } catch (error) { sidecar.gap = { reason: String(error).slice(0, 400) }; }
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(loops, `${name}.json`), `${JSON.stringify(sidecar, null, 2)}\n`);
  return sidecar;
}
const crop = (x, y, w = 480, h = 480) => ({ w, h, x: Math.max(0, Math.min(1920 - w, Math.round(x - w / 2))), y: Math.max(0, Math.min(1080 - h, Math.round(y - h / 2))) });
async function loop(page, name, cropBox, target, act) {
  const rec = await startRecording(page), before = await read(page);
  await page.waitForTimeout(1000); await act(); await page.waitForTimeout(1000);
  const after = await read(page);
  const pick = s => ({ floor3: s.floor3, floor4: s.floor4, vertex0: s.vertex0, vertex2: s.vertex2, historyPast: s.historyPast, segmentsLabel: s.segmentsLabel, findingCount: s.findings.length });
  const sidecar = encode(name, await rec.stop(), cropBox, { target, measured: { before: pick(before), after: pick(after) } });
  return { before, after, loop: sidecar.outputs ?? null, gap: sidecar.gap ?? null, sidecar: join(loops, `${name}.json`) };
}
const keys = rows => rows.map(r => `${r.level}|${r.text}`);
/** Multiset difference a − b over finding rows. */
function minus(a, b) { const left = [...keys(b)]; return a.filter(r => { const i = left.indexOf(`${r.level}|${r.text}`); if (i >= 0) { left.splice(i, 1); return false; } return true; }); }
const sameRows = (a, b) => JSON.stringify([...keys(a)].sort()) === JSON.stringify([...keys(b)].sort());
const outsideCount = label => (label ? Number(/(\d+) outside/.exec(label)?.[1] ?? NaN) : NaN);
const snapshot = page => page.evaluate(() => {
  const s = window.__tpp.store.getState(); let save = null;
  try { const raw = JSON.parse(localStorage.getItem('tpp.save')); save = raw.state ?? raw; } catch { save = null; }
  const pick = o => o && { rooms: o.rooms, inventory: o.inventory, mode: o.mode, avatar: o.avatar && { x: o.avatar.x, y: o.avatar.y, facing: o.avatar.facing } };
  return { state: pick(s), save: pick(save), keys: Object.keys(localStorage).sort(), logLength: window.__tpp.log.lines().length };
});

async function acceptance(report) {
  const { context, page, errors } = await boot(1080);
  await ready(page);
  const pre = await snapshot(page);
  await row15(page);
  const opened = await read(page);
  step('a1-open-row15', 'row 15 (debug panel) opens the room editor; panel closed after', { editorOpen: opened.editorOpen, panelVisible: opened.panelVisible, debugHidden: await page.evaluate(() => document.querySelector('[data-panel=debugPanel]')?.hidden ?? null) }, opened.editorOpen && opened.panelVisible);
  const baseline = opened.findings;
  report.baseline = { count: baseline.length, rows: baseline, segmentsLabel: opened.segmentsLabel, floor3: opened.floor3 };
  await shot(page, 'work-015-3-baseline-1080', 1080, 'editor + panel at open over the Dog room; baseline findings', 'opened through row 15');
  // (a) 90 px drag of floor-3 toward floor-2 (fork 1).
  const drag = await loop(page, 'work-015-3-drag-warning', crop(860, 618), 'floor-3 dragged 90 px toward floor-2; the amber CHK-005-07 row appears', () => dragWorld(page, { x: 907, y: 618 }, { x: 817, y: 618 }));
  const gained = minus(drag.after.findings, baseline), lost = minus(baseline, drag.after.findings);
  const w = gained.filter(r => r.ids.includes('CHK-005-07'));
  step('a2-drag-warning', 'floor-3 at (817, 618); findings = baseline + exactly one CHK-005-07 warning at /slots/1 naming floor-3, amber',
    { floor3: drag.after.floor3, gained, lost, loop: drag.loop ?? drag.gap }, drag.after.floor3?.x === 817 && gained.length === 1 && lost.length === 0 && w.length === 1 && w[0].level === 'warning' && w[0].text.includes('/slots/1') && w[0].text.includes('floor-3'));
  await shot(page, 'work-015-3-warning-1080', 1080, 'after the 90 px drag: CHK-005-07 warning row', 'mouse drag');
  // Alt-drag the anchor out of the walk area.
  const anchor = await loop(page, 'work-015-3-anchor-error', crop(816, 560), 'Alt-drag of the floor-3 anchor to (816, 470): red segments and red rows', async () => {
    await page.keyboard.down('Alt'); await dragWorld(page, { x: 816, y: 649 }, { x: 816, y: 470 }); await page.keyboard.up('Alt');
  });
  const gainedE = minus(anchor.after.findings, drag.after.findings), errs = gainedE.filter(r => r.level === 'error');
  const c03 = errs.filter(r => r.ids.includes('CHK-005-03') && r.text.includes('/slots/2/anchor'));
  step('a3-anchor-error', 'anchor (816, 470); + CHK-005-03 (+CHK-007-06) error at /slots/2/anchor and CHK-007-07 errors; segments outside count rises',
    { floor3: anchor.after.floor3, gained: gainedE, segments: { before: opened.segmentsLabel, after: anchor.after.segmentsLabel }, loop: anchor.loop ?? anchor.gap },
    anchor.after.floor3?.anchor?.y === 470 && c03.length >= 1 && c03.some(r => r.ids.includes('CHK-007-06')) && errs.some(r => r.ids.includes('CHK-007-07')) && outsideCount(anchor.after.segmentsLabel) > outsideCount(opened.segmentsLabel));
  await shot(page, 'work-015-3-error-1080', 1080, 'after the Alt-drag: red segments to the anchor, red rows', 'Alt held through the mouse drag');
  // Undo twice (Meta+Z on the canvas).
  const undo = await loop(page, 'work-015-3-undo', crop(860, 560), 'Undo x2: the list returns to the baseline', async () => {
    await page.mouse.click(300, 250); await page.keyboard.press('Meta+KeyZ'); await page.waitForTimeout(700); await page.keyboard.press('Meta+KeyZ');
  });
  step('a4-undo-twice', 'findings equal the baseline; draft deep-equals the content room', { findingCount: undo.after.findings.length, sameAsBaseline: sameRows(undo.after.findings, baseline), draftEqualsContent: undo.after.draftEqualsContent, floor3: undo.after.floor3, loop: undo.loop ?? undo.gap },
    sameRows(undo.after.findings, baseline) && undo.after.draftEqualsContent === true);
  await shot(page, 'work-015-3-restored-1080', 1080, 'after Undo x2: baseline findings', 'Meta+Z twice');
  // Shift+Right nudge (select floor-3 by clicking its base handle first).
  await clickWorld(page, 907, 618);
  await page.keyboard.press('Shift+ArrowRight'); await page.waitForTimeout(400);
  const nudged = await read(page);
  step('a5-nudge', 'floor-3 (917, 618) anchor (916, 649); findings equal the baseline', { selection: nudged.selection, floor3: nudged.floor3, sameAsBaseline: sameRows(nudged.findings, baseline), gained: minus(nudged.findings, baseline), lost: minus(baseline, nudged.findings) },
    nudged.floor3?.x === 917 && nudged.floor3?.anchor?.x === 916 && sameRows(nudged.findings, baseline));
  // Copy JSON + Download.
  const serial = await page.evaluate(async () => (await import('/src/view/editor/serialize.ts')).serializeRoom(window.__tpp.context.roomEditor.draft()));
  await page.click('[data-panel=roomEditor] .tpp-editor-actions button:text-is("Copy JSON")'); await page.waitForTimeout(400);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-panel=roomEditor] .tpp-editor-actions button:text-is("Download")')]);
  const exportPath = join(exportDir, 'dog-room.json'); await dl.saveAs(exportPath);
  const bytes = readFileSync(exportPath, 'utf8');
  step('a6-export', 'clipboard text = downloaded bytes = serializeRoom(draft)', { clipLength: clip.length, downloadLength: bytes.length, serialLength: serial.length, suggestedFilename: dl.suggestedFilename() }, clip === bytes && bytes === serial);
  report.exportText = bytes;
  // Adjacency tool: floor-3 and floor-4 are authored adjacent, so the first pair removes, the second re-adds (then both undone).
  const adj = await loop(page, 'work-015-3-adjacency', crop(990, 618, 640, 360), 'A, floor-3 then floor-4 (pair toggled off), A, A, floor-3 then floor-4 (toggled back on), A', async () => {
    await page.mouse.click(300, 250); await page.keyboard.press('Escape'); await page.keyboard.press('KeyA'); report.adjActive = await page.evaluate(() => window.__tpp.context.roomEditor.adjacencyActive?.() ?? null);
    await clickWorld(page, 917, 618); report.adjFirst = await page.evaluate(() => window.__tpp.context.roomEditor.selection()); await page.waitForTimeout(400);
    await clickWorld(page, 1063, 618); await page.waitForTimeout(400); await page.keyboard.press('KeyA');
    report.adjMid = await read(page); await page.waitForTimeout(600);
    await page.keyboard.press('KeyA'); await clickWorld(page, 917, 618); await page.waitForTimeout(400); await clickWorld(page, 1063, 618); await page.waitForTimeout(400); await page.keyboard.press('KeyA');
  });
  const has = (s, a, b) => !!s?.[a]?.adjacent.includes(b);
  step('a7-adjacency', 'first pair: both adjacent lists lose each other; second pair: both regain each other (symmetric)',
    { before: { f3: adj.before.floor3?.adjacent, f4: adj.before.floor4?.adjacent }, mid: { f3: report.adjMid.floor3?.adjacent, f4: report.adjMid.floor4?.adjacent }, after: { f3: adj.after.floor3?.adjacent, f4: adj.after.floor4?.adjacent }, loop: adj.loop ?? adj.gap },
    has(adj.before, 'floor3', 'floor-4') && has(adj.before, 'floor4', 'floor-3') && !has(report.adjMid, 'floor3', 'floor-4') && !has(report.adjMid, 'floor4', 'floor-3') && has(adj.after, 'floor3', 'floor-4') && has(adj.after, 'floor4', 'floor-3'));
  steps.at(-1).observed.adjacencyActiveAfterA = report.adjActive; steps.at(-1).observed.firstClickSelection = report.adjFirst; delete report.adjMid; delete report.adjActive; delete report.adjFirst;
  // Undo only the commits the adjacency tool actually made (history delta), so a refused pair cannot undo the nudge.
  const adjCommits = (adj.after.historyPast ?? 0) - (adj.before.historyPast ?? 0); steps.at(-1).observed.adjacencyCommits = adjCommits;
  for (let i = 0; i < adjCommits; i++) await page.keyboard.press('Meta+KeyZ');
  await page.waitForTimeout(300);
  // Walk vertex 0 drag + Undo.
  // Vertex 2 (1441, 709): vertex 0 (688, 568) sits under the to-street door handle, which wins the hit.
  const vtx = await loop(page, 'work-015-3-vertex', crop(1420, 700), 'walk vertex 2 dragged (1441, 709) -> (1401, 689), then Undo', async () => {
    await dragWorld(page, { x: 1441, y: 709 }, { x: 1401, y: 689 }, 1200, 24); report.vertexMid = (await read(page)).vertex2; await page.waitForTimeout(700);
    await page.keyboard.press('Meta+KeyZ');
  });
  step('a8-vertex', 'vertex 2 moves to (1401, 689) then Undo restores (1441, 709)', { mid: report.vertexMid, after: vtx.after.vertex2, loop: vtx.loop ?? vtx.gap },
    report.vertexMid?.x === 1401 && report.vertexMid?.y === 689 && vtx.after.vertex2?.x === 1441 && vtx.after.vertex2?.y === 709);
  delete report.vertexMid;
  const back = await page.evaluate(async () => (await import('/src/view/editor/serialize.ts')).serializeRoom(window.__tpp.context.roomEditor.draft()));
  step('a9-draft-equals-export', 'after the adjacency undo and vertex undo the draft serializes to the export', { equal: back === bytes }, back === bytes);
  // (f) latency.
  let stats = (await read(page)).checkStats;
  report.latency = { observed: stats, extraControllerCommits: 0 };
  if (!stats || stats.runs < 20) {
    report.latency.extraControllerCommits = await page.evaluate(async need => {
      const e = window.__tpp.context.roomEditor;
      for (let i = 0; i < need; i++) { e.commit(d => { d.slots[0].x += i % 2 ? -1 : 1; }); await new Promise(r => requestAnimationFrame(() => r())); }
      for (let i = 0; i < need; i++) e.undo();
      return need;
    }, 20 - (stats?.runs ?? 0) + 2);
    stats = (await read(page)).checkStats;
  }
  report.latency.final = stats; report.latency.debounce = stats && stats.maxMs > 16.7 ? 'coalesce to one run per frame engaged (max > 16.7 ms)' : 'no debounce needed (max <= 16.7 ms, one frame)';
  step('f-latency', '{lastMs, meanMs, maxMs, runs >= 20} read from the panel with the debounce decision', report.latency, stats && stats.runs >= 20 && Number.isFinite(stats.maxMs));
  // (d) close and compare.
  await page.mouse.click(300, 250); await page.keyboard.press('KeyE'); await page.waitForTimeout(500);
  const post = await snapshot(page);
  const lines = await page.evaluate(() => window.__tpp.log.lines());
  const openAt = lines.findIndex(l => l.type === 'ui.roomEditor' && l.open === true), closeAt = lines.findIndex((l, i) => i > openAt && l.type === 'ui.roomEditor' && l.open === false);
  const between = openAt >= 0 && closeAt > openAt ? lines.slice(openAt + 1, closeAt) : [];
  const banned = between.filter(l => /^charm\./.test(l.type) || ['mode.changed', 'scene.changed', 'input.tap', 'input.drag', 'debug.applied', 'action.rejected'].includes(l.type));
  const counts = between.reduce((m, l) => ({ ...m, [l.type]: (m[l.type] ?? 0) + 1 }), {});
  const addedKeys = post.keys.filter(k => !pre.keys.includes(k)), removedKeys = pre.keys.filter(k => !post.keys.includes(k));
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const d = { open: openAt >= 0, close: closeAt > openAt, banned, recordCounts: counts, addedKeys, removedKeys,
    state: { rooms: same(pre.state.rooms, post.state.rooms), inventory: same(pre.state.inventory, post.state.inventory), mode: same(pre.state.mode, post.state.mode), avatar: same(pre.state.avatar, post.state.avatar) },
    save: { rooms: same(pre.save?.rooms, post.save?.rooms), inventory: same(pre.save?.inventory, post.save?.inventory), mode: same(pre.save?.mode, post.save?.mode), avatar: same(pre.save?.avatar, post.save?.avatar) } };
  step('d-no-state-writes', 'rooms/inventory/mode/avatar unchanged in state and tpp.save; only tpp.roomDraft.dog-room added; no banned record between ui.roomEditor open/close (ticking-sim records listed)', d,
    d.open && d.close && banned.length === 0 && Object.values(d.state).every(Boolean) && Object.values(d.save).every(Boolean) && removedKeys.length === 0 && addedKeys.every(k => k === KEY));
  writeFileSync(join(lane, 'acceptance-log.jsonl'), `${lines.map(l => JSON.stringify(l)).join('\n')}\n`);
  report.errorsAcceptance = errors;
  // (b) round trip: the author's paste simulated in this worktree, then reload.
  try {
    writeFileSync(roomFile, bytes);
    await page.waitForTimeout(1500);
    await page.reload(); await ready(page);
    const rt = await page.evaluate(([text, key]) => {
      const room = window.__tpp.context.content.rooms['dog-room'], canon = v => JSON.stringify((function c(x) { return Array.isArray(x) ? x.map(c) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, c(x[k])])) : x; })(v));
      return { equal: canon(room) === canon(JSON.parse(text)), floor3: room.slots.find(s => s.id === 'floor-3'), keyBeforeOpen: localStorage.getItem(key) !== null };
    }, [bytes, KEY]);
    await openWithE(page);
    const reopened = await read(page);
    step('b1-reload-content', 'after the simulated paste + reload: content room deep-equals the export (and the pre-export draft); stale draft key discarded silently on open',
      { ...rt, promptShown: reopened.prompt, keyAfterOpen: reopened.draftKey !== null }, rt.equal && rt.floor3.x === 917 && rt.floor3.anchor.x === 916 && reopened.prompt === null && reopened.draftKey === null);
    await page.mouse.click(300, 250); await page.keyboard.press('KeyE'); await page.waitForTimeout(400);
    await page.getByRole('button', { name: /decorate/i }).first().click(); await page.waitForTimeout(800);
    const parity = await page.evaluate(async () => {
      const { outlinePoints } = await import('/src/view/objects/SlotOutline.ts');
      const interior = window.__tpp.game.scene.getScene('Interior'), o = interior.outlines.get('floor-3');
      const expect = outlinePoints({ x: 917, y: 618, sizeClass: 'small' }).map(p => [p.x, p.y]), got = o.points.map(p => [p.x, p.y]);
      return { mode: window.__tpp.store.getState().mode, visible: o.visible, got, expect, equal: JSON.stringify(got) === JSON.stringify(expect) };
    });
    await shot(page, 'work-015-3-design-outline-1080', 1080, 'after the simulated paste + reload, design mode: floor-3 outline at (917, 618)', 'Decorate clicked');
    step('b2-outline-parity', 'design mode: floor-3 SlotOutline points = outlinePoints({x: 917, y: 618, sizeClass: small})', parity, parity.equal && parity.visible && parity.mode === 'design');
  } finally {
    execFileSync('git', ['-C', gameDir, 'checkout', '--', 'src/content/rooms/dog-room.json']);
    report.restore = { porcelain: execFileSync('git', ['-C', gameDir, 'status', '--porcelain', 'src/content']).toString() };
    await new Promise(r => setTimeout(r, 2500)); // let Vite's restore reload land before the next context boots
    step('b3-restore', 'git checkout -- restores dog-room.json; git status --porcelain src/content empty', report.restore, report.restore.porcelain === '');
  }
  report.errorsRoundTrip = { consoleErrors: errors.consoleErrors.slice(), pageErrors: errors.pageErrors.slice() };
  await context.close();
}

async function recovery(report) {
  const { context, page, errors } = await boot(1080);
  await ready(page); await openWithE(page);
  await dragWorld(page, { x: 907, y: 618 }, { x: 817, y: 618 });
  const afterDrag = await read(page);
  await page.reload(); await ready(page); await openWithE(page);
  const prompt = await read(page);
  await shot(page, 'work-015-3-resume-prompt-1080', 1080, 'after a reload mid-edit: Resume draft / Discard prompt', 'reload then E');
  await page.click('[data-panel=roomEditor] [data-action=resume]'); await page.waitForTimeout(300);
  const resumed = await page.evaluate(key => {
    const stored = localStorage.getItem(key), draft = window.__tpp.context.roomEditor.draft();
    const canon = v => JSON.stringify((function c(x) { return Array.isArray(x) ? x.map(c) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, c(x[k])])) : x; })(v));
    return { deepEqual: stored !== null && canon(JSON.parse(stored)) === canon(draft), floor3: draft.slots.find(s => s.id === 'floor-3') };
  }, KEY);
  await shot(page, 'work-015-3-resumed-1080', 1080, 'after Resume: draft with floor-3 at (817, 618)', 'Resume clicked');
  step('c1-resume', 'reload mid-edit -> prompt; Resume -> draft deep-equals JSON.parse(localStorage[tpp.roomDraft.dog-room])', { dragFloor3: afterDrag.floor3, prompt: prompt.prompt, ...resumed }, afterDrag.floor3?.x === 817 && !!prompt.prompt && resumed.deepEqual && resumed.floor3.x === 817);
  await page.reload(); await ready(page); await openWithE(page);
  const prompt2 = await read(page);
  await page.click('[data-panel=roomEditor] [data-action=discard]'); await page.waitForTimeout(300);
  const discarded = await read(page);
  step('c2-discard', 'second reload -> prompt; Discard -> key removed, draft equals the content room', { prompt: prompt2.prompt, keyPresent: discarded.draftKey !== null, draftEqualsContent: discarded.draftEqualsContent }, !!prompt2.prompt && discarded.draftKey === null && discarded.draftEqualsContent === true);
  report.errorsRecovery = errors;
  await context.close();
}

async function street(report) {
  const { context, page, errors } = await boot(1080, { save: '', url: '/?lenient=1&preview=geometry' });
  await ready(page, 'Street');
  await page.mouse.click(300, 250);
  await page.keyboard.press('Backquote'); await page.waitForTimeout(400);
  const row = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.tpp-debug-row')].find(x => x.querySelector('label').textContent === 'Room editor');
    const cap = r.querySelector('small');
    return { disabled: r.querySelector('[role=switch]').disabled, caption: cap.textContent, captionHidden: cap.hidden };
  });
  await page.keyboard.press('Backquote'); await page.waitForTimeout(300);
  await page.mouse.click(300, 250); await page.keyboard.press('KeyE'); await page.waitForTimeout(500);
  const s = await page.evaluate(() => {
    const st = window.__tpp.game.scene.getScene('Street'), list = st.children.list;
    const geometry = st.preview?.layers.geometry;
    return { scene: window.__tpp.store.getState().scene.kind, editor: !!window.__tpp.context.roomEditor, roomEditorRecords: window.__tpp.log.lines().filter(l => l.type === 'ui.roomEditor').length,
      geometryObjects: geometry ? geometry.objects.length : null, interactiveHighDepth: list.filter(o => o.depth >= 10000 && o.input && o.input.enabled).length, highDepthObjects: list.filter(o => o.depth >= 10000).length };
  });
  await shot(page, 'work-015-3-street-readonly-1080', 1080, 'fresh boot on the street with ?preview=geometry: geometry layer drawn, read-only', 'E pressed: no editor');
  step('e-street-readonly', 'geometry layer drawn; row 15 disabled with "interiors only"; E records no ui.roomEditor; no interactive object at depth >= 10000', { row, ...s },
    s.scene === 'street' && s.geometryObjects > 0 && row.disabled && /interiors only/.test(row.caption) && !row.captionHidden && !s.editor && s.roomEditorRecords === 0 && s.interactiveHighDepth === 0);
  report.errorsStreet = errors;
  await context.close();
}

async function pass823(report) {
  const { context, page, errors } = await boot(823);
  await ready(page); await openWithE(page);
  const s = await read(page);
  await shot(page, 'work-015-3-baseline-823', 823, 'editor + 440 px panel at 1920x823 with the baseline findings', 'opened with E');
  step('g-823', 'editor + panel open at 1920x823 with the baseline findings', { findingCount: s.findings.length, panelVisible: s.panelVisible, sameAsBaseline: sameRows(s.findings, report.baseline.rows) }, s.panelVisible && sameRows(s.findings, report.baseline.rows));
  report.errors823 = errors;
  await context.close();
}

browser = await chromium.launch({ headless: true, executablePath });
const report = { work: 'WORK-015-3', sha, captured_at: new Date().toISOString(), chromium: browser.version(), url: `${base}${URL_PATH}`, steps };
for (const [name, fn] of [['acceptance', acceptance], ['recovery', recovery], ['street', street], ['pass823', pass823]]) {
  try { await fn(report); } catch (error) { step(`${name}-failure`, 'no exception', String(error?.stack ?? error).slice(0, 1200), false); }
}
await browser.close();
rmSync(tmpRoot, { recursive: true, force: true });
const errs = Object.keys(report).filter(k => k.startsWith('errors')).flatMap(k => [...report[k].consoleErrors, ...report[k].pageErrors]);
const logText = readFileSync(join(lane, 'acceptance-log.jsonl'), 'utf8');
step('zero-errors', 'zero console/page errors; zero asset.loadError', { consoleAndPageErrors: errs, assetLoadErrors: (logText.match(/"asset\.loadError"/g) ?? []).length }, errs.length === 0 && !logText.includes('"asset.loadError"'));
delete report.exportText;
writeFileSync(join(lane, 'acceptance-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(steps.map(s => [s.id, s.ok])));

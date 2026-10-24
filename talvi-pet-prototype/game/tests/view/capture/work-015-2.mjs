// WORK-015-2 room editor side panel stills and state reads (Playwright library, pinned chromium-1243 by executablePath; no install).
//   node tests/view/capture/work-015-2.mjs <dog-room-intro-done.real.json>
//   (dev server on 5198; TPP_BASE / TPP_EVIDENCE override.) No loops in this lane (WORK-015-3 records the drag-with-findings loops).
// Every fact in panel-report.json is read from the page: window.__tpp (context.roomEditor, log, storage) and the panel DOM
// (`.tpp-editor-findings li[data-ids]`, `section.dataset.checkStats`); nothing is assumed.
import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const base = process.env.TPP_BASE ?? 'http://127.0.0.1:5198';
const evidence = process.env.TPP_EVIDENCE ?? '/Users/joefrancia/Desktop/Talvi/Talvi-Concepts/talvi-pet-prototype/phase-4-build/runs/RUN-001/evidence';
const executablePath = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const lane = join(evidence, 'WORK-015-2'), captures = join(lane, 'captures');
mkdirSync(captures, { recursive: true });
const introDone = readFileSync(process.argv[2], 'utf8');
const sha = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const URL_PATH = '/?lenient=1';
const KEY = 'tpp.roomDraft.dog-room';
let browser;

async function boot(height, save = introDone) {
  const context = await browser.newContext({ viewport: { width: 1920, height }, deviceScaleFactor: 1 });
  await context.addInitScript(text => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear(); localStorage.setItem('tpp.save', text); sessionStorage.setItem('seeded', '1');
  }, save);
  const page = await context.newPage(), errors = { consoleErrors: [], pageErrors: [] };
  page.on('console', m => { if (m.type() === 'error') errors.consoleErrors.push(m.text().slice(0, 400)); });
  page.on('pageerror', e => errors.pageErrors.push(String(e)));
  await page.goto(`${base}${URL_PATH}`);
  await ready(page);
  return { context, page, errors };
}
async function ready(page) {
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Interior'), null, { timeout: 30000 });
  await page.waitForTimeout(800);
  const dismiss = page.locator('#findings-banner [data-action="dismiss"]');
  if (await dismiss.count() && await dismiss.isVisible()) await dismiss.click();
}
async function openEditor(page) {
  await page.mouse.click(400, 300); // focus the page (not a field)
  await page.keyboard.press('KeyE');
  await page.waitForFunction(() => !!window.__tpp.context.roomEditor && !document.querySelector('[data-panel=roomEditor]').hidden, null, { timeout: 5000 });
  await page.waitForTimeout(400);
}
const read = page => page.evaluate(key => {
  const { context, log } = window.__tpp, panel = document.querySelector('[data-panel=roomEditor]'), editor = context.roomEditor ?? null;
  const rows = [...panel.querySelectorAll('.tpp-editor-findings li')].map(li => ({ ids: li.dataset.ids, level: li.dataset.level, color: li.style.color, text: li.textContent, select: li.dataset.select ?? null }));
  const hudHidden = [...document.querySelectorAll('#panels > [data-panel]')].filter(el => el.style.visibility === 'hidden').map(el => el.dataset.panel);
  const f3 = editor?.draft().slots.find(s => s.id === 'floor-3');
  return {
    panelVisible: !panel.hidden, panelRect: (({ x, width, height }) => ({ x, width, height }))(panel.getBoundingClientRect()), hudHidden,
    findings: rows, findingCount: rows.length, checkStats: panel.dataset.checkStats ? JSON.parse(panel.dataset.checkStats) : null,
    floor3: f3 ? { x: f3.x, y: f3.y, anchor: f3.anchor } : null, canUndo: editor?.canUndo() ?? null,
    draftKey: localStorage.getItem(key), prompt: (p => (p.hidden ? null : p.textContent))(panel.querySelector('.tpp-editor-prompt')),
    status: panel.querySelector('.tpp-editor-status').textContent,
    records: log.lines().filter(l => ['ui.roomEditor', 'ui.preview', 'app.error'].includes(l.type)),
  };
}, KEY);
const pagePoint = (page, x, y) => page.evaluate(([x, y]) => {
  const interior = window.__tpp.game.scene.getScene('Interior'), rect = window.__tpp.game.canvas.getBoundingClientRect(), scale = rect.width / 1920;
  return { x: rect.left + x * scale, y: rect.top + (y - interior.cameras.main.scrollY) * scale };
}, [x, y]);
async function dragWorld(page, from, to, ms = 600, steps = 12) {
  const a = await pagePoint(page, from.x, from.y), b = await pagePoint(page, to.x, to.y);
  await page.mouse.move(a.x, a.y); await page.waitForTimeout(100); await page.mouse.down(); await page.waitForTimeout(100);
  for (let i = 1; i <= steps; i++) { await page.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await page.waitForTimeout(ms / steps); }
  await page.waitForTimeout(100); await page.mouse.up(); await page.waitForTimeout(300);
}
async function shot(page, point, height, target, note) {
  const png = join(captures, `${point}.png`);
  await page.screenshot({ path: png });
  const state = await read(page);
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify({ milestone: 'MILESTONE-005', work: 'WORK-015-2', kind: 'screenshot', point, target, sha,
    captured_at: new Date().toISOString(), viewport: { width: 1920, height }, bytes: statSync(png).size, tool: 'playwright-library', binary: executablePath,
    version: browser.version(), url: URL_PATH, seededSave: 'dog-room-intro-done.real.json', note, state }, null, 2)}\n`);
  return { png, state };
}
const ids = state => state.findings.map(f => f.ids);

async function main1080(report) {
  const { context, page, errors } = await boot(1080);
  await openEditor(page);
  const baseline = await shot(page, 'work-015-2-panel-baseline-1080', 1080, 'editor open with the side panel docked right 440 px; baseline findings; HUD, want panel, toasts hidden', 'opened with E');
  report.baseline = { findingCount: baseline.state.findingCount, ids: ids(baseline.state), hudHidden: baseline.state.hudHidden, panelRect: baseline.state.panelRect };
  await dragWorld(page, { x: 907, y: 618 }, { x: 817, y: 618 });
  const warning = await shot(page, 'work-015-2-panel-warning-1080', 1080, 'after the floor-3 drag 90 px toward floor-2: amber CHK-005-07 row', 'mouse drag of the floor-3 base handle');
  report.afterDrag = { floor3: warning.state.floor3, ids: ids(warning.state), chk00507: warning.state.findings.filter(f => f.ids?.includes('CHK-005-07')) };
  await page.keyboard.down('Alt'); await dragWorld(page, { x: 817, y: 618 }, { x: 817, y: 439 }); await page.keyboard.up('Alt');
  const error = await shot(page, 'work-015-2-panel-error-1080', 1080, 'after the Alt-drag of the floor-3 anchor out of the walk area: red rows', 'Alt held through the mouse drag');
  report.afterAnchor = { floor3: error.state.floor3, ids: ids(error.state), errors: error.state.findings.filter(f => f.level === 'error').map(f => ({ ids: f.ids, text: f.text, color: f.color })) };
  report.latency = await latency(page);
  report.stills = [baseline.png, warning.png, error.png];
  await page.reload(); await ready(page);
  report.afterReload = { draftKeyPresent: (await read(page)).draftKey !== null };
  await openEditor(page);
  const prompt = await shot(page, 'work-015-2-resume-prompt-1080', 1080, 'after a reload mid-edit: Resume draft / Discard prompt', 'page.reload() then E');
  report.stills.push(prompt.png);
  await page.click('[data-panel=roomEditor] [data-action=resume]'); await page.waitForTimeout(300);
  report.resume = await page.evaluate(key => {
    const stored = localStorage.getItem(key), draft = window.__tpp.context.roomEditor.draft();
    // Deep equality with sorted keys (zod's parse output orders wander-point keys x, y, id; the serializer writes id, x, y).
    const canon = v => (Array.isArray(v) ? v.map(canon) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canon(v[k])])) : v);
    return { prompt: true, deepEqual: JSON.stringify(canon(JSON.parse(stored))) === JSON.stringify(canon(draft)), historyEmpty: !window.__tpp.context.roomEditor.canUndo(),
      storedFloor3: JSON.parse(stored).slots.find(s => s.id === 'floor-3'), draftFloor3: draft.slots.find(s => s.id === 'floor-3') };
  }, KEY);
  report.resume.prompt = prompt.state.prompt;
  report.errors1080 = errors;
  await context.close();
}

/** 20 commits through the controller (one-pixel nudges of floor-1 alternating ±1), each timed by the panel's runner. */
async function latency(page) {
  return page.evaluate(async () => {
    const editor = window.__tpp.context.roomEditor, panel = document.querySelector('[data-panel=roomEditor]');
    const before = JSON.parse(panel.dataset.checkStats).runs;
    for (let i = 0; i < 20; i++) {
      editor.commit(d => { d.slots[0].x += i % 2 ? -1 : 1; });
      await new Promise(r => requestAnimationFrame(() => r()));
    }
    const stats = JSON.parse(panel.dataset.checkStats);
    for (let i = 0; i < 20; i++) editor.undo();
    await new Promise(r => requestAnimationFrame(() => r()));
    return { ...stats, commitsMeasured: stats.runs - before, overFrameBudget: stats.maxMs > 16.7 };
  });
}

async function main823(report) {
  const { context, page, errors } = await boot(823);
  await openEditor(page);
  const s = await shot(page, 'work-015-2-panel-baseline-823', 823, 'editor + panel at 1920x823 (panel scrolls inside its own column)', 'opened with E');
  report.stills.push(s.png); report.baseline823 = { findingCount: s.state.findingCount, panelRect: s.state.panelRect }; report.errors823 = errors;
  await context.close();
}

async function street(report) {
  const save = JSON.parse(introDone);
  save.state.avatar = { ...save.state.avatar, x: 700, y: 625, facing: 'up', immunityMs: 0, facingCandidate: null };
  const { context, page, errors } = await boot(1080, JSON.stringify(save));
  await page.mouse.click(400, 300);
  await page.keyboard.down('KeyW');
  try { await page.waitForFunction(() => window.__tpp.store.getState().scene.kind === 'street', null, { timeout: 6000 }); } finally { await page.keyboard.up('KeyW'); }
  await page.waitForFunction(() => window.__tpp.game.scene.isActive('Street'), null, { timeout: 5000 }); await page.waitForTimeout(1200);
  await page.keyboard.press('Backquote'); await page.waitForTimeout(400);
  const row = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.tpp-debug-row')].find(x => x.querySelector('label').textContent === 'Room editor');
    r.scrollIntoView({ block: 'center' });
    const cap = r.querySelector('small');
    return { disabled: r.querySelector('[role=switch]').disabled, caption: cap.textContent, captionHidden: cap.hidden, scene: window.__tpp.store.getState().scene.kind };
  });
  await page.waitForTimeout(200);
  const png = join(captures, 'work-015-2-street-row15-1080.png');
  await page.screenshot({ path: png });
  writeFileSync(png.replace(/\.png$/, '.json'), `${JSON.stringify({ milestone: 'MILESTONE-005', work: 'WORK-015-2', kind: 'screenshot', point: 'work-015-2-street-row15-1080',
    target: 'debug panel on the street: row 15 disabled with the caption "interiors only"', sha, captured_at: new Date().toISOString(), viewport: { width: 1920, height: 1080 },
    bytes: statSync(png).size, tool: 'playwright-library', binary: executablePath, version: browser.version(), url: URL_PATH, seededSave: 'dog-room-intro-done.real.json (avatar at the door, walked out with W)', state: row }, null, 2)}\n`);
  report.stills.push(png); report.street = row; report.errorsStreet = errors;
  await context.close();
}

browser = await chromium.launch({ headless: true, executablePath });
const report = { work: 'WORK-015-2', sha, captured_at: new Date().toISOString(), chromium: browser.version(), url: `${base}${URL_PATH}` };
try {
  await main1080(report);
  await main823(report);
  await street(report);
} catch (error) { report.failure = String(error?.stack ?? error).slice(0, 1200); }
await browser.close();
report.consoleErrorsTotal = ['errors1080', 'errors823', 'errorsStreet'].reduce((n, k) => n + (report[k] ? report[k].consoleErrors.length + report[k].pageErrors.length : 0), 0);
writeFileSync(join(lane, 'panel-report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ baseline: report.baseline?.findingCount, latency: report.latency, resume: report.resume, street: report.street, consoleErrorsTotal: report.consoleErrorsTotal, failure: report.failure ?? null }));

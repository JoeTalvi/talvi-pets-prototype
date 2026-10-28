// WORK-025-2 door-vs-joystick geometry, R-6 seam scan, panels page and avatar facing stills (Playwright library, pinned chromium-1243; no install).
//   TPP_BASE=http://127.0.0.1:5204 TPP_EVIDENCE=<EV> TPP_WORK=WORK-025-2 TPP_MILESTONE=MILESTONE-007 node tests/view/capture/work-025-2.mjs <door|seam|facing> <before|after>
// Strict boot. Every number is read from window.__tpp (camera, joystick, content) or the screenshot pixels, never typed in.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha, base, launch, boot, waitScene, getState, until, makeFixture, shot, writeJson, errorsSummary, lines } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const [mode, label = 'after'] = process.argv.slice(2);
const captures = join(EV, 'captures'), HEIGHTS = [1080, 897, 823], MARGIN = 40;
const fixtures = {};
const save = name => (fixtures[name] ??= makeFixture(name.endsWith('.steps') ? ['--steps', `tests/view/capture/${name}.json`] : ['--scenario', name]).text);
const errors = [];
const drain = async page => { for (let i = 0; i < 20 && (await getState(page)).dialogue.current; i++) { await page.locator('[data-panel="dialogue"]').click({ position: { x: 300, y: 60 } }); await page.waitForTimeout(350); } };
const close = async (w, name) => { errors.push({ window: name, ...errorsSummary(w.errors, await lines(w.page)) }); await w.context.close(); };

/** World-space joystick base rect vs the Starter House door rect at the current EXPAND height. */
const doorRead = page => page.evaluate(() => {
  const { game, content } = window.__tpp, st = game.scene.getScene('Street'), cam = st.cameras.main, j = st.joystick.base;
  const half = j.displayWidth / 2, door = content.street.houses[0].door.rect;
  const baseRect = { x: j.x - half + cam.scrollX, y: j.y - half + cam.scrollY, w: half * 2, h: half * 2 };
  const ox = Math.min(baseRect.x + baseRect.w, door.x + door.w) - Math.max(baseRect.x, door.x), oy = Math.min(baseRect.y + baseRect.h, door.y + door.h) - Math.max(baseRect.y, door.y);
  return { H: game.scale.gameSize.height, scroll: { x: cam.scrollX, y: cam.scrollY }, joystickVisible: j.visible, baseCentreViewport: { x: j.x, y: j.y }, baseRect, door,
    house: { x: content.street.houses[0].x, y: content.street.houses[0].y }, overlap: ox > 0 && oy > 0, overlapPx: { x: Math.max(0, ox), y: Math.max(0, oy) },
    clearanceX: door.x - (baseRect.x + baseRect.w) };
});

async function door() {
  const out = join(EV, 'door-geometry.json'), prior = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : {};
  const rows = [];
  for (const H of HEIGHTS) {
    const w = await boot(await browserP, { height: H, query: '' });
    await waitScene(w.page, 'Street', 1200); await drain(w.page);
    await until(w.page, () => window.__tpp.game.scene.getScene('Street').joystick.base.visible, null, 5000).catch(() => null);
    const read = await doorRead(w.page);
    read.still = await shot(w.page, await browserP, captures, `street-door-joystick-${H}-${label}`, { save: 'fresh (none), opening dialogue drained', label });
    rows.push(read); await close(w, `door-${H}-${label}`);
  }
  const ok = rows.every(r => !r.overlap && r.clearanceX >= MARGIN);
  writeJson(out, { ...prior, work: 'WORK-025-2', margin: MARGIN, method: 'joystick.base world rect (viewport + camera scroll) vs content.street.houses[0].door.rect; no notch emulation (safe-area-left 0)',
    [label]: { sha, rows, clearAtEveryHeight: ok } });
  console.log(JSON.stringify(rows.map(r => [r.H, r.overlap, r.clearanceX])));
}

/** Row-luminance seam detector over a PNG crop, run in a blank page canvas. */
async function seamRows(page, png, band) {
  return page.evaluate(async ([b64, band]) => {
    const img = new Image(); img.src = `data:image/png;base64,${b64}`; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data, L = (x, y) => { const i = (y * c.width + x) * 4; return 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; };
    const rows = [];
    for (let y = Math.max(1, band[0]); y <= Math.min(c.height - 2, band[1]); y++) {
      let hits = 0, sum = 0;
      for (let x = 0; x < c.width; x++) { const a = L(x, y) - L(x, y - 1), b = L(x, y) - L(x, y + 1); if (Math.abs(a) > 6 && Math.abs(b) > 6 && Math.sign(a) === Math.sign(b)) hits++; sum += Math.min(Math.abs(a), Math.abs(b)); }
      rows.push({ y, hitFraction: Math.round(hits / c.width * 1000) / 1000, meanDelta: Math.round(sum / c.width * 100) / 100 });
    }
    return rows;
  }, [png.toString('base64'), band]);
}

async function scanPanel(w, H) {
  const box = await w.page.locator('.tpp-reveal-panel').boundingBox(), scale = await w.page.evaluate(() => Number(getComputedStyle(document.querySelector('#overlay')).getPropertyValue('--overlay-scale')) || 1);
  // The body width minus the 100 px corners on each side (the stretched edge + fill seam region), as a horizontal crop.
  const edge = 100 * scale, clip = { x: box.x + edge + 4, y: box.y, width: box.width - 2 * edge - 8, height: box.height };
  // Frame-only scan: the panel's rows and image sit across the scanned bands, so they are hidden for this one screenshot.
  await w.page.addStyleTag({ content: '.tpp-reveal-panel > *{visibility:hidden !important}' }); await w.page.waitForTimeout(200);
  const png = await w.page.screenshot({ clip });
  const top = await seamRows(w.page, png, [Math.round(edge - 6), Math.round(edge + 6)]), bottom = await seamRows(w.page, png, [Math.round(clip.height - edge - 6), Math.round(clip.height - edge + 6)]);
  const crop = { x: box.x, y: box.y + edge - 30, width: box.width, height: 60 };
  await w.page.screenshot({ path: join(captures, `crop-${H}-topline-${label}.png`), clip: crop });
  const worst = rows => rows.reduce((m, r) => (r.hitFraction > m.hitFraction ? r : m), { hitFraction: 0 });
  return { H, overlayScale: scale, body: box, edgeScreenPx: edge, top: worst(top), bottom: worst(bottom), seam: worst(top).hitFraction >= 0.6 || worst(bottom).hitFraction >= 0.6, topRows: top, bottomRows: bottom };
}

async function seam() {
  const rows = [];
  for (const H of [823, 1080]) {
    const w = await boot(await browserP, { height: H, save: save('ack-phase-4'), query: '' });
    await waitScene(w.page, 'Street', 1000);
    await drain(w.page);
    await until(w.page, () => { const l = document.querySelector('.tpp-reveal-link'); return l && !l.hidden && !l.disabled; }, null, 15000);
    await w.page.locator('.tpp-reveal-link').click();
    await until(w.page, () => !document.querySelector('.tpp-revealPanel').hidden, null, 3000); await w.page.waitForTimeout(500);
    const still = await shot(w.page, await browserP, captures, `screen-12-reveal-${H}-${label}`, { save: 'ack-phase-4 (make-fixture)', label });
    rows.push({ ...(await scanPanel(w, H)), still }); await close(w, `seam-${H}-${label}`);
  }
  const ctx = await (await browserP).newContext({ viewport: { width: 1920, height: 823 }, deviceScaleFactor: 1 }), page = await ctx.newPage();
  await page.goto(`${base}/tools/panels.html`); await page.waitForTimeout(1500);
  const panels = await page.evaluate(() => [...new Set([...document.querySelectorAll('[class*="ns-"]')].flatMap(e => [...e.classList].filter(c => c.startsWith('ns-'))))].map(cls => {
    const e = document.querySelector(`.${cls}`), s = getComputedStyle(e), b = getComputedStyle(e, '::before'), r = e.getBoundingClientRect();
    // .ns-switch is the track + knob container and carries no border image of its own.
    if (cls === 'ns-switch') return { cls, container: true, borderImage: 'n/a (container of ns-switch-track / ns-switch-knob)', w: Math.round(r.width), h: Math.round(r.height) };
    return { cls, borderImage: (s.borderImageSource !== 'none' ? s.borderImageSource : b.borderImageSource).replace(/^.*\/assets\//, '').replace(/"\)$/, ''), w: Math.round(r.width), h: Math.round(r.height) };
  }));
  const panelsStill = await shot(page, await browserP, captures, `panels-823-${label}`, { url: `${base}/tools/panels.html`, label }); await ctx.close();
  const prior = existsSync(join(EV, 'seam-scan.json')) ? JSON.parse(readFileSync(join(EV, 'seam-scan.json'), 'utf8')) : {};
  writeJson(join(EV, 'seam-scan.json'), { ...prior, work: 'WORK-025-2', rule: 'seam = a row whose luminance differs from both neighbours (same sign) by > 6/255 on >= 60 % of the stretched body width, scanned at top + 100 css px ± 6 and bottom − 100 ± 6',
    [label]: { sha, css: readFileSync('src/ui/styles/nineslice.css', 'utf8').split('\n').find(l => l.startsWith('.ns-modal')), panels: rows.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'topRows' && k !== 'bottomRows'))), rowsDetail: rows.map(r => ({ H: r.H, top: r.topRows, bottom: r.bottomRows })),
      panelsPage: { still: panelsStill, classes: panels, everyClassRenders: panels.every(p => p.container || (p.borderImage && p.borderImage !== 'none' && p.w > 0 && p.h > 0)) } } });
  console.log(JSON.stringify(rows.map(r => [r.H, r.seam, r.top.hitFraction, r.bottom.hitFraction])), panels.length);
}

async function facing() {
  const w = await boot(await browserP, { height: 1080, query: '' });
  await waitScene(w.page, 'Street', 1000); await drain(w.page);
  const out = [];
  // The walk band is 160 px tall at ≈ 760 px/s: vertical holds stay short so the read lands while the sim still moves the avatar.
  for (const [dir, key, ms] of [['right', 'KeyD', 300], ['up', 'KeyW', 90], ['down', 'KeyS', 90], ['left', 'KeyA', 300]]) {
    await w.page.keyboard.down(key); await w.page.waitForTimeout(ms);
    const read = await w.page.evaluate(() => { const a = window.__tpp.game.scene.getScene('Street').avatar; return { anim: a.anims.currentAnim?.key, flipX: a.flipX, x: a.x, y: a.y, facing: window.__tpp.store.getState().avatar.facing }; });
    const still = await shot(w.page, await browserP, captures, `avatar-facing-${dir}`, { key, read });
    await w.page.keyboard.up(key); await w.page.waitForTimeout(200);
    const idle = await w.page.evaluate(() => window.__tpp.game.scene.getScene('Street').avatar.anims.currentAnim?.key);
    out.push({ dir, key, ...read, idleAfter: idle, still });
  }
  await close(w, 'facing-1080');
  writeJson(join(EV, 'avatar-facing.json'), { work: 'WORK-025-2', sha, rows: out, ok: out.every(r => r.anim === `avatar-walk-${r.dir === 'left' || r.dir === 'right' ? 'side' : r.dir}` && r.flipX === (r.dir === 'left') && r.idleAfter?.startsWith('avatar-idle-')) });
  console.log(JSON.stringify(out.map(r => [r.dir, r.anim, r.flipX, r.idleAfter])));
}

const browserP = launch();
try {
  if (mode === 'door') await door(); else if (mode === 'seam') await seam(); else if (mode === 'facing') await facing(); else throw new Error(`unknown mode ${mode}`);
  writeJson(join(EV, `capture-errors-${mode}-${label}.json`), errors);
} finally { await (await browserP).close(); }

// WORK-037-3 m5 outfit beats (gate Q18): self-contained runner, seeded from the ack-phase-4 fixture (Pet House acknowledged to phase 4, not complete).
// The integrator calls these beats from tests/e2e/m5-trace.mjs (WORK-035-2) in the union. Every expectation reads window.__tpp and the DOM.
// Env: TPP_BASE, TPP_EVIDENCE (required), TPP_WORK, TPP_MILESTONE.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { evidenceRoot, sha, launch, boot, waitScene, lines, getState, count, until, waitLine, steer, shot, encode, startStreamRecording,
  writeJson, setDebug, debugClick, makeFixture, WORK, MILESTONE } from './lib/harness.mjs';

if (!process.env.TPP_EVIDENCE || !process.env.TPP_BASE) throw new Error('TPP_BASE and TPP_EVIDENCE are required');
const out = join(evidenceRoot, 'm5'), loopsDir = join(evidenceRoot, 'loops'), bootDir = join(evidenceRoot, 'boot');
mkdirSync(out, { recursive: true }); mkdirSync(bootDir, { recursive: true });
const SEED_TEXT = makeFixture(['--scenario', 'ack-phase-4']).text;
const SWAP_AT = 470;   // timings.ts OUTFIT.swapAt (spec §C)
const beats = [];
let page, browser;
const beat = (name, ok, expected, found) => { beats.push({ beat: name, ok: Boolean(ok), expected, found, at: new Date().toISOString() }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); return ok; };
const still = (point, meta = {}) => shot(page, browser, out, point, meta);

const avatarView = () => page.evaluate(() => {
  const { game, store } = window.__tpp, key = game.scene.isActive('Interior') ? 'Interior' : 'Street', a = game.scene.getScene(key).avatar;
  return { scene: key, texture: a.texture.key, anim: a.anims.currentAnim?.key ?? null, shown: a.shownOutfitId, outfitId: store.getState().avatar.outfitId };
});
const closetView = () => page.evaluate(() => {
  const b = document.querySelector('.tpp-closet-button'), p = document.querySelector('[data-panel="closet"]');
  return { button: b ? { hidden: b.hidden, disabled: b.disabled, visible: b.offsetParent !== null } : null, open: !!p && !p.hidden,
    tiles: [...(p?.querySelectorAll('.tpp-closet-tile') ?? [])].map(t => ({ id: t.dataset.outfitId, locked: t.disabled, selected: t.classList.contains('selected') })) };
});
async function tapBox(limit = 14) {
  let taps = 0;
  while (taps < limit && (await getState(page)).dialogue.current) {
    const box = page.locator('[data-panel="dialogue"]');
    if (await box.isVisible()) { await box.click({ position: { x: 300, y: 60 } }); taps++; }
    await page.waitForTimeout(380);
  }
  return taps;
}
async function drain(quietMs = 1200, ms = 30000) {
  let quietSince = Date.now(); const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await getState(page)).dialogue.current) { await tapBox(); quietSince = Date.now(); } else if (Date.now() - quietSince >= quietMs) break;
    await page.waitForTimeout(150);
  }
}
async function dismissToast() {
  const t = page.locator('[data-panel="toast"]');
  if (await t.count() && await t.isVisible()) { await t.click({ force: true }).catch(() => {}); await page.waitForTimeout(300); }
}
async function tapHouse() {
  const p = await page.evaluate(() => {
    const st = window.__tpp.game.scene.getScene('Street'), h = st.houses.get('pet-house'), b = h.getBounds(), cam = st.cameras.main, r = window.__tpp.game.canvas.getBoundingClientRect(), k = r.width / 1920;
    return { x: r.left + (b.centerX - cam.scrollX) * k, y: r.top + (b.centerY + b.height * 0.15 - cam.scrollY) * k };
  });
  await page.mouse.click(p.x, p.y, { delay: 40 });
}
/** Steps the celebration chain by real clicks (Collect, reveal Continue, dialogue taps) until `stop` holds in the page. */
async function driveUntil(stop, ms = 60000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (await page.evaluate(stop)) return true;
    const ui = await page.evaluate(() => ({ popup: !document.querySelector('.tpp-milestonePopup').hidden && document.querySelector('.tpp-milestonePopup').dataset.state !== 'collecting',
      reveal: !document.querySelector('.tpp-revealPopup').hidden && document.querySelector('.tpp-revealPopup').dataset.state === 'complete', dialogue: !!window.__tpp.store.getState().dialogue.current }));
    if (ui.dialogue) await tapBox();
    else if (ui.reveal) await page.locator('.tpp-revealPopup .tpp-collect').click().catch(() => {});
    else if (ui.popup) await page.locator('.tpp-milestonePopup .tpp-collect').click().catch(() => {});
    await page.waitForTimeout(400);
  }
  return false;
}
/** Real click on the Closet, a tile, and a recorded makeover loop; returns the avatar before/after the swap frame. */
async function chooseOutfit(outfitId, loopName) {
  await page.click('.tpp-closet-button'); await page.waitForTimeout(300);
  const picker = await closetView();
  await still(`closet-open-${outfitId}`, { picker });
  const rec = await startStreamRecording(page, join(loopsDir, `${loopName}-frames`));
  const t0 = Date.now();
  await page.click(`[data-panel="closet"] .tpp-closet-tile[data-outfit-id="${outfitId}"]`);
  const early = await avatarView();
  await page.waitForTimeout(250); await still(`makeover-${outfitId}-250ms`);
  await page.waitForTimeout(Math.max(0, SWAP_AT + 60 - (Date.now() - t0))); const swapped = await avatarView();
  await still(`makeover-${outfitId}-after-swap`);
  await page.waitForTimeout(900); await still(`makeover-${outfitId}-settled`);
  encode(loopsDir, loopName, await rec.stop(), { note: `makeover to ${outfitId} (spec §10; OUTFIT 300/300/470)` }, { maxMs: 3000 });
  return { picker, early, swapped, elapsedMs: Date.now() - t0 };
}

async function bootProbes() {
  const probe = async (name, query, block) => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } }), p = await context.newPage(), errors = [];
    p.on('pageerror', e => errors.push(String(e).slice(0, 300)));
    if (block) await context.route(`**/${block}`, r => r.abort());
    await context.addInitScript(() => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } });
    await p.goto(`${process.env.TPP_BASE}/${query}`);
    await p.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Street'), null, { timeout: 45000 }).catch(() => {});
    const r = await p.evaluate(() => { const g = window.__tpp?.game; if (!g) return null; const a = g.scene.getScene('Boot');
      const keys = ['default', 'cosy', 'garden'].flatMap(o => ['idle', 'walk'].flatMap(c => ['down', 'up', 'side'].map(d => `avatar-${o}-${c}-${d}`)));
      return { loader: a.loaderTotals, exists: Object.fromEntries(keys.map(k => [k, g.anims.exists(k)])) }; });
    let fallback = null;
    if (r && block) fallback = await p.evaluate(() => { const s = window.__tpp.game.scene.getScene('Street'); s.avatar.sync({ x: s.avatar.x, y: s.avatar.y, outfitId: 'cosy' });
      return { texture: s.avatar.texture.key, anim: s.avatar.anims.currentAnim?.key ?? null }; });
    const result = { name, query, block, ...r, fallback, pageErrors: errors, loadErrors: r ? (await p.evaluate(() => window.__tpp.log.lines().filter(l => l.type === 'asset.loadError'))) : null };
    writeJson(join(bootDir, `${name}.json`), result);
    await context.close();
    return result;
  };
  const strict = await probe('strict', '', null);
  beat('boot strict: 18 avatar keys avatar-{default,cosy,garden}-{idle,walk}-{down,up,side}; loader 105, 0 failed; zero page errors',
    strict.exists && Object.values(strict.exists).every(Boolean) && strict.loader?.totalComplete === 105 && strict.loader?.totalFailed === 0 && strict.pageErrors.length === 0,
    'all 18 keys; 105/0; no page errors', strict);
  const lenient = await probe('lenient-cosy-blocked', '?lenient=1', 'player/avatar-cosy-sheet.png');
  const cosyKeys = Object.entries(lenient.exists ?? {}).filter(([k]) => k.startsWith('avatar-cosy-'));
  beat('boot lenient with the cosy sheet blocked: no cosy keys; wearing cosy renders the default keys/texture; zero page errors',
    cosyKeys.length === 6 && cosyKeys.every(([, v]) => !v) && lenient.fallback?.texture === 'player/avatar-sheet' && lenient.fallback?.anim?.startsWith('avatar-default-') && lenient.pageErrors.length === 0,
    'cosy keys absent; fallback avatar-default-*; no page errors', lenient);
}

async function hudRects(height) {
  await page.setViewportSize({ width: 1920, height }); await page.waitForTimeout(600);
  return page.evaluate(() => {
    const panels = document.querySelector('#panels'), pr = panels.getBoundingClientRect();
    const scale = pr.width / 1920;
    const rect = sel => { const el = document.querySelector(sel); if (!el || el.hidden || el.offsetParent === null) return null; const r = el.getBoundingClientRect();
      return { x: Math.round((r.left - pr.left) / scale), y: Math.round((r.top - pr.top) / scale), w: Math.round(r.width / scale), h: Math.round(r.height / scale) }; };
    const s = window.__tpp.game.scene.getScene('Street'), j = s?.joystick?.base;
    const rows = { closet: rect('.tpp-closet-button'), decorate: rect('.tpp-site-toggle'), sitePill: rect('.tpp-site-pill'), reveal: rect('.tpp-reveal-link'), debugEntry: rect('.tpp-debug-entry'),
      joystick: j ? { x: Math.round(j.x - j.displayWidth / 2), y: Math.round(j.y - j.displayHeight / 2 - (1080 - window.innerHeight / scale) / 2), w: Math.round(j.displayWidth), h: Math.round(j.displayHeight) } : null };
    const overlap = (a, b) => !!a && !!b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    return { rows, overlaps: Object.fromEntries(['decorate', 'sitePill', 'reveal', 'joystick'].map(k => [k, overlap(rows.closet, rows[k])])) };
  });
}

async function main() {
  browser = await launch();
  await bootProbes();
  const w = await boot(browser, { height: 1080, save: SEED_TEXT, query: '' });
  page = w.page;
  await waitScene(page, 'Street', 900); await drain(800); await dismissToast();
  const v0 = await closetView();
  await still('street-before-unlock');
  beat('fresh: Closet hidden with only the default unlocked', v0.button?.hidden === true, 'button hidden', v0);

  // Complete project (debug row) → the completion popup with the outfit tile
  await debugClick(page, 'Complete project', 'Go'); await setDebug(page, false);
  await tapHouse();
  // A progress popup / reveal may come first (the chain to the completing celebration, as in m2-trace)
  await driveUntil(() => { const s = window.__tpp.store.getState(), p = document.querySelector('.tpp-milestonePopup'); return s.celebration?.completes === true && s.celebration.step === 'milestone' && !p.hidden; });
  const recPopup = await startStreamRecording(page, join(loopsDir, 'popup-outfit-tile-frames'));
  await page.waitForTimeout(60); await still('popup-outfit-tile-midflip');
  await page.waitForTimeout(900);
  const tile = await page.evaluate(() => { const t = document.querySelector('.tpp-milestonePopup .tpp-outfit-tile'); return t ? { outfitId: t.dataset.outfitId,
    name: t.querySelector('.tpp-reward-card-name')?.textContent, isNew: !!t.querySelector('.tpp-reward-card-new'), opacity: getComputedStyle(t.querySelector('.tpp-reward-card')).opacity } : null; });
  await still('popup-outfit-tile-settled', { tile });
  encode(loopsDir, 'popup-outfit-tile', await recPopup.stop(), { note: 'completion popup outfit tile flip (spec §6; Q13(a))' }, { maxMs: 4000 });
  const s1 = await getState(page);
  beat('Complete project → "Project Complete!" popup with the cosy outfit tile ("New outfit: Cosy set", New ribbon) after the charm tiles',
    s1.celebration?.completes && tile?.outfitId === 'cosy' && tile.name === 'New outfit: Cosy set' && tile.isNew && tile.opacity === '1', 'outfit tile cosy, New, visible', { tile, celebration: s1.celebration });
  await driveUntil(() => { const s = window.__tpp.store.getState(); return !s.celebration && !s.arrival && !s.dialogue.current; });
  await drain(1500); await dismissToast();
  const all1 = await lines(page);
  const v1 = await closetView();
  await page.click('.tpp-closet-button'); await page.waitForTimeout(300);
  const picker1 = await closetView();
  await still('closet-two-unlocked', { picker: picker1 });
  await page.click('[data-panel="closet"] .tpp-close'); await page.waitForTimeout(200);
  beat('after Collect: outfit.unlocked {cosy, completion}; street Closet visible; picker three tiles, default + cosy unlocked, garden locked, default worn',
    count(all1, 'outfit.unlocked', l => l.outfitId === 'cosy' && l.source === 'completion') === 1 && v1.button?.visible && !v1.button.disabled
      && JSON.stringify(picker1.tiles) === JSON.stringify([{ id: 'default', locked: false, selected: true }, { id: 'cosy', locked: false, selected: false }, { id: 'garden', locked: true, selected: false }]),
    'outfit.unlocked ×1; button visible; tiles d/c unlocked, g locked', { button: v1.button, tiles: picker1.tiles });

  const rects = { work: WORK, sha, at1080: await hudRects(1080), at823: await hudRects(823) };
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(500);
  writeJson(join(evidenceRoot, 'hud-rects.json'), rects);
  beat('Closet rect clear of the joystick, Decorate, the site pill and the reveal link at 1920x1080 and 1920x823',
    [rects.at1080, rects.at823].every(r => r.rows.closet && Object.values(r.overlaps).every(o => !o)), 'no overlap', rects);

  const cosy = await chooseOutfit('cosy', 'makeover-cosy');
  const all2 = await lines(page);
  beat('choose cosy (real clicks) → outfit.changed {default → cosy}; the default sheet held before the swap; player/avatar-cosy-sheet after OUTFIT.swapAt; picker closed',
    count(all2, 'outfit.changed', l => l.from === 'default' && l.to === 'cosy') === 1 && cosy.early.texture === 'player/avatar-sheet' && cosy.early.outfitId === 'cosy'
      && cosy.swapped.texture === 'player/avatar-cosy-sheet' && !(await closetView()).open, 'changed ×1; held default; cosy texture after swap', cosy);

  // Walk into the Dog room: still cosy
  await steer(page, 475, 965, () => { const s = window.__tpp.store.getState(); return (Math.abs(s.avatar.x - 475) < 30 && s.avatar.y > 940) || s.scene.kind === 'interior'; }, 40000);
  await steer(page, 475, 895, () => window.__tpp.store.getState().scene.kind === 'interior', 30000);
  await waitScene(page, 'Interior', 900); await drain(800);
  const inside = await avatarView();
  await still('interior-cosy', { avatar: inside });
  beat('walk into an interior: the avatar still wears cosy', inside.scene === 'Interior' && inside.texture === 'player/avatar-cosy-sheet' && inside.outfitId === 'cosy', 'Interior; cosy texture', inside);

  // Reload: cosy persists
  await page.waitForTimeout(1200);
  await page.reload();
  await page.waitForFunction(() => window.__tpp && (window.__tpp.game.scene.isActive('Interior') || window.__tpp.game.scene.isActive('Street')), null, { timeout: 45000 });
  await page.waitForTimeout(1200); await drain(800);
  const reloaded = await avatarView();
  await still('reload-cosy', { avatar: reloaded });
  beat('reload: cosy persists (state and texture)', reloaded.outfitId === 'cosy' && reloaded.texture === 'player/avatar-cosy-sheet', 'cosy after reload', reloaded);

  // Garden: unlock, walk out, Decorate, Fill, Done → arrival → intro dialogue → the outfit card
  await debugClick(page, 'Unlock garden', 'Unlock'); await setDebug(page, false);
  if ((await getState(page)).scene.kind !== 'street') await steer(page, 693, 575, () => window.__tpp.store.getState().scene.kind === 'street', 30000);
  await waitScene(page, 'Street', 900); await drain(800); await dismissToast();
  await until(page, () => !document.querySelector('.tpp-site-toggle').disabled, null, 12000);
  await page.click('.tpp-site-toggle'); await page.waitForTimeout(450);
  const designHidden = (await closetView()).button?.hidden;
  await debugClick(page, 'Fill garden', 'Fill'); await setDebug(page, false);
  const recCard = await startStreamRecording(page, join(loopsDir, 'arrival-card-frames'));
  await page.click('.tpp-site-toggle');
  await waitLine(page, 'pet.arrived', { petId: 'owl-mate' }, 25000);
  await page.waitForTimeout(300);
  const dialogueOpen = !!(await getState(page)).dialogue.current;
  const cardDuringDialogue = await page.evaluate(() => !!document.querySelector('.tpp-outfit-card'));
  await tapBox();
  const cardAt = await until(page, () => !!document.querySelector('.tpp-outfit-card'), null, 3000).then(() => true).catch(() => false);
  await page.waitForTimeout(200); await still('arrival-card-flip');
  const cardName = await page.evaluate(() => document.querySelector('.tpp-outfit-card .tpp-reward-card-name')?.textContent ?? null);
  await page.waitForTimeout(1400);
  const cardGone = await page.evaluate(() => !document.querySelector('.tpp-outfit-card'));
  encode(loopsDir, 'arrival-card', await recCard.stop(), { note: 'mate arrival → intro dialogue → standalone outfit card → send to the Closet (Q13(a))' }, { maxMs: 12000 });
  await drain(1200); await dismissToast();
  const all3 = await lines(page);
  beat('garden arrival: Closet hidden in design mode; outfit.unlocked {garden, arrival}; no card while the intro dialogue is open; the card "New outfit: Garden set" after it closes, then sent',
    designHidden === true && count(all3, 'outfit.unlocked', l => l.outfitId === 'garden' && l.source === 'arrival') === 1 && dialogueOpen && !cardDuringDialogue && cardAt && cardName === 'New outfit: Garden set' && cardGone,
    'hidden in design; unlocked ×1; card after the dialogue; gone after hold + send', { designHidden, dialogueOpen, cardDuringDialogue, cardAt, cardName, cardGone });

  // Rects again with the site unlocked (Decorate and the site pill showing)
  const rectsSite = { at1080: await hudRects(1080), at823: await hudRects(823) };
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.waitForTimeout(500);
  writeJson(join(evidenceRoot, 'hud-rects.json'), { ...rects, siteUnlocked: rectsSite });
  beat('site unlocked: Closet rect clear of Decorate, the site pill, the reveal link and the joystick at 1920x1080 and 1920x823',
    [rectsSite.at1080, rectsSite.at823].every(r => r.rows.closet && r.rows.decorate && Object.values(r.overlaps).every(o => !o)), 'no overlap; Decorate present', rectsSite);
  const garden = await chooseOutfit('garden', 'makeover-garden');
  beat('Closet: three unlocked, cosy worn; choose garden → player/avatar-garden-sheet after the swap',
    garden.picker.tiles.every(t => !t.locked) && garden.picker.tiles.find(t => t.selected)?.id === 'cosy' && garden.swapped.texture === 'player/avatar-garden-sheet',
    'three unlocked; garden texture', garden);
  await still('street-garden-outfit');

  // Debug row 25 "Outfits" (WORK-037-2): select default, Wear
  await setDebug(page, true);
  const row25 = page.locator('.tpp-debug-row').filter({ has: page.locator('label', { hasText: /^Outfits$/ }) }).first();
  await row25.locator('select').selectOption('default'); await row25.locator('button', { hasText: 'Wear' }).click(); await page.waitForTimeout(200);
  await setDebug(page, false);
  await page.waitForTimeout(SWAP_AT + 400);
  const worn = await avatarView(), all4 = await lines(page);
  beat('debug row 25 Outfits → Wear default: outfit.changed {garden → default}, the makeover plays, default sheet after the swap',
    count(all4, 'outfit.changed', l => l.from === 'garden' && l.to === 'default') === 1 && worn.texture === 'player/avatar-sheet', 'changed ×1; default texture', worn);

  const consoleSummary = { consoleErrors: w.errors.consoleErrors, pageErrors: w.errors.pageErrors, assetLoadErrors: all4.filter(l => l.type === 'asset.loadError') };
  writeJson(join(out, 'console.json'), consoleSummary);
  beat('zero page errors and zero asset.loadError over the run', consoleSummary.pageErrors.length === 0 && consoleSummary.assetLoadErrors.length === 0, 'none', consoleSummary);
  await browser.close();
}

main().catch(async error => { beats.push({ beat: 'runner', ok: false, error: String(error?.stack ?? error).slice(0, 1500) }); console.error(error); await browser?.close().catch(() => {}); })
  .finally(() => {
    const report = { work: WORK, milestone: MILESTONE, sha, base: process.env.TPP_BASE, beats, pass: beats.length > 0 && beats.every(b => b.ok), at: new Date().toISOString() };
    writeJson(join(out, 'trace-report.json'), report);
    console.log(`m5-outfit: ${beats.filter(b => b.ok).length}/${beats.length} ${report.pass ? 'PASS' : 'FAIL'}`);
    process.exitCode = report.pass ? 0 : 1;
  });

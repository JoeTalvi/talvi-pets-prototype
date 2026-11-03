// WORK-038-3 capture points (DEC-049 §4 Stars by value, m4 B8) live on the lane's dev server (Playwright library, pinned chromium-1243; no install).
//   TPP_BASE=http://127.0.0.1:5214 TPP_EVIDENCE=<EV> TPP_WORK=WORK-038-3 TPP_MILESTONE=MILESTONE-011 node tests/view/capture/work-038-3.mjs
// Saves come from the game's own fixture tool (dog-room-intro-done) into <EV>/fixtures; actions go through window.__tpp.store.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, boot, waitScene, lines, shot, writeJson, errorsSummary, createSteps, makeFixture, startStreamRecording, encode, tapSlot } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const captures = join(EV, 'captures'), loops = join(EV, 'loops'), rows = join(EV, 'rows');
const { steps, step } = createSteps();
const errorsByWindow = [];
mkdirSync(join(EV, 'fixtures'), { recursive: true });
const save = makeFixture(['--scenario', 'dog-room-intro-done'], join(EV, 'fixtures')).text;

const dispatch = (page, action) => page.evaluate(a => window.__tpp.store.dispatch(a), action);
const drain = page => page.evaluate(() => { const { store } = window.__tpp; for (let i = 0; i < 20 && store.getState().dialogue.current; i++) store.dispatch({ type: 'advanceDialogue' }); });
/** Page-side: every `play(id, opts)` with its performance.now() stamp, so a row can give each sound's time relative to its trigger. */
const tapAudio = page => page.evaluate(() => {
  const audio = window.__tpp.context?.audio ?? window.__tpp.audio;
  window.__sounds = [];
  if (!audio || audio.__tapped) return !!audio;
  const play = audio.play.bind(audio);
  audio.play = (id, opts) => { window.__sounds.push({ id, opts: opts ?? null, t: performance.now() }); return play(id, opts); };
  audio.__tapped = true;
  return true;
});

async function room(browser) {
  const w = await boot(browser, { save });
  await waitScene(w.page, 'Interior', 900);
  await drain(w.page);
  await w.page.waitForTimeout(300);
  return w;
}

/** §4: a first copy (+4) then a repeat (+1) of the same type in the Dog room, as one loop with per-sound times. */
async function stars(browser) {
  const w = await room(browser);
  const tapped = await tapAudio(w.page);
  await dispatch(w.page, { type: 'setDesignMode', on: true });
  const typeId = await w.page.evaluate(() => { const { store, content } = window.__tpp, s = store.getState();
    const held = new Set(Object.values(s.rooms).flatMap(r => Object.values(r.placements)));
    return content.charms.types.find(t => t.sizeClass === 'small' && !held.has(t.id))?.id ?? null; });
  await dispatch(w.page, { type: 'debugGrantCopies', typeId, count: 2 });
  await w.page.waitForTimeout(400);
  const rec = await startStreamRecording(w.page, join(EV, 'frames-s4'));
  await w.page.waitForTimeout(300);
  const t0 = await w.page.evaluate(() => performance.now());
  await dispatch(w.page, { type: 'placeCharm', slotId: 'floor-3', typeId });
  await w.page.waitForTimeout(420);
  const mid = await w.page.evaluate(() => ({ kind: document.querySelector('.tpp-stars-burst')?.dataset.kind ?? null,
    large: document.querySelectorAll('.tpp-stars-large .tpp-glyph').length, ring: document.querySelectorAll('.tpp-stars-ring').length }));
  const midShot = await shot(w.page, browser, captures, 's4-first-copy-midflight-1080', { save: 'dog-room-intro-done', typeId, atMs: 420 });
  await w.page.waitForTimeout(1200);
  const t1 = await w.page.evaluate(() => performance.now());
  await dispatch(w.page, { type: 'placeCharm', slotId: 'floor-4', typeId });
  const repeat = await w.page.evaluate(() => ({ kind: document.querySelector('.tpp-stars-burst')?.dataset.kind ?? null,
    large: document.querySelectorAll('.tpp-stars-large .tpp-glyph').length, ring: document.querySelectorAll('.tpp-stars-ring').length }));
  await w.page.waitForTimeout(900);
  const sounds = await w.page.evaluate(() => window.__sounds ?? []);
  const sidecar = encode(loops, 's4-stars-by-value', await rec.stop(), { save: 'dog-room-intro-done', action: `placeCharm floor-3 / floor-4 ${typeId}` });
  const changed = (await lines(w.page, 'stars.changed')).slice(-2).map(l => l.delta);
  const rel = sounds.map(s => ({ id: s.id, opts: s.opts, ms: Math.round(s.t - (s.t >= t1 ? t1 : t0)), of: s.t >= t1 ? 'repeat' : 'first' }));
  const row = { typeId, audioTapped: tapped, deltas: changed, mid, repeat, sounds: rel, still: midShot, loop: sidecar.outputs?.mp4 ?? sidecar.gap };
  writeJson(join(rows, 's4.json'), row);
  const ticks = rel.filter(s => s.id === 'tick');
  step('§4: +4 first copy = ring + 4 large ★; +1 repeat = no ring + 1 large ★; ticks only after the first landing (≥ 520 ms / ≥ 420 ms)',
    mid.kind === 'first' && mid.large === changed[0] && mid.ring === 1 && repeat.kind === 'repeat' && repeat.large === 1 && repeat.ring === 0
      && (!tapped || ticks.every(s => s.ms >= (s.of === 'first' ? 500 : 400))), 'first 4 / repeat 1', row);
  errorsByWindow.push({ window: 's4', ...errorsSummary(w.errors, await lines(w.page)) });
  await w.context.close();
}

/** B8: the chooser with a zero-count type: the "none left" label below the sprite, readable. */
async function noneLeft(browser) {
  const w = await room(browser);
  await dispatch(w.page, { type: 'setDesignMode', on: true });
  const typeId = await w.page.evaluate(() => { const { store, content } = window.__tpp, counts = store.getState().inventory.counts;
    return content.charms.types.find(t => t.sizeClass === 'small' && (counts[t.id] ?? 0) > 0)?.id ?? null; });
  const copies = await w.page.evaluate(id => window.__tpp.store.getState().inventory.counts[id], typeId);
  const slots = ['floor-1', 'floor-2', 'floor-3', 'floor-4'].slice(0, copies);
  for (const slotId of slots) await dispatch(w.page, { type: 'placeCharm', slotId, typeId });
  await w.page.waitForTimeout(1200);
  const free = await w.page.evaluate(() => { const { store, content } = window.__tpp, s = store.getState(), room = content.rooms[s.scene.roomId];
    return room.slots.find(sl => sl.sizeClass === 'small' && !s.rooms[room.id].placements[sl.id])?.id ?? null; });
  await tapSlot(w.page, free, 600);
  const geo = await w.page.evaluate(id => {
    const card = document.querySelector(`.tpp-charm-card[data-type-id="${id}"]`);
    if (!card) return null;
    const label = card.querySelector('.tpp-charm-copies'), art = card.querySelector('img, .tpp-asset-slot');
    const box = el => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
    const cs = getComputedStyle(label);
    return { label: box(label), art: box(art), color: cs.color, background: cs.backgroundColor, opacity: cs.opacity, text: label.textContent };
  }, typeId);
  const png = await shot(w.page, browser, captures, 'b8-none-left-1080', { save: 'dog-room-intro-done', typeId, slot: free });
  const row = { typeId, copies, free, geo, still: png };
  writeJson(join(rows, 'b8.json'), row);
  const clear = geo && (geo.label.top >= geo.art.bottom || geo.label.bottom <= geo.art.top || geo.label.left >= geo.art.right || geo.label.right <= geo.art.left);
  step('B8: the zero-count card says "none left" below the sprite (boxes do not intersect), label opacity 1', !!clear && geo.opacity === '1' && geo.text === 'none left', 'no overlap, opaque', row);
  errorsByWindow.push({ window: 'b8', ...errorsSummary(w.errors, await lines(w.page)) });
  await w.context.close();
}

const browser = await launch();
try {
  await stars(browser);
  await noneLeft(browser);
  step('zero console/page errors in every window', errorsByWindow.every(e => !e.consoleErrors.length && !e.pageErrors.length && !e.assetLoadErrors.length && !e.appErrors.length), 'none', errorsByWindow);
} finally {
  await browser.close();
  writeJson(join(EV, 'capture-report.json'), { steps, errorsByWindow, state: null });
}
for (const s of steps) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.step}`);
process.exitCode = steps.every(s => s.ok) ? 0 : 1;

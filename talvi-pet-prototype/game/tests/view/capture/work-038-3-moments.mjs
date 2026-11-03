// WORK-038-3 fix round 1 (VERIFY-WORK-038-3-12): the DEC-049 moment loops, rows and stills for §1, §2, §3 (reveal + Owl), §6, §7, §8 and §9.
// Built from the TASK-259 reviewer's review-capture.mjs. Every row's sound `ms` is relative to that moment's trigger (t0).
// Run: TPP_BASE=http://127.0.0.1:<port> TPP_EVIDENCE=<dir> node tests/view/capture/work-038-3-moments.mjs
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { GAME_DIR, launch, boot, waitScene, lines, shot, writeJson, errorsSummary, makeFixture, startStreamRecording, encode, until } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
const captures = join(EV, 'captures'), loops = join(EV, 'loops'), rows = join(EV, 'rows');
mkdirSync(join(EV, 'fixtures'), { recursive: true });
const fx = name => makeFixture(['--steps', join(GAME_DIR, 'tests/view/capture', `${name}.steps.json`)], join(EV, 'fixtures')).text;
const out = {};
const errs = [];
const dispatch = (page, a) => page.evaluate(a => window.__tpp.store.dispatch(a), a);
const now = page => page.evaluate(() => performance.now());
const tapAudio = page => page.evaluate(() => {
  const audio = window.__tpp.context.audio; window.__sounds = [];
  if (!audio) return false;
  if (!audio.__tapped) { const play = audio.play.bind(audio); audio.play = (id, opts) => { window.__sounds.push({ id, opts: opts ?? null, t: performance.now() }); return play(id, opts); }; audio.__tapped = true; }
  return true;
});
const sounds = (page, t0) => page.evaluate(t0 => (window.__sounds ?? []).map(s => ({ id: s.id, opts: s.opts, ms: Math.round(s.t - t0) })), t0);
const tapHouse = page => page.evaluate(() => {
  const st = window.__tpp.game.scene.getScene('Street'), h = st.houses.get('pet-house'), b = h.getBounds(), cam = st.cameras.main, r = window.__tpp.game.canvas.getBoundingClientRect(), k = r.width / 1920;
  return { x: r.left + (b.centerX - cam.scrollX) * k, y: r.top + (b.centerY + b.height * 0.15 - cam.scrollY) * k };
}).then(p => page.mouse.click(p.x, p.y, { delay: 40 }));
const timeline = page => page.evaluate(() => { const d = window.__tpp.game.scene.getScene('Street').director; return d?.plan ? d.plan.beats.map(b => [b.beat, b.startMs, b.durationMs]) : null; });
const openFn = sel => { const m = document.querySelector(sel); return !!m && !m.hidden; };

async function phaseRise(browser) {
  const w = await boot(browser, { save: fx('street-ack1-owed3') }); const { page } = w;
  await waitScene(page, 'Street', 1200); await tapAudio(page);
  const rec = await startStreamRecording(page, join(EV, 'frames-s2'));
  const t0 = await now(page); await tapHouse(page);
  await page.waitForTimeout(300); const plan = await timeline(page);
  await until(page, openFn, '.tpp-milestonePopup', 25000);
  const tOpen = await now(page); await page.waitForTimeout(1600);
  const popup = await page.evaluate(() => ({ tiles: document.querySelectorAll('.tpp-milestonePopup .tpp-reward-tile').length, news: document.querySelectorAll('.tpp-milestonePopup .tpp-reward-card-new').length }));
  await shot(page, browser, captures, 's6-milestone-tiles-1080', { note: 'WORK-038-3: tiles after flip-in' });
  const tCollect = await now(page); await page.locator('.tpp-milestonePopup .tpp-collect').click();
  await until(page, openFn, '.tpp-revealPopup', 15000); const tReveal = await now(page);
  await page.waitForTimeout(2200);
  await shot(page, browser, captures, 's2-reveal-clue-cards-1080', { note: 'WORK-038-3: clue cards' });
  const all = await sounds(page, t0);
  const sidecar = encode(loops, 's2-phase-rise', await rec.stop(), { note: 'WORK-038-3 phase rise 1→4, popup, Collect, reveal' });
  out.s2 = { plan, popup, openMs: Math.round(tOpen - t0), collectMs: Math.round(tCollect - t0), revealMs: Math.round(tReveal - t0), sounds: all, loop: sidecar.outputs?.mp4 ?? sidecar.gap };
  errs.push({ window: 's2', ...errorsSummary(w.errors, await lines(page)) }); await w.context.close();
}

async function completion(browser) {
  const w = await boot(browser, { save: fx('street-ack4-complete') }); const { page } = w;
  await waitScene(page, 'Street', 1200); await tapAudio(page);
  const rec = await startStreamRecording(page, join(EV, 'frames-s3'));
  const t0 = await now(page); await tapHouse(page);
  await page.waitForTimeout(300); const plan = await timeline(page);
  await until(page, () => (window.__sounds ?? []).some(s => s.id === 'complete'), null, 20000, 10);
  await shot(page, browser, captures, 's3-completion-hit-1080', { note: 'WORK-038-3: at the complete sound (hit frame)' });
  const hit = await page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'); return { shakeRunning: st.cameras.main.shakeEffect?.isRunning ?? null }; });
  await until(page, openFn, '.tpp-milestonePopup', 25000);
  await page.waitForTimeout(1200); await page.locator('.tpp-milestonePopup .tpp-collect').click();
  await until(page, openFn, '.tpp-revealPopup', 15000);
  await until(page, () => document.querySelector('.tpp-revealPopup')?.dataset.state === 'silhouette', null, 15000, 10); const tSil = await now(page);
  await until(page, () => document.querySelector('.tpp-revealPopup')?.dataset.state === 'complete', null, 15000, 10); const tDone = await now(page);
  await page.waitForTimeout(150);
  await shot(page, browser, captures, 's3-reveal-resolve-1080', { note: 'WORK-038-3: resolve' });
  const glyphs = await page.evaluate(() => document.querySelectorAll('.tpp-glyph').length);
  await page.waitForTimeout(800);
  const tCont = await now(page); await page.locator('.tpp-revealPopup .tpp-collect').click();
  await page.waitForTimeout(6000);
  const all = await sounds(page, t0);
  const sidecar = encode(loops, 's3-completion-reveal-arrival', await rec.stop(), { note: 'WORK-038-3 completion → reveal → Owl arrival' }, { maxMs: 30000 });
  out.s3 = { plan, hit, silhouetteMs: Math.round(tSil - t0), resolveMs: Math.round(tDone - t0), continueMs: Math.round(tCont - t0), glyphsAtResolve: glyphs, sounds: all, loop: sidecar.outputs?.mp4 ?? sidecar.gap };
  errs.push({ window: 's3', ...errorsSummary(w.errors, await lines(page)) }); await w.context.close();
}

async function streetMoments(browser) {
  const w = await boot(browser, { save: fx('street-ack1-owed3') }); const { page } = w;
  await waitScene(page, 'Street', 1200); await tapAudio(page);
  // §1 round-up
  const rec1 = await startStreamRecording(page, join(EV, 'frames-s1'));
  let t0 = await now(page); await dispatch(page, { type: 'debugSimulatePurchase' });
  await page.waitForTimeout(350);
  const coins = await page.evaluate(() => document.querySelectorAll('.tpp-roundup-coins .tpp-glyph').length);
  await page.waitForTimeout(900);
  const ru = (await lines(page, 'roundup.fired')).at(-1);
  out.s1 = { changeCents: ru?.changeCents, coinsAt350: coins, glows: await page.evaluate(() => document.querySelector('.tpp-hudStreet .tpp-chunks')?.dataset.glows ?? null), sounds: await sounds(page, t0) };
  out.s1.loop = encode(loops, 's1-roundup', await rec1.stop(), { note: 'WORK-038-3 round-up' }).outputs?.mp4 ?? null;
  await page.waitForTimeout(3500);
  // §7 garden unlocked on the street
  await page.evaluate(() => { window.__sounds = []; });
  const rec7 = await startStreamRecording(page, join(EV, 'frames-s7'));
  t0 = await now(page); await dispatch(page, { type: 'debugUnlockSpace', siteId: 'garden' });
  await page.waitForTimeout(350);
  await page.locator('.tpp-toast').screenshot({ path: join(captures, 's7-garden-card-toast-crop.png') });
  await page.waitForTimeout(150);
  const toast = await page.evaluate(() => { const t = document.querySelector('.tpp-toast'); const cs = t && getComputedStyle(t); return t ? { hidden: t.hidden, kind: t.dataset.kind, card: t.classList.contains('tpp-toast-card'),
    borderImageSource: cs.borderImageSource, filter: cs.filter, text: t.textContent?.trim().slice(0, 80) } : null; });
  const beacon = await page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'); return { bubble: st.beaconBubble?.current() ?? null, artScale: st.siteArt?.get('garden')?.scale ?? null }; });
  await shot(page, browser, captures, 's7-garden-beacon-1080', { note: 'fix round 1: garden beacon on the street with the §7 card toast (pill + gold ring)' });
  await page.waitForTimeout(1500);
  out.s7 = { toast, beacon, sounds: await sounds(page, t0) };
  out.s7.loop = encode(loops, 's7-garden-beacon', await rec7.stop(), { note: 'WORK-038-3 garden beacon' }).outputs?.mp4 ?? null;
  await page.waitForTimeout(2500);
  // §4 on the site pill: first copy then repeat
  await dispatch(page, { type: 'setDesignMode', on: true }); await page.waitForTimeout(500);
  const typeId = await page.evaluate(() => window.__tpp.content.charms.types.find(t => t.sizeClass === 'small' && (window.__tpp.content.charms.types.indexOf(t) > 2))?.id);
  await dispatch(page, { type: 'debugGrantCopies', typeId, count: 2 }); await page.waitForTimeout(300);
  await page.evaluate(() => { window.__sounds = []; });
  const rec4 = await startStreamRecording(page, join(EV, 'frames-s4-site'));
  t0 = await now(page); await dispatch(page, { type: 'placeCharm', slotId: 'garden-small-1', typeId });
  await page.waitForTimeout(250);
  const first = await page.evaluate(() => ({ kind: document.querySelector('.tpp-hudStreet .tpp-stars-burst, .tpp-stars-burst')?.dataset.kind ?? null, large: document.querySelectorAll('.tpp-stars-large .tpp-glyph').length, ring: document.querySelectorAll('.tpp-stars-ring').length }));
  await shot(page, browser, captures, 's4-site-pill-first-copy-1080', { note: 'WORK-038-3: site pill first copy mid-flight' });
  await page.waitForTimeout(1300);
  const firstSounds = await sounds(page, t0);
  await page.evaluate(() => { window.__sounds = []; });
  t0 = await now(page); await dispatch(page, { type: 'placeCharm', slotId: 'garden-small-2', typeId });
  await page.waitForTimeout(150);
  const repeat = await page.evaluate(() => ({ kind: document.querySelector('.tpp-stars-burst')?.dataset.kind ?? null, large: document.querySelectorAll('.tpp-stars-large .tpp-glyph').length, ring: document.querySelectorAll('.tpp-stars-ring').length }));
  await page.waitForTimeout(900);
  const deltas = (await lines(page, 'space.stars.changed')).map(l => l.delta);
  out.s4site = { typeId, deltas, first, repeat, firstSounds, repeatSounds: await sounds(page, t0) };
  out.s4site.loop = encode(loops, 's4-site-pill', await rec4.stop(), { note: 'WORK-038-3 site pill' }).outputs?.mp4 ?? null;
  // §8 the mate's arrival: fill the garden and press Done
  await dispatch(page, { type: 'debugFillSpace', siteId: 'garden' }); await page.waitForTimeout(400);
  await page.evaluate(() => { window.__sounds = []; });
  const rec8 = await startStreamRecording(page, join(EV, 'frames-s8'));
  t0 = await now(page); await dispatch(page, { type: 'setDesignMode', on: false });
  const started = await until(page, () => window.__tpp.log.lines().some(l => l.type === 'space.arrivalStarted'), null, 4000).then(() => true, () => false);
  let hearts = 0;
  for (let i = 0; i < 80 && started; i++) { hearts = Math.max(hearts, await page.evaluate(() => [...document.querySelectorAll('.tpp-glyph')].filter(g => g.textContent === '♥').length)); if ((await lines(page, 'pet.arrived')).length) break; await page.waitForTimeout(100); }
  await page.waitForTimeout(500);
  out.s8 = { arrivalStarted: started, maxHeartGlyphs: hearts, sounds: await sounds(page, t0), arrived: (await lines(page, 'pet.arrived')).length };
  out.s8.loop = encode(loops, 's8-mate-arrival', await rec8.stop(), { note: 'WORK-038-3 mate arrival' }, { maxMs: 20000 }).outputs?.mp4 ?? null;
  errs.push({ window: 'street', ...errorsSummary(w.errors, await lines(page)) }); await w.context.close();
}


const dogRoom = async browser => {
  const save = makeFixture(['--scenario', 'dog-room-intro-done'], join(EV, 'fixtures')).text;
  const w = await boot(browser, { save }); const { page } = w;
  await waitScene(page, 'Interior', 900);
  await page.evaluate(() => { const { store } = window.__tpp; for (let i = 0; i < 20 && store.getState().dialogue.current; i++) store.dispatch({ type: 'advanceDialogue' }); });
  await page.waitForTimeout(400); await tapAudio(page);
  return w;
};

/** §9 has no debug row that makes a given reaction: the bubble is driven with the exact BubbleShow reactionBubble() builds (view-level). */
async function reactions(browser) {
  const w = await dogRoom(browser); const { page } = w;
  const rec = await startStreamRecording(page, join(EV, 'frames-s9'));
  out.s9 = {};
  const show = (reaction, glyph, line) => page.evaluate(([reaction, glyph, line]) => {
    const sc = window.__tpp.game.scene.getScene('Interior'), b = sc.petBubble();
    if (!b) return false;
    const beat = reaction === 'love' ? 'love' : reaction === 'dislike' ? 'shake' : 'pop';
    b.onBeat = bt => { if (bt === 'love') sc.hopPet(b.petId); };
    b.show({ kind: 'emoji', class: reaction, glyph, tapText: line, beat, ...(reaction === 'stripped' ? { autoText: true } : {}) });
    return true;
  }, [reaction, glyph, line]);
  for (const [reaction, glyph] of [['love', '❤️'], ['dislike', '💢'], ['stripped', '😢']]) {
    await page.evaluate(() => { window.__sounds = []; });
    const t0 = await now(page); const ok = await show(reaction, glyph, `(${reaction} line)`);
    await page.waitForTimeout(250);
    const hearts = await page.evaluate(() => [...document.querySelectorAll('.tpp-glyph')].filter(g => g.textContent === '♥').length);
    if (reaction === 'stripped') {
      const bubbleMs = await page.evaluate(() => window.__tpp.content.tuning.bubbleMs);
      await page.waitForTimeout(bubbleMs + 400 - 250);
      await shot(page, browser, captures, 's9-b9-untapped-line-1080', { note: 'WORK-038-3 fix round 1: B9 stripped line shown after the emoji, untapped' });
      out.s9.b9 = await page.evaluate(() => { const b = window.__tpp.game.scene.getScene('Interior').petBubble(); return { kind: b?.current?.()?.kind ?? null, text: b?.current?.()?.text ?? null }; });
    } else await page.waitForTimeout(2200);
    out.s9[reaction] = { shown: ok, heartsAt250: hearts, sounds: await sounds(page, t0) };
  }
  // First use: the first pet.verbStarted per (pet, charm type) sparkles at the charm (called on the scene; no verb on demand).
  await page.evaluate(() => { window.__sounds = []; });
  const t0 = await now(page);
  out.s9.firstUse = await page.evaluate(() => {
    const sc = window.__tpp.game.scene.getScene('Interior'), st = window.__tpp.store.getState();
    const slotId = Object.values(st.rooms).flatMap(r => Object.keys(r.placements))[0], petId = sc.petBubble()?.petId;
    if (!slotId || !petId) return { slotId: slotId ?? null, petId: petId ?? null };
    sc.firstUse(petId, slotId, st); return { slotId, petId, sparkles: document.querySelectorAll('canvas').length > 0 };
  });
  await page.waitForTimeout(150);
  await shot(page, browser, captures, 's9-first-use-1080', { note: 'WORK-038-3 fix round 1: first-use sparkle' });
  await page.waitForTimeout(800);
  out.s9.firstUse.sounds = await sounds(page, t0);
  out.s9.loop = encode(loops, 's9-reactions', await rec.stop(), { note: 'WORK-038-3 §9 love, dislike, stripped (+B9 line), first use' }, { maxMs: 20000 }).outputs?.mp4 ?? null;
  errs.push({ window: 's9', ...errorsSummary(w.errors, await lines(page)) }); await w.context.close();
}

async function interiorRoundup(browser) {
  const save = makeFixture(['--scenario', 'dog-room-intro-done'], join(EV, 'fixtures')).text;
  const w = await boot(browser, { save }); const { page } = w;
  await waitScene(page, 'Interior', 900);
  await page.evaluate(() => { const { store } = window.__tpp; for (let i = 0; i < 20 && store.getState().dialogue.current; i++) store.dispatch({ type: 'advanceDialogue' }); });
  await page.waitForTimeout(400); await tapAudio(page);
  const t0 = await now(page); await dispatch(page, { type: 'debugSimulatePurchase' });
  await page.waitForTimeout(400);
  const read = await page.evaluate(() => ({ toast: !document.querySelector('.tpp-toast')?.hidden, streetHudHidden: document.querySelector('.tpp-hudStreet')?.hidden ?? null,
    coins: [...document.querySelectorAll('.tpp-roundup-coins .tpp-glyph')].map(g => { const r = g.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top)]; }) }));
  await shot(page, browser, captures, 's1-interior-roundup-1080', { note: 'fix round 1 F2: round-up toast inside the Dog room at 400 ms, no coins' });
  await page.waitForTimeout(800);
  out.s1interior = { ...read, sounds: await sounds(page, t0) };
  errs.push({ window: 's1interior', ...errorsSummary(w.errors, await lines(page)) }); await w.context.close();
}

const browser = await launch();
for (const fn of (process.env.ONLY ? process.env.ONLY.split(',') : ['phaseRise','completion','streetMoments','interiorRoundup','reactions']).map(n => ({ phaseRise, completion, streetMoments, interiorRoundup, reactions })[n])) {
  try { await fn(browser); } catch (e) { out[`${fn.name}Error`] = String(e?.stack ?? e).slice(0, 800); }
}
await browser.close();
writeJson(join(rows, process.env.ONLY ? 'moments-partial.json' : 'moments.json'), { ...out, errs });
console.log(JSON.stringify({ ...out, errs }, null, 1).slice(0, 20000));

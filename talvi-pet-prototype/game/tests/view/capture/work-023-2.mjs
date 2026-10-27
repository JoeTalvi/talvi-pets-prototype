// WORK-023-2 arrival walk + Owl room entry captures and rows (Playwright library, pinned chromium-1243 by executablePath; no install).
//   TPP_BASE=http://127.0.0.1:5206 TPP_EVIDENCE=<EV> node tests/view/capture/work-023-2.mjs
// <EV> holds the *.real.json saves (npm run fixture). Strict boot (tools/known-missing-assets.json is empty on the merged base).
// Every expectation is read from window.__tpp (log, store, scenes) and the DOM; beat wall times are performance.now() stamps per frame.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha, launch, boot, waitScene, lines, getState, until, steer, startRecording, encode, shot as harnessShot, writeJson, errorsSummary } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const WORK = 'WORK-023-2', captures = join(EV, 'captures'), loops = join(EV, 'loops'), rowsDir = join(EV, 'rows');
const save = name => readFileSync(join(EV, `${name}.real.json`), 'utf8');
const IPHONE = 'not-run (user, MILESTONE-007)', TASTE = 'not-run (user, play session)', SOUND = 'not-run (user-managed sound)';
const meta = (saveName, extra = {}) => ({ work: WORK, milestone: 'MILESTONE-006', save: `${saveName}.real.json`, ...extra });
const errorsByWindow = [];

/** Holds the walk object once seen and stamps each new timeline beat, the box show and the HUD text with performance.now(). */
const watchWalk = () => {
  window.__walk = null; window.__stamps = [];
  const frame = () => {
    const tpp = window.__tpp, st = tpp?.game?.scene?.getScene('Street');
    if (st?.arrival && window.__walk !== st.arrival) { window.__walk = st.arrival; window.__walkSeenAt = performance.now(); }
    const w = window.__walk;
    if (w) {
      while (window.__stamps.length < w.timeline.length) window.__stamps.push({ ...w.timeline[window.__stamps.length], wall: performance.now() });
      if (!w.finished) {
        const s = w.sprite; (window.__poses ??= []).push({ t: performance.now(), x: s.x, y: s.y, flipX: s.flipX, depth: s.depth, alpha: s.alpha, clip: s.anims.currentAnim?.key ?? null });
      }
      const box = document.querySelector('.tpp-dialogue');
      if (box && !box.hidden && window.__boxShownAt === undefined) window.__boxShownAt = performance.now();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
};

async function close(w, name) { const all = await lines(w.page); errorsByWindow.push({ window: name, ...errorsSummary(w.errors, all) }); await w.context.close(); }
async function drain(page, ms = 10000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const s = await getState(page);
    if (!s.dialogue.current) return;
    await page.locator('[data-panel="dialogue"]').click({ position: { x: 300, y: 60 } }); await page.waitForTimeout(350);
  }
}
const hudRead = page => page.evaluate(() => {
  const el = document.querySelector('.tpp-more-homes');
  return { text: el?.textContent ?? null, visible: !!el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden' };
});
const doorRead = page => page.evaluate(() => {
  const s = window.__tpp.store.getState(), st = window.__tpp.game.scene.getScene('Street');
  const door = window.__tpp.content?.street?.houses.find(h => h.projectId === 'pet-house')?.door ?? null;
  return { arrival: s.arrival, arrivalDone: s.projects['pet-house'].arrivalDone, door, avatar: s.avatar, scene: s.scene, houseDepth: st?.houses.get('pet-house')?.depth ?? null };
});

/** Screen 5: the walk replays on boot; 🎵 at the door; fade; the held completion box appears (1080, recorded). */
async function arrival(browser) {
  const w = await boot(browser, { height: 1080, save: save('arrival-held-box'), query: '', init: watchWalk });
  const rec = await startRecording(w.page);
  await waitScene(w.page, 'Street', 0);
  await until(w.page, () => window.__walk !== null, null, 10000);
  const atStart = await w.page.evaluate(() => ({ x: window.__walk.sprite.x, y: window.__walk.sprite.y, clip: window.__walk.sprite.anims.currentAnim?.key ?? null,
    texture: window.__walk.sprite.texture.key, plan: window.__walk.plan, path: window.__walk.path, frozen: !!window.__tpp.store.getState().arrival }));
  const doorBefore = await doorRead(w.page);
  await until(w.page, () => window.__walk.bubble.current() !== null, null, 5000);
  const atDoor = await w.page.evaluate(() => ({ x: window.__walk.sprite.x, y: window.__walk.sprite.y, bubble: window.__walk.bubble.current(),
    bubbleAt: { x: window.__walk.bubble.x, y: window.__walk.bubble.y, depth: window.__walk.bubble.depth }, anchor: window.__walk.sprite.bubbleAnchor(),
    boxHidden: document.querySelector('.tpp-dialogue').hidden }));
  const hud = await hudRead(w.page);
  const still = await harnessShot(w.page, browser, captures, 'screen-5-street-arrival-1080', meta('arrival-held-box', { note: 'Owl at the pet-front door point with the 🎵 greeting; HUD "More homes coming"; the completion box held (mec-002 §2.6)' }));
  await until(w.page, () => window.__walk.finished, null, 6000);
  await until(w.page, () => window.__boxShownAt !== undefined, null, 4000).catch(() => null);
  await w.page.waitForTimeout(1200);
  const loop = encode(loops, 'arrival-walk', await rec.stop(), meta('arrival-held-box', { target: 'boot → Owl at (1820,910) → walk → door → 🎵 → fade → held box appears' }));
  const read = await w.page.evaluate(() => ({ stamps: window.__stamps, seenAt: window.__walkSeenAt, boxShownAt: window.__boxShownAt ?? null, poses: window.__poses ?? [],
    finishedLines: window.__tpp.log.lines().filter(l => l.type === 'arrival.finished').length, dialogue: window.__tpp.store.getState().dialogue.current?.source ?? null }));
  const doorAfter = await doorRead(w.page);
  return { w, atStart, atDoor, hud, still, loop, read, doorBefore, doorAfter };
}

/** Enter pet-front by keyboard (steer) and capture the Owl room entry (greeting, intro with the Owl portrait, want panel). */
async function enterOwlRoom(w, browser, point, saveName) {
  await drain(w.page);
  const entered = await steer(w.page, 1500, 790, () => window.__tpp.store.getState().scene.kind === 'interior', 20000, 10);
  await waitScene(w.page, 'Interior', 0);
  await until(w.page, () => window.__tpp.game.scene.getScene('Interior').bubble?.current()?.class === 'greeting', null, 6000).catch(() => null);
  await w.page.waitForTimeout(150);
  const read = await w.page.evaluate(() => {
    const l = window.__tpp.log.lines(), changed = l.filter(x => x.type === 'scene.changed').at(-1), greet = l.find(x => x.type === 'pet.reacted' && x.reaction === 'greeting' && x.t >= (changed?.t ?? 0));
    const box = document.querySelector('.tpp-dialogue'), want = document.querySelector('.tpp-wantPanel');
    return { sceneChanged: changed ? { to: changed.to } : null, greetingAfterMs: changed && greet ? Math.round(greet.t - changed.t) : null,
      intro: l.find(x => x.type === 'dialogue.opened' && x.script?.source === 'intro' && x.t >= (changed?.t ?? 0))?.script?.speaker ?? null,
      portrait: box?.querySelector('.tpp-portrait [data-asset-id]')?.dataset.assetId ?? null, portraitReal: box?.querySelector('.tpp-portrait img') !== null, boxHidden: box?.hidden ?? null,
      speaker: box?.querySelector('.tpp-speaker')?.textContent ?? null, want: l.find(x => x.type === 'want.activated' && x.t >= (changed?.t ?? 0)) ?? null, wantPanelHidden: want?.hidden ?? null,
      bubble: window.__tpp.game.scene.getScene('Interior').bubble?.current() ?? null, room: window.__tpp.store.getState().scene };
  });
  const still = await harnessShot(w.page, browser, captures, point, meta(saveName, { note: 'Owl room entry: greeting 🎵, intro box with the Owl portrait, want panel' }));
  return { entered, read, still };
}

/** Design mode: perch-branch at wall-2 → walk over → use-perch on the seat → emote (loop). */
async function perch(w) {
  await drain(w.page);
  const rec = await startRecording(w.page);
  await w.page.evaluate(() => { const d = window.__tpp.store.dispatch; d({ type: 'setDesignMode', on: true }); d({ type: 'placeCharm', slotId: 'wall-2', typeId: 'perch-branch' }); });
  const samples = await w.page.evaluate(() => new Promise(resolve => {
    const out = [], t0 = performance.now(), it = window.__tpp.game.scene.getScene('Interior');
    const frame = () => {
      const b = window.__tpp.store.getState().pets.owl.behaviour, p = it.pet;
      out.push({ t: Math.round(performance.now() - t0), phase: b.phase, verb: b.verb, x: p.x, y: p.y, depth: p.depth, flipX: p.flipX, facing: b.facing, clip: p.anims.currentAnim?.key ?? null });
      if (performance.now() - t0 < 9000 && !(b.phase === 'using' && out.filter(s => s.phase === 'using').length > 90)) requestAnimationFrame(frame); else resolve(out);
    };
    frame();
  }));
  await w.page.waitForTimeout(600);
  const loop = encode(loops, 'owl-perch', await rec.stop(), meta('arrival-held-box', { target: 'perch-branch placed at wall-2 (design mode, store dispatch) → walk over → use-perch on the seat → emote' }));
  const charmDepth = await w.page.evaluate(() => window.__tpp.game.scene.getScene('Interior').charms.get('wall-2')?.depth ?? null);
  return { samples, loop, charmDepth };
}

async function at823(browser) {
  const w = await boot(browser, { height: 823, save: save('arrival-held-box'), query: '', init: watchWalk });
  await waitScene(w.page, 'Street', 0);
  await until(w.page, () => window.__walk && window.__walk.bubble.current() !== null, null, 8000);
  await harnessShot(w.page, browser, captures, 'screen-5-street-arrival-823', meta('arrival-held-box'));
  await until(w.page, () => window.__walk.finished, null, 6000);
  const entry = await enterOwlRoom(w, browser, 'owl-room-entry-823', 'arrival-held-box');
  await close(w, 'arrival-823');
  return entry;
}

function timingRow(a) {
  const st = Object.fromEntries(a.read.stamps.map(s => [s.beat, s]));
  const plan = a.atStart.plan, walkMs = st.door ? st.door.atMs : null, bubbleMs = st.fade && st.greeting ? st.fade.atMs - st.greeting.atMs : null;
  const fadeMs = st.finished && st.fade ? st.finished.atMs - st.fade.atMs : null, totalMs = st.finished ? st.finished.atMs : null;
  // The scene's 250 ms camera fade-in skips syncScene (WorldScene), so wall time runs from the first frame the sprite moved.
  const moved = a.read.poses.find(p => p.x !== a.atStart.path[0].x || p.y !== a.atStart.path[0].y);
  const wallTotal = st.finished && moved ? Math.round(st.finished.wall - moved.t) : null;
  const expected = { walkMs: plan.doorMs, bubbleMs: plan.fadeMs - plan.doorMs, fadeMs: plan.finishMs - plan.fadeMs, totalMs: plan.finishMs };
  const measured = { walkMs, bubbleMs, fadeMs, totalMs, wallClockTotalMs: wallTotal, wallFromCreateMs: st.finished && st.walk ? Math.round(st.finished.wall - st.walk.wall) : null, boxShownAfterFinishMs: a.read.boxShownAt && st.finished ? Math.round(a.read.boxShownAt - st.finished.wall) : null };
  const deltas = Object.fromEntries(Object.keys(expected).map(k => [k, measured[k] === null ? null : Math.round(measured[k] - expected[k])]));
  const row = { id: 'arrival-timing', work: WORK, sha, source: 'ArrivalWalk.timeline (scene-clock ms, syncScene deltas) + performance.now() stamps per frame', expected, measured, deltas,
    pathLengthPx: Math.round(plan.doorMs * 0.48), stamps: a.read.stamps,
    doorPoint: a.atStart.path.at(-1), doorRect: a.doorBefore.door?.rect ?? null, doorNote: 'path end vs door rect and painted door judged from the screen-5 still; world geometry not moved (DEC-038)' };
  row.result = totalMs !== null && Math.abs(totalMs - plan.finishMs) <= 100 && wallTotal !== null && Math.abs(wallTotal - plan.finishMs) <= 100 ? 'pass' : 'fail';
  row.note = 'wallClockTotalMs runs from the first moved frame (one frame of travel is lost to the frame boundary); wallFromCreateMs includes the 250 ms scene fade-in during which WorldScene skips syncScene and the Owl stands at path[0]';
  return row;
}

function arrivalRow(a, entry) {
  const row = { id: 'VERIFY-MEC-002-025', half: 'arrival (Chrome desktop 1920x1080); the skip/second-cutscene half is WORK-023-3', work: WORK, sha, save: 'arrival-held-box.real.json (owl-arrived steps through closeReveal: arrival set, phase + completion messages queued)',
    start: a.atStart, atDoor: a.atDoor, hud: a.hud, arrivalFinishedLines: a.read.finishedLines, doorEnabledBefore: a.doorBefore.arrival !== null ? false : null,
    after: { arrival: a.doorAfter.arrival, arrivalDone: a.doorAfter.arrivalDone }, heldBox: { hiddenDuringWalk: a.atDoor.boxHidden, shownAfterFinish: a.read.boxShownAt !== null, source: a.read.dialogue },
    enteredOwlRoom: entry.read.sceneChanged, still: a.still, loop: a.loop.outputs?.mp4 ?? a.loop.gap, taste: TASTE, sound: SOUND, iphone: IPHONE,
    note: 'doorEnabled is the sim selector (arrival === null && arrivalDone); read here as state.arrival/arrivalDone and proven by walking into pet-front' };
  row.result = a.atStart.clip === 'pet-owl-walk' && a.atDoor.bubble?.text === '🎵' && a.read.finishedLines === 1 && a.hud.text === 'More homes coming' && a.hud.visible
    && a.doorAfter.arrival === null && a.doorAfter.arrivalDone && a.atDoor.boxHidden && a.read.boxShownAt !== null && entry.read.sceneChanged?.to?.roomId === 'owl-room' ? 'pass' : 'fail';
  return row;
}

function owlRow(a, p, entry) {
  const walking = p.samples.filter(s => s.phase === 'walking'), using = p.samples.filter(s => s.phase === 'using');
  const walkPoses = a.read.poses.filter(s => s.alpha === 1 && s.clip);
  const row = { id: 'VERIFY-MEC-007-016', pet: 'owl', work: WORK, sha, half: 'Chrome desktop 1920x1080', additive: 'VERIFY-ASSET-005 use-perch registration',
    streetWalk: { clips: [...new Set(walkPoses.map(s => s.clip))], flipXLeft: walkPoses.filter(s => s.x < 1820 && s.y > 806).every(s => s.flipX), depthAboveHouse: walkPoses.every(s => s.depth > (a.doorBefore.houseDepth ?? Infinity)) },
    room: { walkClip: [...new Set(walking.map(s => s.clip))], walkFlipMatchesFacing: walking.every(s => s.flipX === (s.facing === 'left')), walkDepthEqualsY: walking.every(s => s.depth === s.y),
      usingVerb: [...new Set(using.map(s => s.verb))], usingClip: [...new Set(using.map(s => s.clip))], seat: using.at(-1) ? { x: using.at(-1).x, y: using.at(-1).y, depth: using.at(-1).depth } : null, charmDepth: p.charmDepth },
    entry: entry.read, loop: p.loop.outputs?.mp4 ?? p.loop.gap, taste: TASTE, iphone: IPHONE };
  row.result = row.streetWalk.clips.includes('pet-owl-walk') && row.room.walkClip.every(c => c === 'pet-owl-walk') && walking.length > 0 && row.room.walkFlipMatchesFacing && row.room.walkDepthEqualsY
    && row.room.usingVerb.join() === 'perch' && row.room.usingClip.join() === 'pet-owl-use-perch' && entry.read.portrait === 'pets/owl-portrait' && entry.read.greetingAfterMs !== null ? 'pass' : 'fail';
  return row;
}

const browser = await launch();
try {
  const a = await arrival(browser);
  const entry = await enterOwlRoom(a.w, browser, 'owl-room-entry-1080', 'arrival-held-box');
  const p = await perch(a.w);
  await close(a.w, 'arrival-1080');
  const e823 = await at823(browser);
  const timing = timingRow(a), arr = arrivalRow(a, entry), owl = owlRow(a, p, entry);
  arr.entry823 = e823.read;
  writeJson(join(rowsDir, 'arrival-timing.json'), timing);
  writeJson(join(rowsDir, 'mec-002-025-arrival.json'), arr);
  writeJson(join(rowsDir, 'mec-007-016-owl.json'), owl);
  writeJson(join(EV, 'capture-errors.json'), errorsByWindow);
  console.log(JSON.stringify({ timing: timing.result, measured: timing.measured, deltas: timing.deltas, arrival: arr.result, owl: owl.result, room: owl.room, streetWalk: owl.streetWalk, entry: entry.read,
    errors: errorsByWindow.map(e => [e.window, e.consoleErrors.length, e.pageErrors.length, e.assetLoadErrors.length, e.appErrors.length]) }));
} finally { await browser.close(); }

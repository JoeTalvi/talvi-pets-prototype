// WORK-021-2 combined M1 trace 0:00 → 5:00 (design §4; MILESTONE-005 outcome) on the Playwright library (chromium-1243, no install).
//   TPP_BASE=http://127.0.0.1:5199 TPP_EVIDENCE=<lane evidence dir> node tests/e2e/m1-trace.mjs
// Fresh localStorage (runtime seed 1234), playtest cadence (eventIntervalMs 20000, no debug cadence change), 1920×1080, real inputs
// (keyboard, joystick drag, taps on the canvas and the panels); window.__tpp only to read. One continuous CDP screencast (1280×720) is
// streamed to disk; the ten beat loops are cut from it by wall-time marks and trace-full is the whole stream at 960×540.
// Writes trace-report.json, trace-log.jsonl, storage-reads.json, loops/*, captures/*. Exit 0 iff every beat is ok.
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { base, evidenceRoot, sha, launch, boot, waitScene, lines, getState, count, first, strip, eq, until, waitLine, tapSlot, holdUntil, steer,
  joystickHold, domRead, shot, encode, startStreamRecording, exportLog, writeJson, WORK } from './lib/harness.mjs';

const loopsDir = join(evidenceRoot, 'loops'), capturesDir = join(evidenceRoot, 'captures');
const PHASE_WAIT_MS = 8 * 60 * 1000;
const beats = [], marks = {};
const traceStart = Date.now();
const mark = name => { marks[name] = Date.now(); return marks[name]; };
let page, browser, stream, all = [];
const refresh = async () => { all = await lines(page); return all; };
function beat(name, ok, expected, found, extra = {}) {
  const lastT = extra.line?.t ?? null;
  beats.push({ beat: name, expected, found, ok: Boolean(ok), t: lastT, wall: new Date().toISOString(), elapsedMs: Date.now() - traceStart, ...extra, line: undefined });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
  return ok;
}
async function still(point, note, extra = {}) {
  return shot(page, browser, capturesDir, point, { target: `${base}/?lenient=1`, seededSave: 'none (fresh localStorage, trace session)', note, dom: await domRead(page), ...extra });
}

/** Page-side: panel visibility timeline (dialogue, toast; Date.now()) and an rAF sampler of avatar / Dog sprites while __sampling. */
function pageInit() {
  window.__vis = []; window.__samples = []; window.__sampling = false;
  const watch = () => {
    const panels = document.querySelector('#panels');
    if (!panels || !panels.querySelector('[data-panel="toast"]')) return requestAnimationFrame(watch);
    const stamp = (el, hidden) => window.__vis.push({ t: Date.now(), panel: el.dataset.panel, hidden, text: hidden ? null : el.textContent.trim().replace(/\s+/g, ' ').slice(0, 160) });
    for (const el of panels.querySelectorAll('[data-panel="dialogue"], [data-panel="toast"]')) stamp(el, el.hidden);
    new MutationObserver(list => { for (const m of list) if (m.target.matches?.('[data-panel="dialogue"], [data-panel="toast"]')) stamp(m.target, m.target.hidden); })
      .observe(panels, { subtree: true, attributes: true, attributeFilter: ['hidden'] });
  };
  const sample = () => {
    if (window.__sampling && window.__tpp?.game) {
      const { game, store } = window.__tpp, interior = game.scene.isActive('Interior') ? game.scene.getScene('Interior') : null, s = store.getState();
      const pet = interior?.pet, av = interior?.avatar;
      window.__samples.push({ t: Date.now(), scene: s.scene.kind, storeAvatar: { x: s.avatar.x, y: s.avatar.y },
        interiorActive: !!interior, fading: !!interior?.cameras.main.fadeEffect?.isRunning,
        avatarSprite: av ? { x: Math.round(av.x), y: Math.round(av.y), depth: av.depth } : null,
        dog: pet ? { x: Math.round(pet.x), y: Math.round(pet.y), depth: pet.depth, flipX: pet.flipX, anim: pet.anims?.currentAnim?.key ?? null, phase: s.pets.dog.behaviour.phase, verb: s.pets.dog.behaviour.verb } : null });
    }
    requestAnimationFrame(sample);
  };
  document.addEventListener('DOMContentLoaded', () => { watch(); sample(); });
}
const takeSamples = () => page.evaluate(() => window.__samples.splice(0));
const sampling = on => page.evaluate(on => { window.__sampling = on; }, on);
const vis = () => page.evaluate(() => window.__vis);

async function tapBox(limit = 12) {
  let taps = 0;
  while (taps < limit && (await getState(page)).dialogue.current) {
    const box = page.locator('[data-panel="dialogue"]');
    if (await box.isVisible()) { await box.click({ position: { x: 300, y: 60 } }); taps++; }
    await page.waitForTimeout(380);
  }
  return taps;
}
async function drainAll(quietMs = 1500, ms = 25000) {
  let taps = 0, quietSince = Date.now(); const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if ((await getState(page)).dialogue.current) { taps += await tapBox(); quietSince = Date.now(); }
    else if (Date.now() - quietSince >= quietMs) break;
    await page.waitForTimeout(150);
  }
  return taps;
}
const boxShown = (ms = 12000) => until(page, () => window.__tpp.store.getState().dialogue.current !== null && !document.querySelector('[data-panel="dialogue"]').hidden, null, ms);
const toggleEnabled = () => until(page, () => !document.querySelector('.tpp-design-toggle').disabled, null, 8000);
const wallOf = l => (l ? Date.parse(l.wall) : null);

// ---- 0:00 orientation ------------------------------------------------------------------------------------------------
async function orientation() {
  mark('orientationStart');
  await page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Street'), null, { timeout: 45000 });
  await waitScene(page, 'Street', 900);
  const s = await getState(page), dom = await domRead(page);
  const cur = s.dialogue.current;
  await still('screen-11-dialogue-game-1080', 'orientation box: game narration, text-only (renders screen 11, game half)');
  const taps = await tapBox();
  await page.waitForTimeout(400);
  const joyAfter = (await domRead(page)).joystickVisible;
  await refresh();
  beat('0:00 orientation: 2 lines in a text-only game box; joystick appears', cur?.source === 'orientation' && cur.lines?.length === 2 && dom.dialogue.visible && dom.dialogue.textOnly && dom.joystickVisible === false && joyAfter === true,
    "dialogue.current {source orientation, 2 lines}; box .text-only-game; joystick hidden while the box freezes input, visible once it closes", { source: cur?.source, lines: cur?.lines, speaker: cur?.speaker ?? null, dom: dom.dialogue, joystickVisibleWithBox: dom.joystickVisible, joystickVisibleAfterClose: joyAfter },
    { deviation: 'design §4 0:00 "Joystick appears": the joystick is hidden while the orientation box freezes input and appears when it closes (presentation input freeze)' });
  const closed = first(all, 'dialogue.closed', { source: 'orientation' });
  mark('orientationClosed');
  beat('0:00 orientation: two taps close it; dialogue.current === null', closed && (await getState(page)).dialogue.current === null && taps === 2, 'dialogue.advanced ×1, dialogue.closed {orientation}; 2 taps',
    { taps, closed: strip(closed) }, { line: closed });
  await page.waitForTimeout(800);
  await still('screen-1-street-idle-1080', 'street idle after the orientation (renders screen 1)');
}

// ---- 0:30 door, greeting, intro, want 1 ---------------------------------------------------------------------------------
async function doorGreetingIntro() {
  mark('doorStart');
  // WORK-032-1: starter-front sits below the house base; drop below the rect so the joystick walk passes under it.
  await holdUntil(page, 'KeyS', () => window.__tpp.store.getState().avatar.y >= 945);
  const joy = await joystickHold(page, -90, 0, () => window.__tpp.store.getState().avatar.x <= 480, null, 15000);
  await sampling(true);
  const inRoom = await holdUntil(page, 'KeyW', () => window.__tpp.store.getState().scene.kind === 'interior');
  await waitScene(page, 'Interior', 300);
  await boxShown(9000); mark('introShown');
  const introDom = await domRead(page);
  await still('screen-11-dialogue-pet-1080', 'intro box: pet speaker with portrait (renders screen 11, pet half)');
  await page.waitForTimeout(1200);
  await sampling(false);
  const samples = await takeSamples(); await refresh();
  const sc = first(all, 'scene.changed', { to: { kind: 'interior', roomId: 'dog-room' } }), greet = first(all, 'pet.reacted', { reaction: 'greeting' });
  const greetPhase = first(all, 'pet.phaseChanged', { to: 'greeting' }), introOpened = all.find(l => l.type === 'dialogue.opened' && l.script?.source === 'intro');
  const timeline = await vis(), introVisible = timeline.find(v => v.panel === 'dialogue' && !v.hidden && sc && v.t >= wallOf(sc));
  const firstActive = samples.find(x => x.interiorActive), fadeEnd = samples.find(x => x.interiorActive && !x.fading && firstActive && x.t >= firstActive.t);
  const duringFade = samples.filter(x => sc && x.t >= wallOf(sc) && (!x.interiorActive || x.fading));
  const moved = duringFade.filter(x => x.storeAvatar.x !== duringFade[0]?.storeAvatar.x || x.storeAvatar.y !== duringFade[0]?.storeAvatar.y);
  beat('0:30 walk into the Starter House door (joystick, then KeyW) → scene.changed {to: interior dog-room}', joy.reached && inRoom && sc, 'input.joystick start/end; scene.changed {to dog-room}',
    { joystick: joy, joystickLines: all.filter(l => l.type === 'input.joystick').map(strip), sceneChanged: strip(sc) }, { line: sc });
  const fade = { sceneChangedWall: sc?.wall, interiorActiveMs: firstActive && sc ? firstActive.t - wallOf(sc) : null, fadeInEndMs: fadeEnd && sc ? fadeEnd.t - wallOf(sc) : null, samplesDuringFades: duringFade.length, avatarMovedDuringFades: moved.length };
  beat('0:30 door fades (VERIFY-PRES-005 in): fade out 250 → swap → fade in 250; no avatar movement during the fades', fade.interiorActiveMs !== null && fade.interiorActiveMs <= 600 && moved.length === 0,
    'scene.changed → Interior active ≈ 250–500 ms; fade-in end recorded; avatar still during fades', fade);
  beat('0:30 greeting: pet.reacted {greeting} (🎵); intro box hidden until the greeting phase', greet && greetPhase && introOpened && introVisible && introVisible.t >= wallOf(greetPhase) - 20,
    'pet.reacted {reaction greeting}; box first visible at/after pet.phaseChanged {to greeting}',
    { greeting: strip(greet), greetingPhase: strip(greetPhase), introOpenedWall: introOpened?.wall, introBoxVisibleWall: introVisible && new Date(introVisible.t).toISOString(), boxAfterGreetingMs: introVisible && greetPhase ? introVisible.t - wallOf(greetPhase) : null, boxAfterSceneChangedMs: introVisible && sc ? introVisible.t - wallOf(sc) : null },
    { line: greet, deviation: 'WORK-019-1 (fix 1) FORK checkpoint 0e38355: the greeting walk (sim ≈ 507 ms) runs under the 2 × 250 ms scene fade, so it is not visible; recorded as seen (ledger return)' });
  const t1 = await tapBox(1);
  const mid = await getState(page);
  const t2 = await tapBox(1);
  await boxShown(4000);
  await refresh();
  const announce = all.find(l => l.type === 'dialogue.opened' && l.script?.source === 'wantAnnounce');
  beat('0:30 intro ×2 lines (pet speaker), then want 1 announced', introOpened?.script?.lines?.length === 2 && introDom.dialogue.speaker && first(all, 'dialogue.closed', { source: 'intro' }) && announce && first(all, 'want.activated', { wantId: 'soft-nap' }),
    'intro 2 lines; dialogue.closed {intro}; dialogue.opened {wantAnnounce}; want.activated {soft-nap}',
    { introLines: introOpened?.script?.lines, speaker: introDom.dialogue.speaker, taps: t1 + t2, afterFirstTap: mid.dialogue.current && { source: mid.dialogue.current.source, index: mid.dialogue.current.index }, announce: announce?.script?.lines, want1: strip(first(all, 'want.activated', { wantId: 'soft-nap' })) },
    { line: announce });
  await drainAll(1200);
  await page.waitForTimeout(400);
  const dom = await domRead(page);
  await still('screen-10-want-state-a-1080', 'want panel state a: want 1 with soft and seat (renders screen 10)');
  beat("0:30 want panel state a with 'soft' and 'seat'", dom.want.visible && /soft/i.test(dom.want.text) && /seat/i.test(dom.want.text), 'want panel visible; text names soft and seat', { want: dom.want });
  mark('doorEnd');
}

// ---- 1:00 Dog Bed, nap, heart, vignette, want 2 -------------------------------------------------------------------------
async function bedBeat() {
  await toggleEnabled();
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(450);
  await still('screen-7-design-mode-1080', 'design mode on, slot outlines (renders screen 7)');
  await tapSlot(page, 'large-1');
  await until(page, () => !document.querySelector('.tpp-chooser').hidden, null, 3000);
  await sampling(true);
  mark('bedClick');
  await page.click('.tpp-charm-card[data-type-id="dog-bed"]');
  await page.waitForTimeout(250);
  const deltaDom = await domRead(page);
  await still('screen-15-stars-delta-1080', 'stars bar with the +4 ★ delta float right after the Dog Bed (renders screen 15)');
  await until(page, () => window.__tpp.log.lines().some(l => l.type === 'pet.phaseChanged' && l.to === 'using'), null, 12000);
  mark('using');
  await page.waitForTimeout(600);
  await still('dog-using-bed-1080', 'the Dog in the using (nap) pose on the Dog Bed at large-1');
  await boxShown(9000); mark('vignetteShown');
  await sampling(false);
  const samples = await takeSamples(); await refresh();
  const placed = first(all, 'charm.placed', { slotId: 'large-1', typeId: 'dog-bed' }), stars = first(all, 'stars.changed', { from: 0, to: 4 });
  const fulfilled = first(all, 'want.fulfilled', { wantId: 'soft-nap' }), heart = first(all, 'heart.earned', { hearts: 1 }), love = all.find(l => l.type === 'pet.reacted' && l.t >= (placed?.t ?? 0) && l.reaction !== 'greeting');
  const using = all.find(l => l.type === 'pet.phaseChanged' && l.to === 'using' && l.t >= (placed?.t ?? 0)), reacting = all.find(l => l.type === 'pet.phaseChanged' && l.to === 'reacting' && l.t >= (placed?.t ?? 0));
  const unlocked = all.filter(l => l.type === 'types.unlocked' && l.t >= (placed?.t ?? 0));
  const vignette = all.find(l => l.type === 'dialogue.opened' && l.script?.source === 'vignette');
  const dogSamples = samples.filter(x => x.dog);
  const usingSamples = dogSamples.filter(x => x.dog.phase === 'using'), walkSamples = dogSamples.filter(x => x.dog.phase === 'walking');
  beat('1:00 Decorate → large-1 → Dog Bed: charm.placed, +4 ★ float, stars 0 → 4 (of 48)', placed && stars && /\+\s*4/.test(deltaDom.hudInterior.delta ?? deltaDom.hudInterior.text) && /4\s*\/\s*48/.test(deltaDom.hudInterior.text),
    "charm.placed {large-1, dog-bed}; stars.changed {0 → 4}; HUD delta '+4 ★'; label '4 / 48'", { placed: strip(placed), stars: strip(stars), hud: deltaDom.hudInterior }, { line: placed });
  beat('1:00 the Dog walks to the cushion anchor and naps (using, draw-above at large-1); ❤️', reacting && using?.verb === 'nap' && love && usingSamples.length > 0 && usingSamples.every(x => x.dog.depth > 930),
    "pet.phaseChanged reacting → using {verb nap}; pet.reacted (love ❤️); Dog depth above the bed (930) while using",
    { reacting: strip(reacting), using: strip(using), reaction: strip(love), walkSamples: walkSamples.length, usingSamples: usingSamples.length, usingDepths: [...new Set(usingSamples.map(x => x.dog.depth))].slice(0, 5), usingAnims: [...new Set(usingSamples.map(x => x.dog.anim))], walkFlipX: [...new Set(walkSamples.map(x => x.dog.flipX))], walkDepthEqY: walkSamples.every(x => x.dog.depth === x.dog.y) },
    { line: using, deviation: 'gate default (verbatim): "bed anchor onto the cushion with a draw-above rule for the using pet; keep the wall-anchor facing; both captured as loops for the user\'s rewind decision."' });
  beat('1:00 want 1 fulfilled → heart.earned {1}; reward named (rug, cushion unlocked)', fulfilled && heart && unlocked.some(u => ['rug', 'cushion'].every(t => u.typeIds.includes(t))),
    "want.fulfilled {soft-nap}; heart.earned {hearts 1}; types.unlocked {rug, cushion}", { fulfilled: strip(fulfilled), heart: strip(heart), unlocked: unlocked.map(strip) }, { line: heart });
  const timeline = await vis(), shownV = timeline.find(v => v.panel === 'dialogue' && !v.hidden && placed && v.t >= wallOf(placed));
  const def = { charmPlacedWall: placed?.wall, usingWall: using?.wall, vignetteOpenedWall: vignette?.wall, boxShownWall: shownV && new Date(shownV.t).toISOString(),
    boxAfterPlacedMs: shownV && placed ? shownV.t - wallOf(placed) : null, boxAfterReactingMs: shownV && reacting ? shownV.t - wallOf(reacting) : null };
  mark('vignetteTapStart');
  let vt = 0;
  while (vt < 6 && (await getState(page)).dialogue.current?.source === 'vignette') { await page.locator('[data-panel="dialogue"]').click({ position: { x: 300, y: 60 } }); vt++; await page.waitForTimeout(380); }
  mark('vignetteClosed');
  await boxShown(4000); await refresh();
  const announce2 = all.find(l => l.type === 'dialogue.opened' && l.script?.source === 'wantAnnounce' && l.t > (vignette?.t ?? 0));
  beat('1:00 vignette ×3 lines deferred per mec-008 §2.7 (box hidden until reacting + 2,000 ms, ≤ 7,000 ms after charm.placed); then want 2 announced',
    vignette?.script?.lines?.length === 3 && def.boxAfterPlacedMs !== null && def.boxAfterPlacedMs <= 7000 && def.boxAfterReactingMs >= 1900 && vt === 3 && announce2 && first(all, 'want.activated', { wantId: 'bright-corner' }),
    'vignette 3 lines; box shown 2,000 ms after reacting and ≤ 7,000 ms after placement; 3 taps; wantAnnounce; want.activated {bright-corner}',
    { vignetteLines: vignette?.script?.lines, deferral: def, taps: vt, want2: strip(first(all, 'want.activated', { wantId: 'bright-corner' })) },
    { line: announce2, deviation: 'WORK-019-3 FLAG: at 1920×1080 the vignette box (top y 800) covers the Dog napping on the bed (base y 900); spec-conformant, recorded (return)' });
  await drainAll(1200);
  report.mec007Samples = { walk: walkSamples.slice(0, 40), using: usingSamples.slice(0, 10) };
}

// ---- 2:00 want 2 panel, lamp, look-at, 🙂, bubble tap ---------------------------------------------------------------------
async function lampBeat() {
  await page.waitForTimeout(600);
  const dom = await domRead(page);
  await still('screen-10-want-state-b-1080', "want panel state b: want 2 with 'plant' missing (arrives with the next home phase) (renders screen 10)");
  beat("2:00 want 2 panel: 'plant' missing, 'arrives with the next home phase'", dom.want.visible && /plant/i.test(dom.want.text) && /next home phase/i.test(dom.want.text), "want panel text names plant and 'next home phase'", { want: dom.want });
  await toggleEnabled();
  // design mode is still on after the bed (Done was disabled while the deferred vignette was in state); open it if it is off
  if ((await getState(page)).mode !== 'design') { await page.click('.tpp-design-toggle'); await page.waitForTimeout(400); }
  await tapSlot(page, 'floor-3');
  await until(page, () => !document.querySelector('.tpp-chooser').hidden, null, 3000);
  await page.waitForTimeout(300);
  await still('screen-8-chooser-small-1080', 'chooser open on the small slot floor-3 (renders screen 8)');
  mark('lampClick');
  await page.click('.tpp-charm-card[data-type-id="lamp"]');
  const liked = await waitLine(page, 'pet.reacted', { reaction: 'like' }, 12000);
  await page.waitForTimeout(500);
  await still('screen-15-stars-bubble-1080', 'stars bar and the 🙂 bubble over the Dog (renders screen 15)');
  // VERIFY-PRES-010: tap the bubble → text for 3 s; ui.bubbleTapped
  const bub = await page.evaluate(() => {
    const i = window.__tpp.game.scene.getScene('Interior'), b = i.bubble, r = window.__tpp.game.canvas.getBoundingClientRect(), k = r.width / 1920, cam = i.cameras.main;
    if (!b) return null;
    for (let dy = -80; dy <= 40; dy += 8) for (let dx = -40; dx <= 40; dx += 8) if (b.contains(b.x + dx, b.y + dy)) return { x: r.left + (b.x + dx - cam.scrollX) * k, y: r.top + (b.y + dy - cam.scrollY) * k, current: b.current() };
    return { miss: true, x: b.x, y: b.y, current: b.current() };
  });
  let tapped = null;
  if (bub && !bub.miss) { await page.mouse.click(bub.x, bub.y, { delay: 40 }); await page.waitForTimeout(400); tapped = await page.evaluate(() => window.__tpp.game.scene.getScene('Interior').bubble?.current() ?? null); }
  await page.waitForTimeout(3300);
  const afterText = await page.evaluate(() => window.__tpp.game.scene.getScene('Interior').bubble?.current() ?? null);
  mark('lampEnd');
  await refresh();
  const placed = first(all, 'charm.placed', { slotId: 'floor-3', typeId: 'lamp' }), like = first(all, 'pet.reacted', { reaction: 'like' }), bt = all.filter(l => l.type === 'ui.bubbleTapped');
  const look = all.find(l => l.type === 'pet.phaseChanged' && l.to === 'using' && l.t >= (placed?.t ?? 0));
  beat('2:00 Decorate → floor-3 → lamp → walk over, look-at, 🙂 (pet.reacted {like})', placed && liked && like, 'charm.placed {floor-3, lamp}; pet.reacted {like}; using {look} at the floor-3 anchor',
    { placed: strip(placed), like: strip(like), use: strip(look) }, { line: like });
  report.pres010 = { bubbleBeforeTap: bub, afterTap: tapped, after3300ms: afterText, bubbleTapped: bt.map(strip) };
  beat('2:00 VERIFY-PRES-010: tap the 🙂 bubble → its text shown, ui.bubbleTapped logged', bub && !bub.miss && bt.length >= 1 && tapped?.kind === 'text', "ui.bubbleTapped; bubble current kind 'text' after the tap", report.pres010, { line: bt.at(-1) });
  await toggleEnabled();
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  await refresh();
  beat('2:00 Done → mode.changed {play}', all.filter(l => l.type === 'mode.changed').at(-1)?.mode === 'play', 'mode.changed {mode play}', { modes: all.filter(l => l.type === 'mode.changed').map(strip) });
}

// ---- 2:30 → 4:00 toasts at cadence, phase 1, badge -------------------------------------------------------------------------
async function cadenceBeat() {
  mark('cadenceStart');
  const t0 = Date.now();
  let toastStill = false, via = 'cadence';
  while (Date.now() - t0 < PHASE_WAIT_MS) {
    await refresh();
    if (all.some(l => l.type === 'phase.reached' && l.phase === 1)) break;
    const tv = await page.evaluate(() => !document.querySelector('[data-panel="toast"]').hidden);
    if (tv && !toastStill) { toastStill = true; mark('firstToast'); await page.waitForTimeout(500); await still('screen-13-toast-1080', 'round-up toast with the +¢ badge (renders screen 13)'); }
    if ((await getState(page)).dialogue.current) await tapBox();
    await page.waitForTimeout(500);
  }
  if (!all.some(l => l.type === 'phase.reached' && l.phase === 1)) {
    via = 'debug';
    await page.keyboard.press('Backquote'); await page.waitForTimeout(400);
    let n = 0; while (n < 30 && !(await lines(page, 'phase.reached')).length) { await page.locator('.tpp-debug-row', { hasText: 'Simulate a purchase' }).locator('button').first().click(); n++; await page.waitForTimeout(150); }
    await page.keyboard.press('Backquote'); await page.waitForTimeout(400);
    report.notes.push(`phase 1 not reached after ${PHASE_WAIT_MS / 60000} min of cadence; ${n} debug purchases (order fork 2)`);
  }
  mark('phase1');
  await refresh();
  const phase = first(all, 'phase.reached', { phase: 1 }), roundups = all.filter(l => l.type === 'roundup.fired');
  const timeline = await vis();
  const toastShows = timeline.filter(v => v.panel === 'toast' && !v.hidden);
  // overlap: a toast visible interval intersecting a dialogue visible interval
  const intervals = panel => { const out = []; let open = null; for (const v of timeline.filter(x => x.panel === panel)) { if (!v.hidden && open === null) open = v.t; else if (v.hidden && open !== null) { out.push([open, v.t]); open = null; } } if (open !== null) out.push([open, Date.now()]); return out; };
  const overlaps = intervals('toast').filter(([a, b]) => intervals('dialogue').some(([c, d]) => a < d && c < b));
  report.toasts = { roundups: roundups.length, toastShows: toastShows.map(v => ({ wall: new Date(v.t).toISOString(), text: v.text })), overlapsWithDialogue: overlaps };
  beat('2:30 round-up toasts "… → …¢ to …" with the "+…¢" badge; none while a dialogue is open', toastShows.length >= 1 && toastShows.every(v => /¢/.test(v.text ?? '') && /\+/.test(v.text ?? '')) && overlaps.length === 0,
    '≥ 1 toast shown; text has ¢ and +; no toast interval overlaps a dialogue interval', report.toasts, { line: roundups[0] });
  await page.waitForTimeout(800);
  const dom = await domRead(page);
  await still('screen-6-interior-badge-1080', 'interior at phase 1 with the Q13(a) attention badge');
  beat('4:00 phase.reached {1} (cadence 20000, real time); the Q13(a) badge inside', phase && dom.hudInterior.badge, 'phase.reached {pet-house, 1}; button.tpp-attention visible', { phase: strip(phase), elapsedSinceCadenceStartMs: marks.phase1 - marks.cadenceStart, roundups: roundups.length, hud: dom.hudInterior },
    { line: phase, via, designRow: '4:00' });
}

// ---- 4:00 step outside, cutscene, milestone popup, Collect, reveal, Continue --------------------------------------------------
async function celebrationBeat() {
  await drainAll(1000);
  mark('walkOut');
  await sampling(true);
  const out = await steer(page, 693, 575, () => window.__tpp.store.getState().scene.kind === 'street', 30000);
  await page.waitForFunction(() => window.__tpp.game.scene.isActive('Street'), null, { timeout: 10000 });
  const opened = await until(page, () => !document.querySelector('.tpp-milestonePopup').hidden, null, 25000);
  mark('popupOpen');
  await sampling(false);
  const samples = await takeSamples();
  await page.waitForTimeout(700);
  await refresh();
  const sc = all.filter(l => l.type === 'scene.changed' && l.to?.kind === 'street').at(-1), cs = first(all, 'celebration.started', { fromPhase: 0, toPhase: 1 });
  const stepped = all.find(l => l.type === 'celebration.stepped' && l.step === 'milestone' && l.t >= (cs?.t ?? 0));
  const icon = await page.evaluate(() => window.__tpp.game.scene.getScene('Street').houses.get('pet-house').icon.visible);
  const outFade = samples.filter(x => sc && x.t >= wallOf(sc) && x.scene === 'street').slice(0, 30);
  beat('4:00 walk out → street (VERIFY-PRES-005 out); attention icon / tap the house', out && sc && cs,
    'scene.changed {to street}; celebration.started {0 → 1}', { sceneChanged: strip(sc), celebrationStarted: strip(cs), iconVisibleAtPopup: icon, acknowledge: all.filter(l => l.type === 'action.rejected' || (l.type === 'input.tap' && /house/.test(l.target ?? ''))).map(strip), avatarDuringOutFade: [...new Set(outFade.map(x => `${x.storeAvatar.x},${x.storeAvatar.y}`))] },
    { line: cs, deviation: 'mec-002 §2 "Arrival on the street (onStreetEntered)" (normative): arriving on the street with a phase owed acknowledges it in the door tick, so the celebration starts on entry; the design §4 4:00 "on the street, taps the house" step and the street attention icon are not reachable after a phase reached inside (the icon + tap path is read in m1-rows MEC-002-028 from a reload onto the street). Proposed design §4 text: "Player leaves through the door; arriving on the street starts the cutscene"' });
  const dom = await domRead(page);
  const project = (await getState(page)).projects['pet-house'];
  const price = `$${((1500 - project.currentCents) / 100).toFixed(2)}`;
  report.skipPrice = { label: dom.milestone.skip?.label ?? null, free: dom.milestone.skip?.free ?? null, expectedFromState: price, currentCents: project.currentCents, designRow: '$11.40 of $15.00' };
  await still('screen-3-street-celebration-1080', 'milestone popup "Coming along!" with fern + perch-branch real art and the live Skip price (renders screen 3)');
  beat('4:00 cutscene → milestone popup "Coming along!" with fern and perch-branch tiles (real art) and "Skip the wait · $<remaining>" over "Free in this prototype"',
    opened && stepped && dom.milestone.heading === 'Coming along!' && eq(dom.milestone.tiles, ['fern', 'perch-branch']) && dom.milestone.assetSlots.length === 0 && dom.milestone.skip?.label === `Skip the wait · ${price}` && dom.milestone.skip?.free === 'Free in this prototype',
    "celebration.stepped {milestone}; heading; tiles [fern, perch-branch]; zero .tpp-asset-slot; Skip label with the live remaining price", { cutsceneMs: stepped && cs ? Math.round(stepped.t - cs.t) : null, milestone: dom.milestone, skipPrice: report.skipPrice },
    { line: stepped, deviation: report.skipPrice.label === 'Skip the wait · $11.40' ? undefined : `price is live (core: remaining = goal − currentCents); design row's $11.40 is the example at its own currentCents` });
  // the saved state just before Collect, for the mid-celebration reload
  await page.waitForTimeout(600);
  report.midCelebrationSave = await page.evaluate(() => localStorage.getItem('tpp.save'));
  mark('collect');
  await page.locator('.tpp-milestonePopup .tpp-collect').click();
  const rev = await until(page, () => !document.querySelector('.tpp-revealPopup').hidden, null, 8000);
  await page.waitForTimeout(1300);
  const rdom = await domRead(page);
  await still('screen-4-street-reveal-popup-1080', 'reveal popup: mystery shape and clue card 1 feather-book "Phase 1" (renders screen 4)');
  await refresh();
  beat('4:00 Collect → collecting → reveal popup: mystery shape + card 1 clues/feather-book "Phase 1"', rev && count(all, 'rewards.collected') === 1 && rdom.reveal.mystery === 'ui/mystery-shape' && rdom.reveal.cards.length === 1 && rdom.reveal.cards[0].icon === 'clues/feather-book' && rdom.reveal.cards[0].real && rdom.reveal.cards[0].phase === 'Phase 1' && rdom.reveal.assetSlots.length === 0,
    'rewards.collected ×1; mystery ui/mystery-shape; one card feather-book (img) Phase 1; zero .tpp-asset-slot', { reveal: rdom.reveal, rewardsCollected: count(all, 'rewards.collected') }, { line: first(all, 'rewards.collected') });
  await page.locator('.tpp-revealPopup .tpp-collect').click();
  await waitLine(page, 'celebration.ended', {}, 6000);
  await page.waitForTimeout(1600);
  mark('celebrationEnded');
  await refresh();
  const d2 = await domRead(page), s = await getState(page), cam = await page.evaluate(() => { const c = window.__tpp.game.scene.getScene('Street').cameras.main; return { midPoint: [Math.round(c.midPoint.x), Math.round(c.midPoint.y)], zoom: c.zoom }; });
  beat('4:00 Continue → pan back, HUD unfrozen', count(all, 'celebration.ended') === 1 && s.celebration === null && !d2.hudStreet.frozen && eq(cam.midPoint, [960, 540]), 'celebration.ended ×1; camera midPoint (960, 540); .tpp-hudStreet not frozen',
    { camera: cam, hudStreet: d2.hudStreet, joystickVisible: d2.joystickVisible }, { line: first(all, 'celebration.ended') });
}

// ---- 5:00 back inside, Fern beside the lamp, want 2, Heart 2, sit-on --------------------------------------------------------
async function fernBeat() {
  await drainAll(1200);
  await steer(page, 475, 965, () => { const s = window.__tpp.store.getState(); return (Math.abs(s.avatar.x - 475) < 30 && s.avatar.y > 940) || s.scene.kind === 'interior'; }, 30000);
  const back = await steer(page, 475, 895, () => window.__tpp.store.getState().scene.kind === 'interior', 30000);
  await waitScene(page, 'Interior', 900);
  await drainAll(1200);
  await toggleEnabled();
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(400);
  await tapSlot(page, 'floor-4');
  await until(page, () => !document.querySelector('.tpp-chooser').hidden, null, 3000);
  mark('fernClick');
  await page.click('.tpp-charm-card[data-type-id="fern"]');
  await waitLine(page, 'heart.earned', { hearts: 2 }, 8000);
  await page.waitForTimeout(300);
  const flash = await domRead(page);
  await still('screen-10-want-state-d-1080', 'want panel state d: want 2 fulfilled flash (renders screen 10)');
  await boxShown(9000);
  const vt = await tapBox();
  await drainAll(1200);
  mark('fernEnd');
  await refresh();
  const placed = first(all, 'charm.placed', { slotId: 'floor-4', typeId: 'fern' }), ful = first(all, 'want.fulfilled', { wantId: 'bright-corner' }), heart = first(all, 'heart.earned', { hearts: 2 });
  const verb = first(all, 'verb.unlocked', { verb: 'sit-on' }), vig = all.filter(l => l.type === 'dialogue.opened' && l.script?.source === 'vignette' && l.t >= (placed?.t ?? 0));
  beat('5:00 back inside → Decorate → floor-4 (adjacent to the lamp at floor-3) → Fern', back && placed, 'scene.changed {to dog-room}; charm.placed {floor-4, fern}', { placed: strip(placed) }, { line: placed });
  beat('5:00 want.fulfilled {bright-corner}, heart.earned {2}, vignette, sit-on unlocked (verb reward)', ful && heart && verb && vig.length >= 1, 'want.fulfilled {bright-corner}; heart.earned {hearts 2}; dialogue.opened {vignette}; verb.unlocked {dog, sit-on}',
    { fulfilled: strip(ful), heart: strip(heart), verb: strip(verb), vignette: vig.map(v => v.script?.lines), vignetteTaps: vt, wantFlash: flash.want }, { line: verb });
  await toggleEnabled();
  await page.click('.tpp-design-toggle'); await page.waitForTimeout(500);
  await refresh();
  beat('5:00 Done', all.filter(l => l.type === 'mode.changed').at(-1)?.mode === 'play', 'mode.changed {play}', { mode: (await getState(page)).mode });
  await page.waitForTimeout(1500);
  await still('screen-6-interior-1080', 'Dog room after the bed, lamp and fern (renders screen 6)');
}

const report = { kind: 'state read', work: WORK, sha, base, captured_at: null, chromium: null, notes: [], beats };
browser = await launch();
report.chromium = browser.version();
const streamDir = mkdtempSync(join(tmpdir(), 'tpp-trace-stream-'));
let w;
try {
  w = await boot(browser, { height: 1080, save: null, init: pageInit });
  page = w.page;
  stream = await startStreamRecording(page, streamDir);
  for (const fn of [orientation, doorGreetingIntro, bedBeat, lampBeat, cadenceBeat, celebrationBeat, fernBeat]) {
    try { await fn(); } catch (error) { beat(`${fn.name}: no uncaught error`, false, 'the beat runs', String(error).slice(0, 800)); }
  }
  mark('traceEnd');
  await stream.stop();
  await refresh();
  // VERIFY-MEC-009-013 action-path half: none exists (fork 7)
  const order = all.filter(l => l.type === 'dialogue.opened').map(l => l.script?.source);
  beat('VERIFY-MEC-009-013 action-path half: not-run (unreachable under Q6(a)); vignette then announce in order', order.join(',').includes('vignette,wantAnnounce'), 'dialogue.opened sources show vignette followed by wantAnnounce', { dialogueOrder: order }, { result: 'not-run (unreachable under Q6(a))' });
  // storage reads at the end
  const end = await page.evaluate(() => ({ save: localStorage.getItem('tpp.save'), log: localStorage.getItem('tpp.log'), state: window.__tpp.store.getState() }));
  report.exported = await exportLog(page, join(evidenceRoot, 'trace-log.jsonl'));
  const rejected = all.filter(l => l.type === 'action.rejected');
  const assetErr = all.filter(l => l.type === 'asset.loadError');
  report.errors = { consoleErrors: w.errors.consoleErrors, pageErrors: w.errors.pageErrors, assetLoadErrors: assetErr, actionRejected: rejected.map(l => ({ ...strip(l), action: l.action })) };
  beat('throughout: zero console errors, zero asset.loadError, no action.rejected from real inputs', !w.errors.consoleErrors.length && !w.errors.pageErrors.length && !assetErr.length && !rejected.length, 'all empty', report.errors);
  await w.context.close();
  // storage-reads.json: end-of-trace save parsed + reloaded; log mirror records; the mid-celebration reload
  const saved = JSON.parse(end.save), mirror = (end.log ?? '').split('\n').filter(Boolean).map(t => { try { return JSON.parse(t); } catch { return null; } }).filter(Boolean);
  const r1 = await boot(browser, { height: 1080, save: end.save });
  await r1.page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.getScenes(true).some(s => ['Street', 'Interior'].includes(s.scene.key)), null, { timeout: 30000 });
  const reloaded = await r1.page.evaluate(() => ({ state: window.__tpp.store.getState(), loaded: window.__tpp.log.lines().filter(l => l.type === 'save.loaded' || l.type === 'save.discarded') }));
  await r1.context.close();
  const cmp = Object.fromEntries(Object.keys(saved.state ?? {}).map(k => [k, eq(saved.state[k], reloaded.state[k])]));
  const mid = report.midCelebrationSave;
  const r2 = await boot(browser, { height: 1080, save: mid });
  await r2.page.waitForFunction(() => window.__tpp && window.__tpp.game.scene.isActive('Street'), null, { timeout: 30000 });
  const midAtActive = await domRead(r2.page);
  await r2.page.waitForTimeout(900);
  const midDom = await domRead(r2.page), midState = await getState(r2.page), midLines = await lines(r2.page);
  const midCam = await r2.page.evaluate(() => { const st = window.__tpp.game.scene.getScene('Street'), c = st.cameras.main, b = st.houses.get('pet-house').getBounds(); return { midPoint: [Math.round(c.midPoint.x), Math.round(c.midPoint.y)], house: [Math.round(b.centerX), Math.round(b.centerY)], texture: st.houses.get('pet-house').texture.key }; });
  await shot(r2.page, browser, capturesDir, 'trace-reload-mid-celebration-1080', { target: `${base}/?lenient=1`, seededSave: 'the trace session tpp.save read just before Collect', note: 'reload mid-celebration: milestone popup open at once', dom: midDom });
  await r2.context.close();
  const midParsed = JSON.parse(mid);
  const storage = { kind: 'state read', work: WORK, sha, captured_at: new Date().toISOString(),
    endOfTrace: { bytes: end.save.length, schemaVersion: saved.schemaVersion, topKeys: Object.keys(saved), stateKeys: Object.keys(saved.state ?? {}),
      reload: { saveLoaded: reloaded.loaded, perKeyEqual: cmp, note: 'avatar / pets.behaviour / session tick fields may advance in the ticks between boot and the read' },
      equalsInMemoryAtSave: eq(saved.state, end.state), inMemoryDiffKeys: Object.keys(end.state).filter(k => !eq(end.state[k], saved.state?.[k])) },
    logMirror: { lines: mirror.length, sessionStarted: count(mirror, 'session.started'), saveWritten: count(mirror, 'save.written'), inputJoystick: count(mirror, 'input.joystick'), inputTap: count(mirror, 'input.tap'), audioLocked: count(mirror, 'audio.locked'),
      firstTypes: mirror.slice(0, 5).map(l => l.type) },
    midCelebrationReload: { schemaVersion: midParsed.schemaVersion, celebrationInSave: midParsed.state?.celebration && { step: midParsed.state.celebration.step, fromPhase: midParsed.state.celebration.fromPhase, toPhase: midParsed.state.celebration.toPhase },
      popupOpenAtStreetActive: midAtActive.milestone.visible, popupOpen: midDom.milestone.visible, revealHidden: !midDom.reveal.visible, camera: midCam, stepped: count(midLines, 'celebration.stepped'), started: midLines.filter(l => l.type === 'celebration.started').map(strip), state: midState.celebration && { step: midState.celebration.step } } };
  writeJson(join(evidenceRoot, 'storage-reads.json'), storage);
  const lm = storage.logMirror;
  const stable = Object.entries(cmp).filter(([k]) => !['feed', 'pets'].includes(k));
  beat('storage: tpp.save parses (schemaVersion 1) and equals the in-memory state on reload (tick-driven feed/pets excepted); tpp.log has session.started, periodic save.written, input.joystick and input.tap',
    saved.schemaVersion === 1 && stable.every(([, v]) => v) && lm.sessionStarted >= 1 && lm.saveWritten > 1 && lm.inputJoystick >= 1 && lm.inputTap >= 1, 'as stated', { endOfTrace: { schemaVersion: saved.schemaVersion, perKeyEqualOnReload: cmp, inMemoryDiffKeysAtRead: storage.endOfTrace.inMemoryDiffKeys }, logMirror: lm });
  beat('storage: one audio.locked line in tpp.log (WORK-004-2 capture note)', lm.audioLocked === 1 && count(all, 'audio.locked') === 1, 'exactly one audio.locked',
    { mirror: lm.audioLocked, memory: count(all, 'audio.locked'), cause: 'createAudio records audio.locked only when a sound plays while game.sound.locked; the first sound (sfx/place) follows real taps, which unlock audio, so the record is not reached through real inputs in this flow' });
  beat('reload mid-celebration (the save just before Collect) → milestone popup open at once over the framed house', storage.midCelebrationReload.popupOpenAtStreetActive && storage.midCelebrationReload.popupOpen && storage.midCelebrationReload.stepped === 0,
    'milestone popup visible when the Street is active; no celebration.stepped dispatched', storage.midCelebrationReload);
} finally { await browser.close(); }

// loops cut from the continuous stream
const frames = stream ? stream.frames() : [];
const between = (a, b) => frames.filter(f => f.t >= a && f.t <= b);
const LOOPS = [
  ['trace-orientation', marks.orientationStart, marks.orientationClosed + 1500, 'boot → street → orientation box (2 lines, text-only) → two taps close it'],
  ['trace-door-greeting-intro', marks.doorStart, marks.introShown + 3000, 'joystick drag left + KeyW into the Starter House door → fades → greeting (under the fade) → intro box'],
  ['trace-bed-walk-nap-heart', marks.bedClick - 800, marks.bedClick + 11200, 'Dog Bed card → +4 ★ → walk to the bed → ❤️ react → nap (using, draw-above)'],
  ['trace-vignette-deferred', (marks.vignetteShown ?? 0) - 3500, (marks.vignetteClosed ?? 0) + 1000, 'nap → the vignette box slides up 2 s after the react (deferred) → 3 taps'],
  ['trace-lamp-lookat-like', marks.lampClick - 500, marks.lampClick + 11500, 'lamp card → walk over → look-at → 🙂 → bubble tap → text'],
  ['trace-toast-roundup', (marks.firstToast ?? 0) - 1500, (marks.firstToast ?? 0) + 6000, 'first round-up toast at cadence 20000 with the +¢ badge'],
  ['trace-badge-step-outside-icon', marks.walkOut - 1500, marks.walkOut + 10500, 'badge inside → walk to the door → street → hook cutscene starts on arrival (no icon tap: mec-002 onStreetEntered)'],
  ['trace-cutscene-to-popup', marks.popupOpen - 7000, marks.popupOpen + 1500, 'cutscene pan → bar → stage swap under dust → milestone popup'],
  ['trace-collect-to-reveal-continue', marks.collect - 500, marks.celebrationEnded + 500, 'Collect → reveal popup card 1 → Continue → pan back'],
  ['trace-fern-want2-heart2', marks.fernClick - 500, marks.fernClick + 11500, 'fern card at floor-4 → want 2 fulfilled → Heart 2 → vignette'],
];
report.loops = [];
const beatLinesIn = (a, b) => { try { return JSON.parse('[' + readFileSync(join(evidenceRoot, 'trace-log.jsonl'), 'utf8').trim().split('\n').join(',') + ']').filter(l => Date.parse(l.wall) >= a && Date.parse(l.wall) <= b && !['save.written', 'tick'].includes(l.type)).map(l => ({ type: l.type, wall: l.wall, ...strip(l) })).slice(0, 40); } catch { return []; } };
for (const [name, a, b, target] of LOOPS) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) { report.loops.push({ name, gap: 'beat not reached (no marks)' }); continue; }
  const sc = encode(loopsDir, name, between(a, b), { target, viewport: { width: 1920, height: 1080 }, screencast: '1280×720 JPEG q70, one continuous stream for the whole trace', seededSave: 'none (fresh trace session)', window: { from: new Date(a).toISOString(), to: new Date(b).toISOString() }, beatLines: beatLinesIn(a, b) },
    { maxMs: 12000, crf: 23, gif: { w: 1280, h: 720, x: 0, y: 0 } });
  report.loops.push({ name, outputs: sc.outputs ?? null, gap: sc.gap ?? null, durationMs: sc.durationMs, sourceFps: sc.sourceFps });
}
if (frames.length) {
  const full = encode(loopsDir, 'trace-full', frames, { target: 'the whole M1 trace 0:00 → 5:00 (fresh save, cadence 20000), the user\'s play-session substitute', viewport: { width: 1920, height: 1080 }, screencast: '1280×720 JPEG q70 continuous', marks: Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, new Date(v).toISOString()])) },
    { maxMs: 60 * 60 * 1000, crf: 30, scale: '960:540', fps: 15 });
  report.traceFull = { outputs: full.outputs ?? null, gap: full.gap ?? null, durationMs: full.durationMs, sourceFps: full.sourceFps };
  if (full.outputs && full.outputs.mp4Bytes > 15 * 1024 * 1024) report.traceFull.overBudget = true;
}
rmSync(streamDir, { recursive: true, force: true });
report.captured_at = new Date().toISOString();
report.elapsedMs = Date.now() - traceStart;
report.marks = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, { wall: new Date(v).toISOString(), elapsedMs: v - traceStart }]));
report.ok = beats.every(b => b.ok);
delete report.midCelebrationSave;
writeJson(join(evidenceRoot, 'trace-report.json'), report);
console.log(JSON.stringify({ ok: report.ok, elapsedMs: report.elapsedMs, failed: beats.filter(b => !b.ok).map(b => b.beat), loops: report.loops.map(l => [l.name, !!l.outputs]), traceFull: report.traceFull }, null, 1));
process.exit(report.ok ? 0 : 1);

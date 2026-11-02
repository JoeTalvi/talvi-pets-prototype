// WORK-032-1 live evidence: fix 1 (no round-up while the orientation is open), fix 2 (houses are solid), fix 3 (doors entered from
// below the base). Playwright library, pinned chromium-1243; no install. Every number is read from window.__tpp, never typed in.
//   TPP_BASE=http://127.0.0.1:5211 TPP_EVIDENCE=<EV> TPP_WORK=WORK-032-1 TPP_MILESTONE=MILESTONE-009 node tests/view/capture/work-032-1.mjs [fix1|doors|solid|enter]...
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { sha, launch, boot, waitScene, getState, lines, until, steer, shot, encode, startStreamRecording, writeJson, errorsSummary } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const captures = join(EV, 'captures'), loops = join(EV, 'loops'), rows = join(EV, 'rows');
const modes = process.argv.slice(2).length ? process.argv.slice(2) : ['fix1', 'doors', 'solid', 'enter'];
const browser = await launch();
const errors = [];
const close = async (w, name) => { errors.push({ window: name, ...errorsSummary(w.errors, await lines(w.page)) }); await w.context.close(); };
const drain = async page => {
  for (let i = 0; i < 20 && (await getState(page)).dialogue.current; i++) { await page.locator('[data-panel="dialogue"]').click({ position: { x: 300, y: 60 } }); await page.waitForTimeout(350); }
};
const fresh = async (height = 1080) => { const w = await boot(browser, { height, query: '' }); await waitScene(w.page, 'Street', 1200); return w; };

/** Debug overlay in world space: door rects (green) and blockers (red) drawn above everything in the Street scene. */
const drawGeometry = page => page.evaluate(() => {
  const { game, content } = window.__tpp, st = game.scene.getScene('Street'), g = st.add.graphics().setDepth(1e7);
  for (const h of content.street.houses) {
    g.lineStyle(4, 0x00c853, 1).strokeRect(h.door.rect.x, h.door.rect.y, h.door.rect.w, h.door.rect.h);
    for (const b of h.blockers) g.lineStyle(4, 0xff1744, 1).strokeRect(b.x, b.y, b.w, b.h);
  }
  const cam = st.cameras.main;
  return { H: game.scale.gameSize.height, scrollY: cam.scrollY, visibleY: [cam.scrollY, cam.scrollY + game.scale.gameSize.height],
    houses: content.street.houses.map(h => ({ projectId: h.projectId, base: h.y, door: h.door.rect, spawn: h.door.spawn, blockers: h.blockers })), walkArea: content.street.walkArea };
});

async function fix1() {
  const w = await fresh(1080), { page } = w;
  const opened = await getState(page);
  const s0 = await shot(page, browser, captures, 'fix1-orientation-open-1080', { note: 'fresh save, orientation open, 0 s' });
  await page.waitForTimeout(30000);
  const during = await lines(page, 'roundup.fired'), s30 = await getState(page);
  const s30png = await shot(page, browser, captures, 'fix1-orientation-open-1080', { note: 'fresh save, orientation still open, 30 s real time' });
  await drain(page);
  const closed = (await lines(page, 'dialogue.closed')).at(-1);
  await until(page, () => window.__tpp.log.lines().some(l => l.type === 'roundup.fired'), null, 40000, 100).catch(() => null);
  const first = (await lines(page, 'roundup.fired'))[0] ?? null;
  const interval = opened.session.eventIntervalMs;
  const row = { id: 'VERIFY-WORK-032-1-03', sha, intervalMs: interval, openSource: opened.dialogue.current?.source,
    after30s: { roundupsWhileOpen: during.length, dialogueOpen: s30.dialogue.current !== null, sinceLastEventMs: s30.feed.sinceLastEventMs },
    dialogueClosedT: closed?.t ?? null, firstRoundupT: first?.t ?? null, firstAfterCloseMs: first && closed ? first.t - closed.t : null, stills: [s0, s30png] };
  row.pass = row.openSource === 'orientation' && during.length === 0 && s30.dialogue.current !== null && s30.feed.sinceLastEventMs === 0
    && row.firstAfterCloseMs !== null && row.firstAfterCloseMs >= interval;
  writeJson(join(rows, 'fix1-live.json'), row);
  console.log('fix1', row.pass, row.after30s, row.firstAfterCloseMs);
  await close(w, 'fix1');
}

async function doors() {
  const reads = [];
  for (const H of [1080, 823]) {
    const w = await fresh(H), { page } = w;
    await drain(page);
    const read = await drawGeometry(page);
    await page.waitForTimeout(200);
    read.stills = {};
    for (const house of ['starter', 'pet']) read.stills[house] = await shot(page, browser, captures, `door-${house}-${H}`, { note: 'door rects green, blockers red (debug overlay)' });
    reads.push(read); await close(w, `doors-${H}`);
  }
  writeJson(join(rows, 'door-overlay.json'), { sha, reads });
  console.log('doors', reads.map(r => [r.H, r.visibleY]));
}

/** Hold KeyW for 2 s from below a house's blocker centre; the avatar must never go above the blocker base. */
async function solidOne(page, house, index) {
  const b = await page.evaluate(i => window.__tpp.content.street.houses[i].blockers[0], index), x = b.x + b.w / 2, base = b.y + b.h;
  await steer(page, x, 1000, () => false, 6000, 8);
  const stream = await startStreamRecording(page, join(EV, 'frames', `fix2-${house}`)), t0 = Date.now(), ys = [];
  await page.keyboard.down('KeyW');
  while (Date.now() - t0 < 2000) { ys.push((await getState(page)).avatar.y); await page.waitForTimeout(50); }
  await page.keyboard.up('KeyW');
  const frames = await stream.stop();
  encode(loops, `fix2-solid-${house}`, frames, { note: `hold KeyW 2 s below the ${house} blocker centre x ${x}`, base });
  return { house, blocker: b, base, minY: Math.min(...ys), samples: ys.length, pass: Math.min(...ys) >= base };
}

async function solid() {
  const w = await fresh(1080), { page } = w;
  await drain(page);
  const out = [await solidOne(page, 'starter', 0), await solidOne(page, 'pet', 1)];
  writeJson(join(rows, 'fix2-solid.json'), { id: 'VERIFY-WORK-032-1-05', sha, rows: out, pass: out.every(r => r.pass) });
  console.log('solid', out.map(r => [r.house, r.base, r.minY, r.pass]));
  await close(w, 'solid');
}

async function enterOne(page, house, x, belowY, upY, roomId) {
  const stream = await startStreamRecording(page, join(EV, 'frames', `fix3-${house}`));
  await steer(page, x, belowY, `() => { const s = window.__tpp.store.getState(); return (Math.abs(s.avatar.x - ${x}) < 20 && s.avatar.y > ${belowY - 20}) || s.scene.kind === 'interior'; }`, 30000, 10);
  await steer(page, x, upY, `() => window.__tpp.store.getState().scene.kind === 'interior'`, 15000, 10);
  await waitScene(page, 'Interior', 1200);
  const frames = await stream.stop();
  const changed = (await lines(page, 'scene.changed')).filter(l => l.to?.kind === 'interior');
  encode(loops, `fix3-enter-${house}`, frames, { note: `straight-line walk below the ${house} door, then up into it` });
  return { house, changes: changed.length, to: changed.at(-1)?.to, pass: changed.length === 1 && changed[0].to.roomId === roomId };
}

async function enter() {
  const out = [];
  let w = await fresh(1080);
  await drain(w.page);
  out.push(await enterOne(w.page, 'starter', 475, 965, 895, 'dog-room'));
  await close(w, 'enter-starter');
  // Pet House complete and arrived: the owl-room-entry save with the avatar moved back to playerSpawn (it was standing in the door).
  const save = JSON.parse(readFileSync('tests/view/capture/owl-room-entry.real.json', 'utf8'));
  Object.assign(save.state.avatar, { x: 700, y: 910 });
  w = await boot(browser, { height: 1080, query: '', save: JSON.stringify(save) });
  await waitScene(w.page, 'Street', 1200); await drain(w.page);
  out.push(await enterOne(w.page, 'pet', 1490, 1000, 950, 'owl-room'));
  await close(w, 'enter-pet');
  writeJson(join(rows, 'fix3-enter.json'), { id: 'VERIFY-WORK-032-1-08', sha, rows: out, pass: out.every(r => r.pass) });
  console.log('enter', out);
}

const run = { fix1, doors, solid, enter };
try { for (const m of modes) await run[m](); } finally {
  writeJson(join(rows, `errors-${modes.join('-')}.json`), { sha, errors });
  await browser.close();
}

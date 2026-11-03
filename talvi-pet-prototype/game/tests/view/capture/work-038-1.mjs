// WORK-038-1 capture points 1–3 on the lane's dev server (Playwright library, pinned chromium-1243; no install).
//   TPP_BASE=http://127.0.0.1:5212 TPP_EVIDENCE=<EV> TPP_WORK=WORK-038-1 TPP_MILESTONE=MILESTONE-011 node tests/view/capture/work-038-1.mjs
// 1. game.sound.play recorder: the love reaction's detune and the tick arpeggio (createTickSeq through window.__tpp.context.audio).
// 2. The six new-sound plays (tick ×4, riser, reveal) from the recorder, rendered to an audio loop: the screencast carries no sound,
//    so the loop's track is mixed by ffmpeg from the shipped files at the recorded times and detunes (VERIFY-WORK-038-1-11).
// 3. One reward card of each kind mounted on a plain overlay (the dev server serves the block's source module).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { launch, boot, waitScene, lines, writeJson, errorsSummary, createSteps, makeFixture, ffmpeg, GAME_DIR, sha } from '../../e2e/lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const captures = join(EV, 'captures'), loops = join(EV, 'loops'), rows = join(EV, 'rows');
for (const d of [captures, loops, rows, join(EV, 'fixtures')]) mkdirSync(d, { recursive: true });
const { steps, step } = createSteps();
const errorsByWindow = [];
const save = makeFixture(['--scenario', 'dog-room-intro-done'], join(EV, 'fixtures')).text;
const drain = page => page.evaluate(() => { const { store } = window.__tpp; for (let i = 0; i < 20 && store.getState().dialogue.current; i++) store.dispatch({ type: 'advanceDialogue' }); });

async function recorder(page) {
  await page.evaluate(() => {
    const sound = window.__tpp.game.sound, original = sound.play.bind(sound);
    window.__plays = [];
    sound.play = (key, config) => { window.__plays.push({ key, volume: config?.volume ?? null, detune: config?.detune ?? null, t: Math.round(performance.now()) }); return original(key, config); };
  });
}

async function detune(browser) {
  const w = await boot(browser, { save });
  await waitScene(w.page, 'Interior', 900);
  await drain(w.page);
  await recorder(w.page);
  await w.page.mouse.click(1700, 980, { delay: 40 });   // first input: unlocks Web Audio
  await w.page.waitForFunction(() => window.__tpp.game.sound.locked === false, null, { timeout: 5000 });
  await w.page.evaluate(() => { const { store } = window.__tpp; store.dispatch({ type: 'setDesignMode', on: true }); store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' }); });
  await w.page.waitForTimeout(400);
  const t0 = await w.page.evaluate(async () => {
    const { createTickSeq } = await import('/src/view/celebration/tickSeq.ts');
    const audio = window.__tpp.context.audio, seq = createTickSeq(() => audio);
    const start = performance.now();
    for (let i = 0; i < 4; i++) { seq.tick(); await new Promise(r => setTimeout(r, 160)); }
    await new Promise(r => setTimeout(r, 300));
    audio.play('riser');
    await new Promise(r => setTimeout(r, 900));
    audio.play('reveal');
    await new Promise(r => setTimeout(r, 600));
    return Math.round(start);
  });
  const plays = await w.page.evaluate(() => window.__plays);
  const reaction = plays.find(p => p.key === 'sfx/reaction'), ticks = plays.filter(p => p.key === 'sfx/tick');
  const set = plays.filter(p => p.t >= t0 && ['sfx/tick', 'sfx/riser', 'sfx/reveal'].includes(p.key));
  writeJson(join(rows, 'detune.json'), { verify: 'VERIFY-WORK-038-1-02', sha, plays, reaction, ticks });
  step('VERIFY-WORK-038-1-02: game.sound.play receives detune 300 for the love reaction and 0/400/700/1200 for the ticks',
    reaction?.detune === 300 && JSON.stringify(ticks.map(p => p.detune)) === '[0,400,700,1200]' && ticks.every(p => p.volume === 0.5),
    'reaction detune 300; ticks detune [0,400,700,1200] at 0.5', { reaction, ticks: ticks.map(p => p.detune) });
  step('VERIFY-WORK-038-1-11: six new-sound plays in order (tick ×4, riser, reveal)',
    JSON.stringify(set.map(p => p.key)) === JSON.stringify(['sfx/tick', 'sfx/tick', 'sfx/tick', 'sfx/tick', 'sfx/riser', 'sfx/reveal']), 'six plays in order', set);
  errorsByWindow.push({ window: 'detune', ...errorsSummary(w.errors, await lines(w.page)) });
  await w.context.close();
  return { set, t0 };
}

/** The loop's audio: each recorded play mixed at its time with its detune (asetrate pitch shift), over a 1080 still. */
function audioLoop({ set, t0 }) {
  const inputs = [], filters = [];
  set.forEach((p, i) => {
    inputs.push('-i', join(GAME_DIR, 'public/assets', `${p.key}.ogg`));
    const ratio = 2 ** ((p.detune ?? 0) / 1200);
    filters.push(`[${i + 1}:a]asetrate=${Math.round(44100 * ratio)},aresample=44100,volume=${p.volume},adelay=${p.t - t0}|${p.t - t0}[a${i}]`);
  });
  const mix = `${filters.join(';')};${set.map((_, i) => `[a${i}]`).join('')}amix=inputs=${set.length}:normalize=0,apad=whole_dur=4[out]`;
  const out = join(loops, 'sfx-set.mp4');
  execFileSync(ffmpeg, ['-v', 'error', '-y', '-loop', '1', '-framerate', '10', '-i', join(captures, 'reward-card-items-1080.png'), ...inputs,
    '-filter_complex', mix, '-map', '0:v', '-map', '[out]', '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=960:-2', '-c:a', 'aac', '-b:a', '128k', out]);
  const probe = execFileSync('/opt/homebrew/bin/ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', out]).toString();
  writeJson(join(loops, 'sfx-set.json'), { kind: 'loop', work: 'WORK-038-1', sha, plays: set.map(p => ({ key: p.key, atMs: p.t - t0, detune: p.detune, volume: p.volume })),
    note: 'audio mixed by ffmpeg from the shipped .ogg files at the recorded play times and detunes (the screencast has no audio); listened verdict deferred to the play session', probe: JSON.parse(probe) });
  return out;
}

async function cards(browser) {
  const w = await boot(browser, { save });
  await waitScene(w.page, 'Interior', 900);
  await drain(w.page);
  for (const kind of ['items', 'verb', 'space']) {
    await w.page.evaluate(async kind => {
      const { createRewardCard } = await import('/src/view/celebration/rewardCard.ts');
      const { createText, assetsFrom } = await import('/src/ui/overlay.ts');
      const { content, context } = window.__tpp, root = document.querySelector('#panels');
      for (const el of root.querySelectorAll('.tpp-reward-card, .tpp-capture-plain')) el.remove();
      const plain = document.createElement('div');
      plain.className = 'tpp-capture-plain';
      Object.assign(plain.style, { position: 'absolute', inset: '0', background: 'rgba(40, 28, 18, 0.55)', pointerEvents: 'none', zIndex: 'var(--z-toast)' });
      root.append(plain);
      const spec = kind === 'items' ? { kind, typeId: 'dog-bed', heldBefore: 0 } : kind === 'verb' ? { kind, petId: 'dog', verbId: 'nap' } : { kind, siteId: 'garden' };
      const card = createRewardCard(root, { content, assets: assetsFrom(context.manifest), text: createText(content.strings) }, spec, { at: { x: 960, y: 520 } });
      card.flipIn(0);
    }, kind);
    await w.page.waitForTimeout(600);
    await w.page.screenshot({ path: join(captures, `reward-card-${kind}-1080.png`) });
    const read = await w.page.evaluate(() => { const c = document.querySelector('.tpp-reward-card'); return { kind: c?.dataset.kind, name: c?.querySelector('.tpp-reward-card-name')?.textContent, isNew: !!c?.querySelector('.tpp-reward-card-new'), w: c?.getBoundingClientRect().width }; });
    step(`capture 3: reward card ${kind} mounted`, read.kind === kind, `a ${kind} card on the plain overlay`, read);
  }
  errorsByWindow.push({ window: 'cards', ...errorsSummary(w.errors, await lines(w.page)) });
  await w.context.close();
}

const browser = await launch();
try {
  await cards(browser);
  const recorded = await detune(browser);
  const loop = audioLoop(recorded);
  step('VERIFY-WORK-038-1-11: loop file written', !!loop, 'loops/sfx-set.mp4', { loop });
  step('throughout: zero console errors and page errors', errorsByWindow.every(e => !e.consoleErrors.length && !e.pageErrors.length && !e.appErrors.length), 'no errors', errorsByWindow);
} finally { await browser.close(); }
writeJson(join(EV, 'capture-report.json'), { work: 'WORK-038-1', sha, steps });
for (const s of steps) console.log(`${s.ok ? 'ok  ' : 'FAIL'} ${s.step}`);
process.exit(steps.every(s => s.ok) ? 0 : 1);

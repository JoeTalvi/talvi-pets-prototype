// WORK-025-2 static Safari checks (briefing (c), gate 8): file reads only, no browser. One line per check with file:line evidence.
//   TPP_EVIDENCE=<EV> node tests/e2e/safari-static.mjs  → <EV>/safari-static-checks.md ; exit 1 only on a fail (recorded lines are not fails)
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { GAME_DIR, sha } from './lib/harness.mjs';

const EV = process.env.TPP_EVIDENCE;
if (!EV) throw new Error('TPP_EVIDENCE is required');
const rel = p => relative(GAME_DIR, p);
const read = p => readFileSync(join(GAME_DIR, p), 'utf8');
/** Every line of `file` matching `re`, as file:line. */
const where = (file, re) => read(file).split('\n').flatMap((l, i) => (re.test(l) ? [`${file}:${i + 1}`] : []));
const walk = dir => readdirSync(dir).flatMap(n => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const results = [];
const add = (id, result, text, evidence) => results.push({ id, result, text, evidence });

// (i) an .m4a for every sfx/* manifest id and every SOUNDS id
const manifest = JSON.parse(read('public/assets/manifest.json'));
const entries = manifest.entries ?? manifest.assets ?? [];
const sfxIds = [...new Set([...entries.filter(e => e.id?.startsWith('sfx/')).map(e => e.id), ...[...read('src/app/audio.ts').matchAll(/id: '(sfx\/[a-z-]+)'/g)].map(m => m[1])])].sort();
const present = sfxIds.filter(id => existsSync(join(GAME_DIR, 'public/assets', `${id}.m4a`))), missing = sfxIds.filter(id => !present.includes(id));
add('(i) .m4a per sfx id', missing.length ? 'recorded' : 'pass',
  `ids ${sfxIds.join(', ')}; .m4a present: ${present.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'} — WORK-026-2 lands the synthesized set in parallel; complete check: rerun in WORK-025-3`,
  [...where('src/app/audio.ts', /id: 'sfx\//), ...present.map(id => `public/assets/${id}.m4a`)]);

// (ii) Share gated on navigator.canShare({files})
const gate = where('src/ui/panels/debugPanel.ts', /canShare/), logGate = where('src/app/log.ts', /canShare/), jsdom = where('tests/view/debugPanel.test.ts', /VERIFY-MEC-010-011 partial: jsdom — Share hidden/);
add('(ii) Share gated by navigator.canShare', gate.length >= 2 && logGate.length && jsdom.length ? 'pass' : 'fail',
  'Share button hidden = !(typeof navigator.canShare === "function" && canShare({files:[x.jsonl]})), evaluated per panel open; export path re-checks before navigator.share; WORK-025-1 jsdom row', [...gate, ...logGate, ...jsdom]);

// (iii) no Chrome-only API in src/**
const banned = [['showSaveFilePicker', /showSaveFilePicker/], ['showOpenFilePicker', /showOpenFilePicker/], ['FileSystemHandle', /FileSystemHandle/], ['webkitRequestFullscreen', /webkitRequestFullscreen/],
  ['chrome.', /\bchrome\./], ['requestIdleCallback', /requestIdleCallback/], ['OffscreenCanvas', /OffscreenCanvas/]];
const srcFiles = walk(join(GAME_DIR, 'src')).filter(p => /\.(ts|js|css|html)$/.test(p)).map(rel);
const hits = banned.flatMap(([name, re]) => srcFiles.flatMap(f => where(f, re).map(w => `${name} @ ${w}`)));
add('(iii) no Chrome-only API in src/**', hits.length ? 'fail' : 'pass', hits.length ? `hits: ${hits.length}` : `none of ${banned.map(b => b[0]).join(', ')} in ${srcFiles.length} files`, hits);

// (iv) viewport-fit=cover and safe-area insets used by the HUD and the joystick
const vp = where('index.html', /viewport-fit=cover/), safeHud = where('src/ui/styles/tokens.css', /\.safe-hud\{padding:calc\(24px \+ env\(safe-area-inset-top\)/), probe = where('src/ui/styles/tokens.css', /#safe-area-probe\{[^}]*env\(safe-area-inset-left\)/), joy = where('src/view/objects/Joystick.ts', /safe-area-probe/);
add('(iv) viewport-fit=cover + env(safe-area-inset-*)', vp.length && safeHud.length && probe.length && joy.length ? 'pass' : 'fail', '.safe-hud pads by env(safe-area-inset-*) / overlay scale; Joystick.centre() reads #safe-area-probe padding-left', [...vp, ...safeHud, ...probe, ...joy]);

// (v) apple-mobile-web-app-* metas
const capable = where('index.html', /apple-mobile-web-app-capable/), bar = where('index.html', /apple-mobile-web-app-status-bar-style/);
add('(v) apple-mobile-web-app-capable + status-bar-style', capable.length && bar.length ? 'pass' : 'fail', 'both metas present', [...capable, ...bar]);

// (vi) apple-touch-icon
const touchIcon = where('index.html', /apple-touch-icon/), icons = JSON.parse(read('public/manifest.webmanifest')).icons;
add('(vi) apple-touch-icon', touchIcon.length || icons?.length ? 'pass' : 'recorded',
  touchIcon.length ? 'linked' : 'MISSING: index.html links only <link rel="icon" href="data:,">; manifest.webmanifest has no icons; the home-screen tile falls back to a page snapshot; no icon authored or linked by this lane (asset outside the delegation) — dry-run item and return candidate',
  [...where('index.html', /rel="icon"/), 'public/manifest.webmanifest']);

// (vii) manifest display / orientation / start_url
const wm = JSON.parse(read('public/manifest.webmanifest'));
add('(vii) manifest standalone / landscape / ./', wm.display === 'standalone' && wm.orientation === 'landscape' && wm.start_url === './' ? 'pass' : 'fail',
  `display ${wm.display}, orientation ${wm.orientation}, start_url ${wm.start_url}`, [...where('public/manifest.webmanifest', /"(display|orientation|start_url)"/).map(w => w)]);

// (viii) user-scalable=no, touch-action:none on the canvas, overscroll-behavior:none
const us = where('index.html', /user-scalable=no/), ta = where('src/ui/styles/tokens.css', /canvas\{touch-action:none/), ob = where('src/ui/styles/tokens.css', /overscroll-behavior:none/);
add('(viii) user-scalable=no, canvas touch-action none, overscroll-behavior none', us.length && ta.length && ob.length ? 'pass' : 'fail', 'all three present', [...us, ...ta, ...ob]);

const md = [`# Static Safari checks — WORK-025-2`, '', `Harness \`tests/e2e/safari-static.mjs\` on ${sha}, ${new Date().toISOString()}. File reads only; these stand in for nothing on a device — iPhone 15+ Safari / home-screen and Mac Safari stay \`not-run (user, dry-run session)\`.`, '',
  '| Check | Result | Finding | Evidence |', '|---|---|---|---|',
  ...results.map(r => `| ${r.id} | ${r.result} | ${r.text.replace(/\|/g, '\\|')} | ${r.evidence.map(e => `\`${e}\``).join('<br>') || '—'} |`), ''].join('\n');
mkdirSync(EV, { recursive: true });
writeFileSync(join(EV, 'safari-static-checks.md'), md);
for (const r of results) console.log(`${r.result.padEnd(8)} ${r.id} — ${r.text}`);
process.exitCode = results.some(r => r.result === 'fail') ? 1 : 0;

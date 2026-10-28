// WORK-025-3 first-load timing on `vite preview` of dist (roadmap facility "< 3 s first load"; label: loopback on the Mac, not LAN or iPhone).
//   npx vite preview --port 5205 --strictPort  &&  TPP_BASE=http://127.0.0.1:5205 TPP_EVIDENCE=<EV> node tests/view/capture/work-025-3-first-load.mjs
// Three cold navigations, each in a fresh context with the cache disabled (CDP Network.setCacheDisabled). window.__tpp is DEV-only, so "ready" is a
// DOM signal: the Phaser canvas exists AND the street HUD (.tpp-hudStreet) is shown — the HUD only shows once BootScene has finished loading every
// manifest file and started the Street scene (its progress bar is drawn inside the canvas). Transfer bytes from CDP Network.loadingFinished.
import { join } from 'node:path';
import { launch, base, evidenceRoot, sha, WORK, writeJson } from '../../e2e/lib/harness.mjs';

const RUNS = 3, BAR_MS = 3000;
const browser = await launch();
const runs = [];
try {
  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
    const page = await context.newPage(), cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const sizes = new Map(), urls = new Map(), errors = []; let lastFinish = 0;
    cdp.on('Network.responseReceived', e => urls.set(e.requestId, e.response.url));
    cdp.on('Network.loadingFinished', e => { sizes.set(e.requestId, e.encodedDataLength); lastFinish = Date.now(); });
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
    const t0 = Date.now();
    await page.goto(`${base}/`, { waitUntil: 'commit' });
    await page.waitForFunction(() => { const h = document.querySelector('.tpp-hudStreet'); return !!document.querySelector('canvas') && !!h && !h.hidden && h.offsetParent !== null && getComputedStyle(h).visibility !== 'hidden'; }, null, { timeout: 30000, polling: 16 });
    const hudMs = Date.now() - t0;
    // the HUD can mount before BootScene finishes; ready = the HUD shown AND the network quiet for 500 ms (every manifest file transferred)
    while (Date.now() - lastFinish < 500) await page.waitForTimeout(50);
    const readyMs = Math.max(hudMs, lastFinish - t0);
    if (i === 0) await page.screenshot({ path: join(evidenceRoot, 'captures', 'first-load-ready-1080.png') });
    const nav = await page.evaluate(() => { const n = performance.getEntriesByType('navigation')[0]; return { domContentLoadedEventEnd: Math.round(n.domContentLoadedEventEnd), loadEventEnd: Math.round(n.loadEventEnd), responseEnd: Math.round(n.responseEnd) }; });
    const files = [...sizes.entries()].map(([id, bytes]) => ({ url: (urls.get(id) ?? '?').replace(base, ''), bytes }));
    runs.push({ run: i + 1, readyMs, hudShownMs: hudMs, lastTransferMs: lastFinish - t0, navigationTiming: nav, transferBytes: files.reduce((a, f) => a + f.bytes, 0), requests: files.length, largest: files.sort((a, b) => b.bytes - a.bytes).slice(0, 5), consoleErrors: errors });
    await context.close();
  }
} finally { await browser.close(); }
const median = key => { const v = runs.map(key).sort((a, b) => a - b); return v[Math.floor(v.length / 2)]; };
const result = {
  kind: 'measurement', work: WORK, sha, base, label: 'loopback on the Mac, not LAN or iPhone (vite preview of dist, chromium-1243 headless, cache disabled, fresh context per run)',
  readySignal: 'max(canvas present AND .tpp-hudStreet shown, the last network transfer finished before 500 ms of quiet): every manifest file is in and the street HUD is up; first-load-ready-1080.png is run 1 at that moment', bar: `< ${BAR_MS} ms first load`,
  median: { readyMs: median(r => r.readyMs), loadEventEnd: median(r => r.navigationTiming.loadEventEnd), domContentLoadedEventEnd: median(r => r.navigationTiming.domContentLoadedEventEnd), transferBytes: median(r => r.transferBytes) },
  runs, captured_at: new Date().toISOString(),
};
result.result = result.median.readyMs < BAR_MS ? 'pass (loopback label only; the LAN/iPhone number is the user\'s dry run)' : 'fail (loopback label)';
writeJson(join(evidenceRoot, 'first-load.json'), result);
console.log(JSON.stringify({ median: result.median, result: result.result, runs: runs.map(r => [r.readyMs, r.transferBytes, r.requests, r.consoleErrors.length]) }));

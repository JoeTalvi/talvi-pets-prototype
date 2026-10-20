/** Deterministic native-alpha sprite fit; source artwork is never overwritten. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const [source, destination, widthText, heightText, cutoffText = '1'] = process.argv.slice(2);
const width = Number(widthText), height = Number(heightText), cutoff = Number(cutoffText);
if (!source || !destination || !Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || !Number.isInteger(cutoff) || cutoff < 1 || cutoff > 16) {
  throw new Error('Usage: node tools/assets/export-alpha.mjs source.png destination.png width height [alpha-cutoff 1..16]');
}
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const bytes = await readFile(source);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const output = await page.evaluate(async ({ encoded, width, height, cutoff }) => {
    const image = new Image(); image.src = `data:image/png;base64,${encoded}`; await image.decode();
    const input = document.createElement('canvas'); input.width = image.width; input.height = image.height;
    const ctx = input.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
    const pixels = ctx.getImageData(0, 0, input.width, input.height);
    let l = input.width, t = input.height, r = -1, b = -1, cleared = 0;
    for (let i = 0; i < pixels.data.length / 4; i++) {
      const a = pixels.data[i * 4 + 3];
      if (a < cutoff) { if (a) cleared++; pixels.data[i * 4 + 3] = 0; continue; }
      const x = i % input.width, y = Math.floor(i / input.width);
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y);
    }
    if (r < l) throw new Error('No visible subject');
    ctx.putImageData(pixels, 0, 0);
    const sw = r - l + 1, sh = b - t + 1, scale = Math.min(width / sw, height / sh);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const out = canvas.getContext('2d'); out.imageSmoothingEnabled = true; out.imageSmoothingQuality = 'high';
    out.drawImage(input, l, t, sw, sh, (width - sw * scale) / 2, height - sh * scale, sw * scale, sh * scale);
    const rgba = out.getImageData(0, 0, width, height).data;
    let left = width, right = -1, top = height, bottom = -1, transparent = 0;
    for (let i = 0; i < rgba.length / 4; i++) {
      if (!rgba[i * 4 + 3]) { transparent++; continue; }
      const x = i % width, y = Math.floor(i / width);
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    return { png: canvas.toDataURL('image/png').split(',')[1], sourceSize: [input.width, input.height],
      sourceBounds: [l, t, r, b], scale, alphaCutoff: cutoff, clearedLowAlphaPixels: cleared,
      bounds: [left, top, right, bottom], bottomGap: height - 1 - bottom,
      centerOffset: Math.abs((left + right) / 2 - (width - 1) / 2), transparentPixels: transparent };
  }, { encoded: bytes.toString('base64'), width, height, cutoff });
  const { png, ...metrics } = output, exported = Buffer.from(png, 'base64');
  await mkdir(dirname(resolve(destination)), { recursive: true });
  await writeFile(destination, exported, { flag: 'wx' });
  const report = { source: resolve(source), sourceSha256: hash(bytes), destination: resolve(destination),
    sha256: hash(exported), bytes: exported.length, node: process.version, chrome: browser.version(), ...metrics };
  await writeFile(`${destination}.json`, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }

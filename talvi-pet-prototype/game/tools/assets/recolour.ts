/** Maintained deterministic palette-shift recolour (WORK-034-1): moves one hue band of an RGBA PNG to a new hue and
 * saturation, keeping light low-saturation pixels (cream), dark pixels (contour, eyes) and every alpha byte. No pixel
 * moves, so frames, pivots and clips stay identical. Pure Node (no browser): bytes depend only on the source and config. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { encodePng, type Rgba } from './refit';
import { decodePixels } from './image';
import { flags, readJson } from './common';
/** Selection band (HSV, hue in degrees, s/v in 0..1) with linear feathers, and the target the band moves to. */
export interface Mapping {
    hue: [number, number]; hueFeather: number;
    satMin: number; satFeather: number;
    value: [number, number]; valueFeather: number;
    targetHue: number; satScale: number; valueScale: number;
    /** Optional protected corner: saturated dark pixels (irises, dark barring next to the contour) stay as they are. */
    keep?: { satMin: number; valueMax: number; feather: number };
}
interface Item { id: string; git: string; path: string; sha256: string; mapping: Mapping }
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
export function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    return [h, max ? d / max : 0, max / 255];
}
export function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c, k = Math.floor(h / 60) % 6;
    const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
    return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}
/** 1 inside [lo, hi], falling linearly to 0 over `feather` outside it. */
function ramp(x: number, lo: number, hi: number, feather: number): number {
    if (x >= lo && x <= hi) return 1;
    const d = x < lo ? lo - x : x - hi;
    return feather > 0 ? Math.max(0, 1 - d / feather) : 0;
}
/** Band weight of one RGB pixel under the mapping (0 = untouched, 1 = fully moved). */
export function bandWeight(r: number, g: number, b: number, m: Mapping): number {
    const [h, s, v] = rgbToHsv(r, g, b);
    const band = ramp(h, m.hue[0], m.hue[1], m.hueFeather) * ramp(s, m.satMin, 1, m.satFeather) * ramp(v, m.value[0], m.value[1], m.valueFeather);
    const kept = m.keep ? ramp(s, m.keep.satMin, 1, m.keep.feather) * ramp(v, 0, m.keep.valueMax, m.keep.feather) : 0;
    return band * (1 - kept);
}
/** Recolour every pixel; alpha is copied byte for byte and fully transparent pixels are copied unchanged. */
export function recolour(src: Rgba, m: Mapping): Rgba {
    const out = new Uint8Array(src.data);
    for (let p = 0; p < out.length; p += 4) {
        if (!src.data[p + 3]) continue;
        const r = src.data[p], g = src.data[p + 1], b = src.data[p + 2], w = bandWeight(r, g, b, m);
        if (!w) continue;
        const [, s, v] = rgbToHsv(r, g, b), t = hsvToRgb(m.targetHue, Math.min(1, s * m.satScale), Math.min(1, v * m.valueScale));
        out[p] = Math.round(r + (t[0] - r) * w); out[p + 1] = Math.round(g + (t[1] - g) * w); out[p + 2] = Math.round(b + (t[2] - b) * w);
    }
    return { w: src.w, h: src.h, data: out };
}
/** Opaque-pixel hue histogram in 30° bins plus counts of light low-saturation (cream) and dark pixels. */
export function hueHistogram(r: Rgba): { bins: number[]; cream: number; dark: number; opaque: number } {
    const bins = new Array(12).fill(0);
    let cream = 0, dark = 0, opaque = 0;
    for (let p = 0; p < r.data.length; p += 4) {
        if (r.data[p + 3] < 128) continue;
        opaque++;
        const [h, s, v] = rgbToHsv(r.data[p], r.data[p + 1], r.data[p + 2]);
        if (v < 0.33) dark++;
        else if (s < 0.25 && v > 0.8) cream++;
        else if (s >= 0.1) bins[Math.floor(h / 30) % 12]++;
    }
    return { bins, cream, dark, opaque };
}
/** Any non-interlaced 8-bit PNG (RGBA, RGB, grey, grey+alpha or palette with tRNS) to RGBA; alpha values are the stored ones. */
export function toRgba(b: Buffer): Rgba {
    const { w, h, color, channels, pixels, transparency } = decodePixels(b), data = new Uint8Array(w * h * 4);
    let palette: Buffer | undefined;
    for (let p = 8; p < b.length;) {
        const n = b.readUInt32BE(p);
        if (b.toString('ascii', p + 4, p + 8) === 'PLTE') palette = b.subarray(p + 8, p + 8 + n);
        p += n + 12;
    }
    if (color === 3 && !palette) throw new Error('Palette PNG without PLTE');
    if ((color === 0 || color === 2) && transparency) throw new Error('Colour-key transparency is not supported');
    for (let i = 0; i < w * h; i++) {
        const s = i * channels, q = i * 4;
        if (color === 6) data.set(pixels.subarray(s, s + 4), q);
        else if (color === 2) data.set([pixels[s], pixels[s + 1], pixels[s + 2], 255], q);
        else if (color === 4) data.set([pixels[s], pixels[s], pixels[s], pixels[s + 1]], q);
        else if (color === 0) data.set([pixels[s], pixels[s], pixels[s], 255], q);
        else { const k = pixels[s]; data.set([palette![k * 3], palette![k * 3 + 1], palette![k * 3 + 2], transparency?.[k] ?? 255], q); }
    }
    return { w, h, data };
}
export function alphaIdentical(a: Rgba, b: Rgba): boolean {
    if (a.w !== b.w || a.h !== b.h) return false;
    for (let p = 3; p < a.data.length; p += 4) if (a.data[p] !== b.data[p]) return false;
    return true;
}
export function recolourItem(item: Item, gameRoot: string): { png: Buffer; report: Record<string, unknown> } {
    const bytes = execFileSync('git', ['show', `${item.git}:./${item.path}`], { cwd: gameRoot, maxBuffer: 64 * 1024 * 1024 });
    if (sha(bytes) !== item.sha256)
        throw new Error(`${item.id}: source ${item.git}:${item.path} SHA-256 ${sha(bytes)} differs from config ${item.sha256}`);
    const src = toRgba(bytes), out = recolour(src, item.mapping), png = encodePng(out);
    if (!alphaIdentical(src, toRgba(png)))
        throw new Error(`${item.id}: alpha changed`);
    return { png, report: { id: item.id, source: `${item.git}:${item.path}`, sourceSha256: item.sha256, sha256: sha(png), bytes: png.length,
        size: [out.w, out.h], mapping: item.mapping, alphaIdentical: true, histogramBefore: hueHistogram(src), histogramAfter: hueHistogram(out) } };
}
export function main(args: string[]): number {
    const opts = flags(args, ['config', 'out']);
    if (!opts.config || !opts.out)
        throw new Error('Usage: tsx tools/assets/recolour.ts --config <config.json> --out <staging-directory>');
    const configPath = resolve(String(opts.config)), config = readJson(configPath) as { items: Item[] }, out = resolve(String(opts.out));
    const gameRoot = resolve(dirname(new URL(import.meta.url).pathname), '../..'), results: Record<string, unknown>[] = [];
    for (const item of config.items) {
        const { png, report } = recolourItem(item, gameRoot), file = resolve(out, item.id + '.png');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, png, { flag: 'wx' });
        results.push({ ...report, file });
    }
    writeFileSync(resolve(out, 'recolour-report.json'), JSON.stringify({ node: process.version, config: configPath, configSha256: sha(readFileSync(configPath)), results }, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify(results.map(r => ({ id: r.id, file: r.file, sha256: r.sha256 })), null, 2) + '\n');
    return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        process.exitCode = main(process.argv.slice(2));
    }
    catch (error) {
        process.stderr.write(`recolour: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 3;
    }
}

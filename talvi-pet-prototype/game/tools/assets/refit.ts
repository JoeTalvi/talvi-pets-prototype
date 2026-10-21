/** Maintained deterministic re-fit exporter (WORK-013H): uniform downscale of every frame's artwork about the frame's
 * bottom centre (the base-centre pivot), canvas and frame grid unchanged. Pure Node (no browser), so bytes depend only
 * on the source and the config. No generation, registry writes or world geometry; asset-ledger records the result. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync, crc32 } from 'node:zlib';
import { decodePixels } from './image';
import { flags, readJson } from './common';
export interface Rgba { w: number; h: number; data: Uint8Array }
export interface Box { x: number; y: number; w: number; h: number }
interface Item { id: string; git: string; path: string; sha256: string; frame: { w: number; h: number }; referenceFrame: number; fitFraction: number }
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
/** Largest scale ≤ fraction whose scaled reference height is a whole pixel, so the bottom-anchored top edge lands on a pixel boundary. */
export function fitScale(fraction: number, referenceHeight: number): number {
    if (!(fraction > 0 && fraction <= 1) || !Number.isInteger(referenceHeight) || referenceHeight < 1)
        throw new Error('fitFraction must be in (0, 1] and the reference frame must have opaque pixels');
    return Math.floor(fraction * referenceHeight + 1e-9) / referenceHeight;
}
/** Per destination index: source indices and coverage weights (weights of a fully covered footprint sum to 1). */
function axisWeights(n: number, anchor: number, scale: number): [number, number][][] {
    return Array.from({ length: n }, (_, d) => {
        const s0 = anchor + (d - anchor) / scale, s1 = anchor + (d + 1 - anchor) / scale, row: [number, number][] = [];
        for (let i = Math.max(0, Math.floor(s0)); i < Math.min(n, Math.ceil(s1)); i++) {
            const overlap = Math.min(s1, i + 1) - Math.max(s0, i);
            if (overlap > 1e-9)
                row.push([i, overlap * scale]);
        }
        return row;
    });
}
/** Premultiplied area-average downscale of each frame×frame cell about its bottom centre. */
export function refit(src: Rgba, frame: { w: number; h: number }, scale: number): Rgba {
    if (src.w % frame.w || src.h % frame.h)
        throw new Error('Image dimensions must be divisible by the frame');
    const out = new Uint8Array(src.data.length), wx = axisWeights(frame.w, frame.w / 2, scale), wy = axisWeights(frame.h, frame.h, scale);
    for (let cy = 0; cy < src.h; cy += frame.h)
        for (let cx = 0; cx < src.w; cx += frame.w)
            for (let y = 0; y < frame.h; y++)
                for (let x = 0; x < frame.w; x++) {
                    const sum = [0, 0, 0, 0];
                    for (const [sy, ky] of wy[y])
                        for (const [sx, kx] of wx[x]) {
                            const p = ((cy + sy) * src.w + cx + sx) * 4, a = src.data[p + 3] * kx * ky;
                            sum[0] += src.data[p] * a; sum[1] += src.data[p + 1] * a; sum[2] += src.data[p + 2] * a; sum[3] += a;
                        }
                    const q = ((cy + y) * src.w + cx + x) * 4, alpha = Math.round(sum[3]);
                    if (alpha)
                        out.set([Math.round(sum[0] / sum[3]), Math.round(sum[1] / sum[3]), Math.round(sum[2] / sum[3]), alpha], q);
                }
    return { w: src.w, h: src.h, data: out };
}
/** Opaque (alpha > 0) bounding box of one cell, in cell pixels, as the harness measures it. */
export function opaqueBox(r: Rgba, fx: number, fy: number, fw: number, fh: number): Box | null {
    let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
    for (let y = 0; y < fh; y++)
        for (let x = 0; x < fw; x++)
            if (r.data[((fy + y) * r.w + fx + x) * 4 + 3]) {
                x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
export function decodeRgba(b: Buffer): Rgba {
    const { w, h, color, pixels } = decodePixels(b);
    if (color !== 6)
        throw new Error('Re-fit requires an 8-bit RGBA PNG source');
    return { w, h, data: new Uint8Array(pixels) };
}
function chunk(tag: string, body: Buffer): Buffer {
    const head = Buffer.alloc(8), tail = Buffer.alloc(4), typed = Buffer.concat([Buffer.from(tag, 'ascii'), body]);
    head.writeUInt32BE(body.length, 0); head.write(tag, 4, 'ascii'); tail.writeUInt32BE(crc32(typed), 0);
    return Buffer.concat([head, body, tail]);
}
/** 8-bit RGBA PNG; per scanline the filter with the smallest absolute residual sum (standard heuristic), zlib level 9. */
export function encodePng(r: Rgba): Buffer {
    const stride = r.w * 4, raw = Buffer.alloc((stride + 1) * r.h), at = (y: number, x: number) => (y < 0 || x < 0 ? 0 : r.data[y * stride + x]);
    const predict = [(): number => 0, (y: number, x: number) => at(y, x - 4), (y: number, x: number) => at(y - 1, x),
        (y: number, x: number) => (at(y, x - 4) + at(y - 1, x)) >> 1,
        (y: number, x: number) => { const a = at(y, x - 4), b = at(y - 1, x), c = at(y - 1, x - 4), p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }];
    for (let y = 0; y < r.h; y++) {
        let best = 0, bestCost = Infinity, bestLine = Buffer.alloc(0);
        predict.forEach((f, type) => {
            const line = Buffer.alloc(stride);
            let cost = 0;
            for (let x = 0; x < stride; x++) {
                line[x] = (r.data[y * stride + x] - f(y, x)) & 255; cost += line[x] < 128 ? line[x] : 256 - line[x];
            }
            if (cost < bestCost) { best = type; bestCost = cost; bestLine = line; }
        });
        raw[y * (stride + 1)] = best; bestLine.copy(raw, y * (stride + 1) + 1);
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(r.w, 0); ihdr.writeUInt32BE(r.h, 4); ihdr.set([8, 6, 0, 0, 0], 8);
    return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9, memLevel: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function cellBoxes(r: Rgba, frame: { w: number; h: number }): (Box | null)[] {
    const boxes: (Box | null)[] = [];
    for (let y = 0; y < r.h; y += frame.h)
        for (let x = 0; x < r.w; x += frame.w)
            boxes.push(opaqueBox(r, x, y, frame.w, frame.h));
    return boxes;
}
/** Re-fit one config item from its Git blob; throws unless the reference frame ends at ≤ fitFraction of its old opaque height. */
export function refitItem(item: Item, gameRoot: string): { png: Buffer; report: Record<string, unknown> } {
    const bytes = execFileSync('git', ['show', `${item.git}:./${item.path}`], { cwd: gameRoot, maxBuffer: 64 * 1024 * 1024 });
    if (sha(bytes) !== item.sha256)
        throw new Error(`${item.id}: source ${item.git}:${item.path} SHA-256 ${sha(bytes)} differs from config ${item.sha256}`);
    const src = decodeRgba(bytes), before = cellBoxes(src, item.frame), ref = before[item.referenceFrame];
    const scale = fitScale(item.fitFraction, ref?.h ?? 0), out = refit(src, item.frame, scale), after = cellBoxes(out, item.frame);
    const refAfter = after[item.referenceFrame];
    if (!refAfter || refAfter.h > item.fitFraction * ref!.h)
        throw new Error(`${item.id}: reference frame opaque height ${refAfter?.h} exceeds ${item.fitFraction} × ${ref!.h}`);
    const png = encodePng(out);
    return { png, report: { id: item.id, source: `${item.git}:${item.path}`, sourceSha256: item.sha256, sha256: sha(png), bytes: png.length,
        size: [out.w, out.h], frame: item.frame, fitFraction: item.fitFraction, scale, referenceFrame: item.referenceFrame,
        referenceOpaqueHeight: { before: ref!.h, after: refAfter.h }, opaqueBefore: before, opaqueAfter: after } };
}
export function main(args: string[]): number {
    const opts = flags(args, ['config', 'out']);
    if (!opts.config || !opts.out)
        throw new Error('Usage: tsx tools/assets/refit.ts --config <config.json> --out <staging-directory>');
    const configPath = resolve(String(opts.config)), config = readJson(configPath) as { items: Item[] }, out = resolve(String(opts.out));
    const gameRoot = resolve(dirname(new URL(import.meta.url).pathname), '../..'), results: Record<string, unknown>[] = [];
    for (const item of config.items) {
        const { png, report } = refitItem(item, gameRoot), file = resolve(out, item.id + '.png');
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, png, { flag: 'wx' });
        results.push({ ...report, file });
    }
    writeFileSync(resolve(out, 'refit-report.json'), JSON.stringify({ node: process.version, config: configPath, configSha256: sha(readFileSync(configPath)), results }, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify(results.map(r => ({ id: r.id, file: r.file, sha256: r.sha256, scale: r.scale, referenceOpaqueHeight: r.referenceOpaqueHeight })), null, 2) + '\n');
    return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        process.exitCode = main(process.argv.slice(2));
    }
    catch (error) {
        process.stderr.write(`refit: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 3;
    }
}

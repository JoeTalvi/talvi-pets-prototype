/** Maintained deterministic use-pose row builder (WORK-013J / TASK-083, APPROVAL-013, CN-12). Pure Node (no browser), so
 * bytes depend only on the sources and the config. For each selected four-pose candidate: blank the configured divider
 * columns, key the white background to alpha (the export-refinements.mjs sprite key: exterior flood fill of near-white,
 * dilated keep band, unmatte against white; plus enclosed white holes of at least `holeMinArea` px), split the poses into
 * equal cells by connected component (a pose whose tail crosses a cell line stays whole), trim, and scale each pose by the
 * row's head-height scale into a 256×256 cell about its base centre. Rows named in `base.copyRows` are copied byte for byte
 * from the committed sheet. No generation, registry writes or world geometry; asset-ledger records the result. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { decodePixels, dimensions } from './image';
import { flags, readJson } from './common';
import { decodeRgba, encodePng, opaqueBox, type Box, type Rgba } from './refit';
export interface Key { backgroundMin: number; backgroundChroma: number; dilation: number; holeMinArea: number }
export interface Pose { clip: string; row: number; source: string; sha256: string; cells: number; exclude?: [number, number][]; scale: number; head: { sourcePx: number; referencePx: number; framesPx?: number[] }; standing?: { referencePx: number; tolerancePx: number } }
export interface Config { frame: { w: number; h: number }; grid: { columns: number; rows: number }; base: { git: string; path: string; sha256: string; copyRows: number[] }; key: Key; headTolerancePx: number; poses: Pose[] }
const sha = (b: Uint8Array) => createHash('sha256').update(b).digest('hex');
/** JPEG bytes (the Asset-Bot candidates are JFIF data under a .png name) decoded by ffmpeg, the tool check-assets already uses. */
function jpegRgba(b: Buffer): Rgba {
    const { w, h } = dimensions(b), rgb = execFileSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-sws_flags', 'accurate_rnd+full_chroma_int', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: b, maxBuffer: 256 * 1024 * 1024 });
    if (rgb.length !== w * h * 3)
        throw new Error(`ffmpeg decoded ${rgb.length} bytes for a ${w}×${h} JPEG`);
    return expandRgb(w, h, rgb, 3);
}
function expandRgb(w: number, h: number, pixels: Uint8Array, channels: number): Rgba {
    const data = new Uint8Array(w * h * 4);
    for (let i = 0; i < w * h; i++)
        data.set([pixels[i * channels], pixels[i * channels + 1], pixels[i * channels + 2], 255], i * 4);
    return { w, h, data };
}
/** Candidate bytes as RGBA: 8-bit RGBA PNG as stored, RGB PNG and JPEG with alpha 255. */
export function toRgba(b: Buffer): Rgba {
    if (b[0] === 0xff && b[1] === 0xd8)
        return jpegRgba(b);
    const { w, h, color, channels, pixels } = decodePixels(b);
    if (color === 6)
        return { w, h, data: new Uint8Array(pixels) };
    if (color !== 2)
        throw new Error('Use-pose sources must be JPEG or 8-bit RGB/RGBA PNG');
    return expandRgb(w, h, pixels, channels);
}
/** Paints the inclusive column ranges white (the black cell dividers of a candidate), so the key treats them as background. */
export function blankColumns(src: Rgba, ranges: [number, number][]): Rgba {
    const data = new Uint8Array(src.data);
    for (const [x0, x1] of ranges)
        for (let y = 0; y < src.h; y++)
            for (let x = Math.max(0, x0); x <= Math.min(src.w - 1, x1); x++)
                data.set([255, 255, 255, 255], (y * src.w + x) * 4);
    return { w: src.w, h: src.h, data };
}
export interface Hole { x: number; y: number; area: number }
/** Background = near-white regions that touch the border, or enclosed near-white regions of at least holeMinArea px (`holes`,
 * e.g. the tail curl's eye; smaller enclosed whites such as eye highlights stay subject). */
export function backgroundMask(src: Rgba, key: Key): { mask: Uint8Array; holes: Hole[] } {
    const { w, h, data } = src, n = w * h, white = new Uint8Array(n), seen = new Uint8Array(n), out = new Uint8Array(n), queue = new Int32Array(n), holes: Hole[] = [];
    for (let i = 0; i < n; i++) {
        const p = i * 4, lo = Math.min(data[p], data[p + 1], data[p + 2]), hi = Math.max(data[p], data[p + 1], data[p + 2]);
        white[i] = lo >= key.backgroundMin && hi - lo <= key.backgroundChroma ? 1 : 0;
    }
    for (let start = 0; start < n; start++) {
        if (!white[start] || seen[start])
            continue;
        let head = 0, tail = 0, border = false;
        seen[start] = 1; queue[tail++] = start;
        while (head < tail) {
            const i = queue[head++], x = i % w, y = (i / w) | 0;
            border ||= x === 0 || y === 0 || x === w - 1 || y === h - 1;
            for (const j of [x ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y ? i - w : -1, y < h - 1 ? i + w : -1])
                if (j >= 0 && white[j] && !seen[j]) { seen[j] = 1; queue[tail++] = j; }
        }
        if (!border && tail >= key.holeMinArea)
            holes.push({ x: start % w, y: (start / w) | 0, area: tail });
        if (border || tail >= key.holeMinArea)
            for (let k = 0; k < tail; k++)
                out[queue[k]] = 1;
    }
    return { mask: out, holes };
}
/** export-refinements.mjs sprite key: subject pixels stay opaque; background inside the dilated keep band gets alpha from its
 * darkness and is unmatted against white; all other background becomes fully transparent. */
export function keyWhite(src: Rgba, key: Key): { keyed: Rgba; holes: Hole[] } {
    const { w, h } = src, { mask: background, holes } = backgroundMask(src, key), keep = new Uint8Array(w * h), data = new Uint8Array(src.data), d = key.dilation;
    for (let i = 0; i < keep.length; i++)
        if (!background[i]) {
            const x = i % w, y = (i / w) | 0;
            for (let dy = -d; dy <= d; dy++)
                for (let dx = -d; dx <= d; dx++)
                    if (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h)
                        keep[(y + dy) * w + x + dx] = 1;
        }
    for (let i = 0; i < background.length; i++) {
        if (!background[i])
            continue;
        const p = i * 4, a = keep[i] ? Math.round(255 * Math.min(1, (255 - Math.min(data[p], data[p + 1], data[p + 2])) / (255 - key.backgroundMin))) : 0;
        data[p + 3] = a;
        if (a > 0 && a < 255)
            for (let c = 0; c < 3; c++)
                data[p + c] = Math.max(0, Math.min(255, Math.round((data[p + c] - 255 * (1 - a / 255)) / (a / 255))));
        if (!a)
            data.set([0, 0, 0, 0], p);
    }
    return { keyed: { w, h, data }, holes };
}
export interface Part { box: Box; area: number; cell: number }
/** 8-connected components of alpha > 0, each assigned to the equal cell that holds its bounding-box centre. */
export function components(img: Rgba, cells: number): { labels: Int32Array; parts: Part[] } {
    const { w, h, data } = img, labels = new Int32Array(w * h).fill(-1), queue = new Int32Array(w * h), parts: Part[] = [];
    for (let start = 0; start < w * h; start++) {
        if (!data[start * 4 + 3] || labels[start] >= 0)
            continue;
        let head = 0, tail = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
        labels[start] = parts.length; queue[tail++] = start;
        while (head < tail) {
            const i = queue[head++], x = i % w, y = (i / w) | 0;
            x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
            for (let dy = -1; dy <= 1; dy++)
                for (let dx = -1; dx <= 1; dx++) {
                    const nx = x + dx, ny = y + dy, j = ny * w + nx;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h && data[j * 4 + 3] && labels[j] < 0) { labels[j] = parts.length; queue[tail++] = j; }
                }
        }
        const box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
        parts.push({ box, area: tail, cell: Math.min(cells - 1, Math.floor((x0 + x1 + 1) / 2 / (w / cells))) });
    }
    return { labels, parts };
}
/** One pose per cell: the union of its components, cropped to their joint box; other poses' pixels are left out. */
export function splitPoses(img: Rgba, cells: number): { pose: Rgba; box: Box; parts: Part[] }[] {
    const { labels, parts } = components(img, cells);
    return Array.from({ length: cells }, (_, cell) => {
        const mine = parts.filter(p => p.cell === cell);
        if (!mine.length)
            throw new Error(`Cell ${cell} holds no pose`);
        const x0 = Math.min(...mine.map(p => p.box.x)), y0 = Math.min(...mine.map(p => p.box.y));
        const box = { x: x0, y: y0, w: Math.max(...mine.map(p => p.box.x + p.box.w)) - x0, h: Math.max(...mine.map(p => p.box.y + p.box.h)) - y0 };
        const ids = new Set(mine.map(p => parts.indexOf(p))), data = new Uint8Array(box.w * box.h * 4);
        for (let y = 0; y < box.h; y++)
            for (let x = 0; x < box.w; x++) {
                const i = (box.y + y) * img.w + box.x + x;
                if (ids.has(labels[i]))
                    data.set(img.data.subarray(i * 4, i * 4 + 4), (y * box.w + x) * 4);
            }
        return { pose: { w: box.w, h: box.h, data }, box, parts: mine };
    });
}
/** Per destination pixel: source indices and coverage weights for source span [0, n) mapped to destination start + s × scale. */
function spanWeights(size: number, n: number, start: number, scale: number): [number, number][][] {
    return Array.from({ length: size }, (_, d) => {
        const s0 = (d - start) / scale, s1 = (d + 1 - start) / scale, row: [number, number][] = [];
        for (let i = Math.max(0, Math.floor(s0)); i < Math.min(n, Math.ceil(s1)); i++) {
            const overlap = Math.min(s1, i + 1) - Math.max(s0, i);
            if (overlap > 1e-9)
                row.push([i, overlap * scale]);
        }
        return row;
    });
}
/** Premultiplied area-average scale of a trimmed pose into a cell: bottom edge on the cell's bottom, box centre on the cell's centre. */
export function placePose(pose: Rgba, scale: number, cell: { w: number; h: number }): Rgba {
    if (pose.w * scale > cell.w || pose.h * scale > cell.h)
        throw new Error(`Pose ${pose.w}×${pose.h} at scale ${scale} does not fit a ${cell.w}×${cell.h} cell`);
    const out = new Uint8Array(cell.w * cell.h * 4), wx = spanWeights(cell.w, pose.w, (cell.w - pose.w * scale) / 2, scale), wy = spanWeights(cell.h, pose.h, cell.h - pose.h * scale, scale);
    for (let y = 0; y < cell.h; y++)
        for (let x = 0; x < cell.w; x++) {
            const sum = [0, 0, 0, 0];
            for (const [sy, ky] of wy[y])
                for (const [sx, kx] of wx[x]) {
                    const p = (sy * pose.w + sx) * 4, a = pose.data[p + 3] * kx * ky;
                    sum[0] += pose.data[p] * a; sum[1] += pose.data[p + 1] * a; sum[2] += pose.data[p + 2] * a; sum[3] += a;
                }
            const alpha = Math.round(sum[3]);
            if (alpha)
                out.set([Math.round(sum[0] / sum[3]), Math.round(sum[1] / sum[3]), Math.round(sum[2] / sum[3]), alpha], (y * cell.w + x) * 4);
        }
    return { w: cell.w, h: cell.h, data: out };
}
/** Copies a w×h block from (sx, sy) of src to (dx, dy) of dst, byte for byte. */
export function blit(src: Rgba, dst: Rgba, sx: number, sy: number, dx: number, dy: number, w: number, h: number): void {
    for (let y = 0; y < h; y++)
        dst.data.set(src.data.subarray(((sy + y) * src.w + sx) * 4, ((sy + y) * src.w + sx + w) * 4), ((dy + y) * dst.w + dx) * 4);
}
/** The brief's scale rules: head height within headTolerancePx of the reference (every frame's when `head.framesPx` lists
 * per-frame source heads, e.g. react's open mouth and head tilt); a standing pose's opaque height within its tolerance. */
export function scaleIssues(pose: Pose, tolerance: number, frameHeights: number[]): string[] {
    const issues: string[] = [], heads = pose.head.framesPx ?? [pose.head.sourcePx];
    heads.forEach((sourcePx, i) => {
        const head = sourcePx * pose.scale, label = pose.head.framesPx ? `${pose.clip} frame ${i}` : pose.clip;
        if (Math.abs(head - pose.head.referencePx) > tolerance)
            issues.push(`${label}: head ${head.toFixed(1)} px is not within ±${tolerance} of ${pose.head.referencePx}`);
    });
    if (pose.standing && Math.abs(frameHeights[0] - pose.standing.referencePx) > pose.standing.tolerancePx)
        issues.push(`${pose.clip}: standing height ${frameHeights[0]} px is not within ±${pose.standing.tolerancePx} of ${pose.standing.referencePx}`);
    return issues;
}
/** Builds one pose row into the sheet and returns its report; throws on a source hash mismatch or a broken scale rule. */
export function buildRow(pose: Pose, config: Config, sheet: Rgba, workflowRoot: string): Record<string, unknown> {
    const bytes = readFileSync(resolve(workflowRoot, pose.source));
    if (sha(bytes) !== pose.sha256)
        throw new Error(`${pose.clip}: ${pose.source} SHA-256 ${sha(bytes)} differs from config ${pose.sha256}`);
    const { keyed, holes } = keyWhite(blankColumns(toRgba(bytes), pose.exclude ?? []), config.key), poses = splitPoses(keyed, pose.cells), { w, h } = config.frame;
    if (pose.cells > config.grid.columns)
        throw new Error(`${pose.clip}: ${pose.cells} poses exceed ${config.grid.columns} columns`);
    const frames = poses.map(({ pose: art, box, parts }, i) => {
        const cell = placePose(art, pose.scale, config.frame);
        blit(cell, sheet, 0, 0, i * w, pose.row * h, w, h);
        return { index: pose.row * config.grid.columns + i, sourceBox: box, components: parts.map(p => ({ box: p.box, area: p.area })), opaque: opaqueBox(cell, 0, 0, w, h) };
    });
    const issues = scaleIssues(pose, config.headTolerancePx, frames.map(f => f.opaque?.h ?? 0));
    if (issues.length)
        throw new Error(issues.join('; '));
    return { clip: pose.clip, row: pose.row, source: pose.source, sourceSha256: pose.sha256, exclude: pose.exclude ?? [], holesKeyed: holes, scale: pose.scale,
        headPx: { source: pose.head.sourcePx, scaled: Math.round(pose.head.sourcePx * pose.scale * 10) / 10, reference: pose.head.referencePx,
            ...(pose.head.framesPx ? { framesSource: pose.head.framesPx, framesScaled: pose.head.framesPx.map(px => Math.round(px * pose.scale * 10) / 10) } : {}) }, frames };
}
/** Whole sheet: committed base rows copied, pose rows built, every other cell transparent. */
export function buildSheet(config: Config, gameRoot: string): { png: Buffer; report: Record<string, unknown> } {
    const base = execFileSync('git', ['show', `${config.base.git}:./${config.base.path}`], { cwd: gameRoot, maxBuffer: 64 * 1024 * 1024 });
    if (sha(base) !== config.base.sha256)
        throw new Error(`Base ${config.base.git}:${config.base.path} SHA-256 ${sha(base)} differs from config ${config.base.sha256}`);
    const src = decodeRgba(base), { w, h } = config.frame, sheet: Rgba = { w: config.grid.columns * w, h: config.grid.rows * h, data: new Uint8Array(config.grid.columns * w * config.grid.rows * h * 4) };
    if (src.w !== sheet.w)
        throw new Error(`Base sheet width ${src.w} differs from ${sheet.w}`);
    for (const row of config.base.copyRows)
        blit(src, sheet, 0, row * h, 0, row * h, sheet.w, h);
    const rows = config.poses.map(pose => buildRow(pose, config, sheet, resolve(gameRoot, '..')));
    const png = encodePng(sheet);
    return { png, report: { base: `${config.base.git}:${config.base.path}`, baseSha256: config.base.sha256, copyRows: config.base.copyRows, size: [sheet.w, sheet.h], sha256: sha(png), bytes: png.length, rows } };
}
export function main(args: string[]): number {
    const opts = flags(args, ['config', 'out']);
    if (!opts.config || !opts.out)
        throw new Error('Usage: tsx tools/assets/use-poses.ts --config <config.json> --out <staging-directory>');
    const configPath = resolve(String(opts.config)), config = readJson(configPath) as Config, out = resolve(String(opts.out));
    const gameRoot = resolve(dirname(new URL(import.meta.url).pathname), '../..'), { png, report } = buildSheet(config, gameRoot), file = resolve(out, 'pets/dog-sheet.png');
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, png, { flag: 'wx' });
    writeFileSync(resolve(out, 'use-poses-report.json'), JSON.stringify({ node: process.version, config: configPath, configSha256: sha(readFileSync(configPath)), file, ...report }, null, 2) + '\n', { flag: 'wx' });
    process.stdout.write(JSON.stringify({ file, sha256: report.sha256, bytes: report.bytes, size: report.size }, null, 2) + '\n');
    return 0;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    try {
        process.exitCode = main(process.argv.slice(2));
    }
    catch (error) {
        process.stderr.write(`use-poses: ${error instanceof Error ? error.message : String(error)}\n`);
        process.exitCode = 3;
    }
}

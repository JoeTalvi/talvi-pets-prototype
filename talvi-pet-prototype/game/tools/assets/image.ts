import { inflateSync } from 'node:zlib';
export interface Raster {
    w: number;
    h: number;
    alpha: Uint8Array;
    hasAlpha: boolean;
}
export function dimensions(b: Buffer): {
    w: number;
    h: number;
} {
    if (b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
        return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
    if (b[0] === 255 && b[1] === 216) {
        for (let p = 2; p < b.length;) {
            if (b[p++] !== 255)
                throw new Error('Invalid JPEG marker');
            const marker = b[p++];
            if (marker === 217 || marker === 218)
                break;
            const n = b.readUInt16BE(p);
            if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker))
                return { h: b.readUInt16BE(p + 3), w: b.readUInt16BE(p + 5) };
            p += n;
        }
    }
    if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
        const tag = b.toString('ascii', 12, 16);
        if (tag === 'VP8X')
            return { w: 1 + b.readUIntLE(24, 3), h: 1 + b.readUIntLE(27, 3) };
        if (tag === 'VP8 ')
            return { w: b.readUInt16LE(26) & 16383, h: b.readUInt16LE(28) & 16383 };
        if (tag === 'VP8L') {
            const n = b.readUInt32LE(21);
            return { w: 1 + (n & 16383), h: 1 + ((n >>> 14) & 16383) };
        }
    }
    throw new Error('Unsupported or malformed image header');
}
function paeth(a: number, b: number, c: number): number {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}
export function decodePng(b: Buffer): Raster {
    const { w, h } = dimensions(b), depth = b[24], color = b[25], channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[color];
    if (depth !== 8 || !channels || b[28] !== 0)
        throw new Error('PNG alpha decoder requires noninterlaced 8-bit PNG');
    const data: Buffer[] = [];
    let transparency: Buffer | undefined;
    for (let p = 8; p < b.length;) {
        const n = b.readUInt32BE(p), tag = b.toString('ascii', p + 4, p + 8), chunk = b.subarray(p + 8, p + 8 + n);
        if (tag === 'IDAT')
            data.push(chunk);
        if (tag === 'tRNS')
            transparency = chunk;
        p += n + 12;
    }
    const raw = inflateSync(Buffer.concat(data)), stride = w * channels, pixels = Buffer.alloc(h * stride);
    if (raw.length !== (stride + 1) * h)
        throw new Error('Invalid PNG scanline length');
    for (let y = 0; y < h; y++) {
        const filter = raw[y * (stride + 1)];
        if (filter > 4)
            throw new Error('Invalid PNG filter');
        for (let x = 0; x < stride; x++) {
            const i = y * stride + x, a = x >= channels ? pixels[i - channels] : 0, c = y > 0 && x >= channels ? pixels[i - stride - channels] : 0, up = y > 0 ? pixels[i - stride] : 0;
            pixels[i] = (raw[y * (stride + 1) + 1 + x] + [0, a, up, Math.floor((a + up) / 2), paeth(a, up, c)][filter]) & 255;
        }
    }
    const alpha = new Uint8Array(w * h);
    for (let i = 0; i < alpha.length; i++) {
        const p = i * channels;
        alpha[i] = color === 6 ? pixels[p + 3] : color === 4 ? pixels[p + 1] : color === 3 ? (transparency?.[pixels[p]] ?? 255) : 255;
        if (color === 0 && transparency && pixels[p] === transparency.readUInt16BE(0))
            alpha[i] = 0;
        if (color === 2 && transparency && [0, 1, 2].every(c => pixels[p + c] === transparency.readUInt16BE(c * 2)))
            alpha[i] = 0;
    }
    return { w, h, alpha, hasAlpha: color === 4 || color === 6 || !!transparency };
}
export function alphaIoU(a: Raster, b: Raster): number {
    if (a.w !== b.w || a.h !== b.h)
        return 0;
    let union = 0, intersection = 0;
    for (let i = 0; i < a.alpha.length; i++) {
        const x = a.alpha[i] > 0, y = b.alpha[i] > 0;
        if (x || y)
            union++;
        if (x && y)
            intersection++;
    }
    return union ? intersection / union : 1;
}
export function bounds(r: Raster, x = 0, y = 0, w = r.w, h = r.h) {
    let left = w, right = -1, bottom = -1;
    for (let j = 0; j < h; j++)
        for (let i = 0; i < w; i++)
            if (r.alpha[(y + j) * r.w + x + i] > 0) {
                left = Math.min(left, i);
                right = Math.max(right, i);
                bottom = Math.max(bottom, j);
            }
    return { bottomGap: h - 1 - bottom, centerOffset: right < 0 ? Infinity : Math.abs((left + right) / 2 - (w - 1) / 2) };
}

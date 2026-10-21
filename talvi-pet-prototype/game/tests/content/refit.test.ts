import { describe, expect, it } from 'vitest';
import { decodeRgba, encodePng, fitScale, opaqueBox, refit, type Rgba } from '../../tools/assets/refit';
import { decodePng } from '../../tools/assets/image';
/** w×h RGBA canvas with an opaque block of colour [r,g,b] at (x,y,bw,bh). */
function canvas(w: number, h: number, block: [number, number, number, number], rgb = [200, 100, 50]): Rgba {
    const data = new Uint8Array(w * h * 4), [bx, by, bw, bh] = block;
    for (let y = by; y < by + bh; y++)
        for (let x = bx; x < bx + bw; x++)
            data.set([...rgb, 255], (y * w + x) * 4);
    return { w, h, data };
}
describe('refit (WORK-013H half-size re-fit about the base centre)', () => {
    it('fitScale keeps an exact half for an even reference height', () => {
        expect(fitScale(0.5, 222)).toBe(0.5);
    });
    it('fitScale rounds an odd reference height down to a whole-pixel result', () => {
        const scale = fitScale(0.5, 221);
        expect(scale).toBeCloseTo(110 / 221, 12);
        expect(Math.round(221 * scale)).toBe(110);
    });
    it('fitScale rejects a fraction outside (0, 1] and an empty reference', () => {
        expect(() => fitScale(0, 100)).toThrow(/fitFraction/);
        expect(() => fitScale(1.5, 100)).toThrow(/fitFraction/);
        expect(() => fitScale(0.5, 0)).toThrow(/opaque pixels/);
    });
    it('halves a bottom-centred block and keeps it bottom-centred in every cell', () => {
        // Two 8×8 cells side by side, each with a 4×4 block on the cell's bottom centre.
        const src = canvas(16, 8, [2, 4, 4, 4]), second = canvas(16, 8, [10, 4, 4, 4]);
        second.data.forEach((v, i) => { src.data[i] |= v; });
        const out = refit(src, { w: 8, h: 8 }, 0.5);
        expect(opaqueBox(out, 0, 0, 8, 8)).toEqual({ x: 3, y: 6, w: 2, h: 2 });
        expect(opaqueBox(out, 8, 0, 8, 8)).toEqual({ x: 3, y: 6, w: 2, h: 2 });
        expect(Array.from(out.data.subarray((7 * 16 + 3) * 4, (7 * 16 + 3) * 4 + 4))).toEqual([200, 100, 50, 255]);
    });
    it('leaves empty cells fully transparent', () => {
        const out = refit(canvas(16, 8, [2, 4, 4, 4]), { w: 8, h: 8 }, 0.5);
        expect(opaqueBox(out, 8, 0, 8, 8)).toBeNull();
    });
    it('averages coverage at a partial edge and never spills above the scaled top', () => {
        // 3-px-tall block halves to 1.5 px: one full row plus one half-covered row.
        const out = refit(canvas(8, 8, [2, 5, 4, 3]), { w: 8, h: 8 }, 0.5);
        expect(opaqueBox(out, 0, 0, 8, 8)).toEqual({ x: 3, y: 6, w: 2, h: 2 });
        expect(out.data[(6 * 8 + 3) * 4 + 3]).toBe(128);
        expect(out.data[(6 * 8 + 3) * 4]).toBe(200);
    });
    it('rejects images not divisible by the frame', () => {
        expect(() => refit(canvas(10, 8, [0, 0, 1, 1]), { w: 8, h: 8 }, 0.5)).toThrow(/divisible/);
    });
    it('encodes an RGBA PNG that decodes back to the same pixels', () => {
        const img = refit(canvas(16, 8, [2, 3, 4, 5], [10, 220, 30]), { w: 8, h: 8 }, 0.5), png = encodePng(img);
        expect(Array.from(decodeRgba(png).data)).toEqual(Array.from(img.data));
        expect(decodePng(png)).toMatchObject({ w: 16, h: 8, hasAlpha: true });
    });
});

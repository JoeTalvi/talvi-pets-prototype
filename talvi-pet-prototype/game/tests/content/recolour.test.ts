import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { encodePng, type Rgba } from '../../tools/assets/refit';
import { alphaIdentical, bandWeight, recolour, rgbToHsv, toRgba, type Mapping } from '../../tools/assets/recolour';
const mapping: Mapping = { hue: [8, 45], hueFeather: 8, satMin: 0.38, satFeather: 0.06, value: [0.36, 0.82], valueFeather: 0.05,
    targetHue: 212, satScale: 0.5, valueScale: 1, keep: { satMin: 0.6, valueMax: 0.4, feather: 0.03 } };
/** 4×1 raster: brown plumage, cream, dark contour, transparent; alpha varies per pixel. */
function raster(): Rgba {
    return { w: 4, h: 1, data: new Uint8Array([142, 106, 80, 255, 244, 229, 199, 200, 74, 48, 32, 255, 10, 20, 30, 0]) };
}
describe('recolour (WORK-034-1 owl-mate palette shift)', () => {
    it('moves the brown plumage to slate blue-grey', () => {
        const [h, s] = rgbToHsv(...(Array.from(recolour(raster(), mapping).data.slice(0, 3)) as [number, number, number]));
        expect(h).toBeGreaterThan(195);
        expect(h).toBeLessThan(230);
        expect(s).toBeLessThan(0.35);
    });
    it('keeps cream, dark contour and transparent pixels byte for byte', () => {
        const src = raster(), out = recolour(src, mapping);
        expect(Array.from(out.data.slice(4))).toEqual(Array.from(src.data.slice(4)));
        expect(bandWeight(74, 48, 32, mapping)).toBe(0);
    });
    it('copies every alpha byte, also through a PNG round trip', () => {
        const src = raster(), out = recolour(src, mapping);
        expect(alphaIdentical(src, out)).toBe(true);
        expect(alphaIdentical(src, toRgba(encodePng(out)))).toBe(true);
    });
    it('is deterministic: the same input gives the same PNG bytes', () => {
        const hash = () => createHash('sha256').update(encodePng(recolour(raster(), mapping))).digest('hex');
        expect(hash()).toBe(hash());
    });
    it('protects saturated dark pixels (irises) through the keep corner', () => {
        expect(bandWeight(65, 38, 25, mapping)).toBe(0);
    });
});

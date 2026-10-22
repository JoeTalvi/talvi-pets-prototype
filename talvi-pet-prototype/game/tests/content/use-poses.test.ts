import { describe, expect, it } from 'vitest';
import { backgroundMask, blankColumns, blit, keyWhite, placePose, scaleIssues, splitPoses, toRgba, type Key, type Pose } from '../../tools/assets/use-poses';
import { encodePng, opaqueBox, type Rgba } from '../../tools/assets/refit';
const key: Key = { backgroundMin: 240, backgroundChroma: 18, dilation: 0, holeMinArea: 4 };
/** White w×h RGB canvas (alpha 255) with dark rectangles [x, y, w, h]. */
function sheet(w: number, h: number, blocks: [number, number, number, number][], rgb = [60, 30, 10]): Rgba {
    const data = new Uint8Array(w * h * 4).fill(255);
    for (const [bx, by, bw, bh] of blocks)
        for (let y = by; y < by + bh; y++)
            for (let x = bx; x < bx + bw; x++)
                data.set([...rgb, 255], (y * w + x) * 4);
    return { w, h, data };
}
const alpha = (r: Rgba, x: number, y: number) => r.data[(y * r.w + x) * 4 + 3];
describe('use-poses keying (WORK-013J white background to alpha)', () => {
    it('reads an RGB PNG as opaque RGBA', () => {
        const rgba = toRgba(encodePng(sheet(4, 2, [[1, 0, 1, 1]])));
        expect(rgba).toMatchObject({ w: 4, h: 2 });
        expect(Array.from(rgba.data.subarray(4, 8))).toEqual([60, 30, 10, 255]);
    });
    it('clears the border-connected white and keeps the subject opaque', () => {
        const { keyed } = keyWhite(sheet(8, 8, [[2, 2, 4, 4]]), key);
        expect(alpha(keyed, 0, 0)).toBe(0);
        expect(alpha(keyed, 3, 3)).toBe(255);
        expect(opaqueBox(keyed, 0, 0, 8, 8)).toEqual({ x: 2, y: 2, w: 4, h: 4 });
    });
    it('clears an enclosed white hole of at least holeMinArea and keeps a smaller one (eye highlight)', () => {
        // Ring 0..7 with a 2×2 hole at (3,3) and a 1-px white speck at (1,1) inside a 1-px-thick frame region.
        const img = sheet(10, 10, [[1, 1, 8, 8]]);
        for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4], [6, 6]])
            img.data.set([255, 255, 255, 255], (y * 10 + x) * 4);
        const { mask, holes } = backgroundMask(img, key);
        expect(holes).toEqual([{ x: 3, y: 3, area: 4 }]);
        expect(mask[3 * 10 + 3]).toBe(1);
        expect(mask[6 * 10 + 6]).toBe(0);
    });
    it('blanks divider columns so they key as background', () => {
        const img = blankColumns(sheet(9, 4, [[4, 0, 1, 4], [1, 1, 2, 2], [6, 1, 2, 2]]), [[4, 4]]);
        const { keyed } = keyWhite(img, key);
        expect(alpha(keyed, 4, 0)).toBe(0);
        expect(splitPoses(keyed, 2).map(p => p.box)).toEqual([{ x: 1, y: 1, w: 2, h: 2 }, { x: 6, y: 1, w: 2, h: 2 }]);
    });
});
describe('use-poses split and fit', () => {
    it('keeps a pose whole when its tail crosses the equal cell line', () => {
        // Two cells of 10 px; the second pose (x 8..15) starts 2 px inside the first cell.
        const { keyed } = keyWhite(sheet(20, 6, [[1, 2, 4, 3], [8, 1, 8, 4]]), key);
        expect(splitPoses(keyed, 2).map(p => p.box)).toEqual([{ x: 1, y: 2, w: 4, h: 3 }, { x: 8, y: 1, w: 8, h: 4 }]);
    });
    it('throws when a cell holds no pose', () => {
        const { keyed } = keyWhite(sheet(20, 6, [[1, 2, 4, 3]]), key);
        expect(() => splitPoses(keyed, 2)).toThrow(/Cell 1 holds no pose/);
    });
    it('scales a pose onto the cell bottom, horizontally centred', () => {
        const pose = { w: 8, h: 4, data: new Uint8Array(8 * 4 * 4).fill(255) };
        const cell = placePose(pose, 0.5, { w: 16, h: 16 });
        expect(opaqueBox(cell, 0, 0, 16, 16)).toEqual({ x: 6, y: 14, w: 4, h: 2 });
        expect(() => placePose(pose, 3, { w: 16, h: 16 })).toThrow(/does not fit/);
    });
    it('blit copies a block byte for byte', () => {
        const src = sheet(4, 4, [[1, 1, 2, 2]]), dst: Rgba = { w: 4, h: 8, data: new Uint8Array(4 * 8 * 4) };
        blit(src, dst, 0, 0, 0, 4, 4, 4);
        expect(Array.from(dst.data.subarray(16 * 4))).toEqual(Array.from(src.data));
    });
});
describe('use-poses scale rules (head height ±tolerance, standing height)', () => {
    const pose = (scale: number, standing = false): Pose => ({ clip: 'use-look', row: 5, source: 's', sha256: 'h', cells: 4, scale, head: { sourcePx: 100, referencePx: 42 }, ...(standing ? { standing: { referencePx: 111, tolerancePx: 6 } } : {}) });
    it('accepts a head within tolerance and rejects one outside', () => {
        expect(scaleIssues(pose(0.45), 4, [100])).toEqual([]);
        expect(scaleIssues(pose(0.47), 4, [100])[0]).toMatch(/head 47.0 px is not within ±4 of 42/);
    });
    it('checks the standing height of frame 0 when configured', () => {
        expect(scaleIssues(pose(0.42, true), 4, [117])).toEqual([]);
        expect(scaleIssues(pose(0.42, true), 4, [118])[0]).toMatch(/standing height 118 px/);
    });
    it('checks every frame\'s head when per-frame source heads are configured (react: open mouth, head tilt)', () => {
        const react = (scale: number): Pose => ({ ...pose(scale), clip: 'react', row: 3, head: { sourcePx: 146.5, referencePx: 42, framesPx: [141, 146, 153, 146] } });
        expect(scaleIssues(react(0.287), 4, [])).toEqual([]);
        expect(scaleIssues(react(0.305), 4, [])).toEqual(['react frame 2: head 46.7 px is not within ±4 of 42']);
        expect(scaleIssues(react(0.265), 4, [])).toEqual(['react frame 0: head 37.4 px is not within ±4 of 42']);
    });
});

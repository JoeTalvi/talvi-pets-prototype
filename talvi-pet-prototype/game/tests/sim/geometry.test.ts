import { it, expect } from 'vitest';
import { pointInPolygon, segmentInPolygon, polygonArea } from '../../src/sim/geometry';
const square = [
    {
        x: 0, y: 0
    }, {
        x: 10, y: 0
    }, {
        x: 10, y: 10
    }, {
        x: 0, y: 10
    }
];
it('even-odd includes edges/vertices and rejects exterior', () => {
    expect(pointInPolygon({
        x: 0, y: 5
    }, square)).toBe(true);
    expect(pointInPolygon({
        x: 10, y: 10
    }, square)).toBe(true);
    expect(pointInPolygon({
        x: 5, y: 5
    }, square)).toBe(true);
    expect(pointInPolygon({
        x: 11, y: 5
    }, square)).toBe(false);
    expect(pointInPolygon({
        x: 0, y: 0
    }, [])).toBe(false);
});
it('signed shoelace area changes sign with winding', () => {
    expect(polygonArea(square)).toBe(100);
    expect(polygonArea([
        ...square
    ].reverse())).toBe(-100);
    expect(polygonArea([
        {
            x: 0, y: 0
        }, {
            x: 1, y: 1
        }, {
            x: 2, y: 2
        }
    ])).toBe(0);
});
it('allows boundary travel and zero-length interior segments', () => {
    expect(segmentInPolygon({
        x: 0, y: 0
    }, {
        x: 10, y: 0
    }, square)).toBe(true);
    expect(segmentInPolygon({
        x: 5, y: 5
    }, {
        x: 5, y: 5
    }, square)).toBe(true);
    expect(segmentInPolygon({
        x: -1, y: 0
    }, {
        x: 5, y: 0
    }, square)).toBe(false);
});
it('catches concave crossings including an exterior interval through vertices', () => {
    const u = [
        {
            x: 0, y: 0
        }, {
            x: 4, y: 0
        }, {
            x: 4, y: 7
        }, {
            x: 6, y: 7
        }, {
            x: 6, y: 0
        }, {
            x: 10, y: 0
        }, {
            x: 10, y: 10
        }, {
            x: 0, y: 10
        }
    ];
    expect(segmentInPolygon({
        x: 2, y: 4
    }, {
        x: 8, y: 4
    }, u)).toBe(false);
    expect(segmentInPolygon({
        x: 2, y: 7
    }, {
        x: 8, y: 7
    }, u)).toBe(true);
    expect(segmentInPolygon({
        x: 4, y: 0
    }, {
        x: 6, y: 0
    }, u)).toBe(false);
    expect(segmentInPolygon({
        x: 2, y: 8
    }, {
        x: 8, y: 8
    }, u)).toBe(true);
});

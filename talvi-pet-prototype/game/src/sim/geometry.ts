import type { Point } from '../content/schema/common';
const EPS = 1e-8;
const cross = (a: Point, b: Point, c: Point) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
function onEdge(p: Point, a: Point, b: Point): boolean {
    return Math.abs(cross(a, b, p)) <= EPS && p.x >= Math.min(a.x, b.x) - EPS && p.x <= Math.max(a.x, b.x) + EPS && p.y >= Math.min(a.y, b.y) - EPS && p.y <= Math.max(a.y, b.y) + EPS;
}
/** Even-odd fill; boundary points are inside. */
export function pointInPolygon(p: Point, poly: readonly Point[]): boolean {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const a = poly[j], b = poly[i];
        if (onEdge(p, a, b))
            return true;
        if ((a.y > p.y) !== (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x)
            inside = !inside;
    }
    return inside;
}
/** Signed shoelace area. */
export function polygonArea(poly: readonly Point[]): number {
    return poly.reduce((area, p, i) => {
        const q = poly[(i + 1) % poly.length];
        return area + p.x * q.y - q.x * p.y;
    }, 0) / 2;
}
/** Split at every edge intersection and test each open interval: vertex touches and
 * boundary travel remain inside, while concave vertex crossings cannot escape. */
export function segmentInPolygon(a: Point, b: Point, poly: readonly Point[]): boolean {
    if (!pointInPolygon(a, poly) || !pointInPolygon(b, poly))
        return false;
    const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
    if (len < EPS * EPS)
        return true;
    const ts = [
        0, 1
    ];
    for (let i = 0; i < poly.length; i++) {
        const c = poly[i], d = poly[(i + 1) % poly.length], ex = d.x - c.x, ey = d.y - c.y, den = dx * ey - dy * ex;
        if (Math.abs(den) > EPS) {
            const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / den, u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / den;
            if (t >= -EPS && t <= 1 + EPS && u >= -EPS && u <= 1 + EPS)
                ts.push(Math.max(0, Math.min(1, t)));
        }
        else if (Math.abs(cross(a, b, c)) <= EPS) {
            for (const p of [
                c, d
            ]) {
                const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len;
                if (t > 0 && t < 1)
                    ts.push(t);
            }
        }
    }
    ts.sort((x, y) => x - y);
    return ts.slice(1).every((t, i) => {
        const mid = (t + ts[i]) / 2;
        return pointInPolygon({
            x: a.x + dx * mid, y: a.y + dy * mid
        }, poly);
    });
}

import type { Content } from '../../content/types';
import type { AssetManifest } from '../../content/schema/assets';
import type { Point } from '../../content/schema/common';
import { pointInPolygon, pointInRect, polygonArea, walkable } from '../geometry';
import { finding, type Finding } from './types';
const within = (p: Point, r: {
    x: number;
    y: number;
    w: number;
    h: number;
}) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;
export function check001(c: Content, m?: AssetManifest): Finding[] {
    const out: Finding[] = [];
    const add = (n: string, f: string, p: string, msg: string, alias?: string) => out.push(finding([
        `CHK-001-${n}`, ...(alias ? [
            alias
        ] : [])
    ], 'error', f, p, msg));
    const scenes = [
        {
            id: 'street', file: 'street.json', walkArea: c.street.walkArea, doors: c.street.houses.map(h => h.door)
        }, ...Object.values(c.rooms).map(r => ({
            ...r, file: `rooms/${r.id}.json`
        }))
    ];
    for (const scene of scenes)
        out.push(...checkScene(c, scene, scenes));
    if (!pointInPolygon(c.street.playerSpawn, c.street.walkArea) || scenes[0].doors.some(d => within(c.street.playerSpawn, d.rect)))
        add('05', 'street.json', '/playerSpawn', 'playerSpawn must be inside walkArea and outside doors');
    c.projects.forEach(p => {
        const hs = c.street.houses.filter(h => h.projectId === p.id);
        if (hs.length !== 1 || hs[0]?.door.target.scene !== 'interior' || hs[0]?.door.target.roomId !== p.interiorRoomId)
            add('06', 'street.json', '/houses', `Project "${p.id}" must have exactly one house targeting "${p.interiorRoomId}"`);
    });
    out.push(...checkGroundAndArrivals(c, m));
    out.push(...checkBlockers(c));
    return out;
}
/** WORK-032-1: street blockers (CHK-001-11..14). A door centre outside the walk area stays CHK-001-02 (aliased 13). */
function checkBlockers(c: Content): Finding[] {
    const out: Finding[] = [];
    const add = (n: string, p: string, msg: string) => out.push(finding(`CHK-001-${n}`, 'error', 'street.json', p, msg));
    const s = c.street, all = s.houses.flatMap(h => h.blockers);
    const inBlocker = (p: Point) => all.some(b => pointInRect(p, b));
    s.houses.forEach((h, i) => {
        h.blockers.forEach((b, j) => {
            if (b.x < 0 || b.y < 0 || b.x + b.w > 1920 || b.y + b.h > 1080)
                add('11', `/houses/${i}/blockers/${j}`, 'Blocker must lie inside the 1920x1080 scene');
        });
        if (inBlocker(h.door.spawn))
            add('12', `/houses/${i}/door/spawn`, 'Door spawn must be outside every blocker');
        const r = h.door.rect, centre = { x: r.x + r.w / 2, y: r.y + r.h / 2 };
        if (pointInPolygon(centre, s.walkArea) && !walkable(centre, s.walkArea, all))
            add('13', `/houses/${i}/door/rect`, 'Door centre must be walkable (inside a blocker)');
        const others = s.houses.filter((_, k) => k !== i).flatMap(o => o.blockers);
        h.arrivalPath.forEach((p, k) => {
            if (others.some(b => pointInRect(p, b)))
                add('14', `/houses/${i}/arrivalPath/${k}`, "arrivalPath point inside another house's blocker");
        });
    });
    if (inBlocker(s.playerSpawn))
        add('12', '/playerSpawn', 'playerSpawn must be outside every blocker');
    return out;
}
function checkGroundAndArrivals(c: Content, m?: AssetManifest): Finding[] {
    const out: Finding[] = [];
    const add = (n: string, f: string, p: string, msg: string) => out.push(finding(`CHK-001-${n}`, "error", f, p, msg));
    if (!m)
        out.push(finding('CHK-001-07', 'info', 'street.json', '/groundTiles', 'manifest not supplied; tile dimensions unavailable'));
    else {
        const rects = c.street.groundTiles.map(t => {
            const e = m.entries.find(e => e.id === t.sprite);
            return {
                x: t.x, y: t.y, w: e?.px?.w ?? 0, h: e?.px?.h ?? 0
            };
        });
        const xs = [
            -960, 2880, ...rects.flatMap(r => [
                Math.max(-960, Math.min(2880, r.x)), Math.max(-960, Math.min(2880, r.x + r.w))
            ])
        ].sort((a, b) => a - b);
        let gap = false;
        for (let i = 1; i < xs.length && !gap; i++) {
            if (xs[i] === xs[i - 1])
                continue;
            const x = (xs[i] + xs[i - 1]) / 2;
            const spans = rects.filter(r => x >= r.x && x < r.x + r.w).map(r => [
                r.y, r.y + r.h
            ]).sort((a, b) => a[0] - b[0]);
            let y = -540;
            for (const [lo, hi] of spans) {
                if (lo > y)
                    break;
                y = Math.max(y, hi);
            }
            if (y < 1620)
                gap = true;
        }
        if (gap)
            add('07', 'street.json', '/groundTiles', 'Ground tiles must cover (-960,-540)..(2880,1620) without gaps');
    }
    c.street.houses.forEach((h, i) => {
        const px = m?.entries.find(e => e.id === h.stageSprites[5])?.px;
        const footprint = px ? {
            x: h.x - px.w / 2, y: h.y - px.h, w: px.w, h: px.h
        } : undefined;
        const end = h.arrivalPath.at(-1);
        if (h.arrivalPath.length < 2 || h.arrivalPath.some(p => !pointInPolygon(p, c.street.walkArea) && !(footprint && within(p, footprint))) || h.attentionAnchor.y >= h.y || !end || !within(end, h.door.rect))
            add('10', 'street.json', `/houses/${i}/arrivalPath`, 'arrivalPath needs at least 2 valid points ending inside the door; attentionAnchor must be above the house base');
    });
    return out;
}
type Scene = {
    id: string;
    file: string;
    walkArea: Point[];
    doors: import('../../content/schema/common').Door[];
};
function checkScene(c: Content, s: Scene, scenes: Scene[]): Finding[] {
    const out: Finding[] = [];
    const add = (n: string, f: string, p: string, msg: string, alias?: string) => out.push(finding([
        `CHK-001-${n}`, ...(alias ? [
            alias
        ] : [])
    ], 'error', f, p, msg));
    const doorPath = (i: number) => s.id === 'street' ? `/houses/${i}/door` : `/doors/${i}`;
    if (s.walkArea.length < 3 || Math.abs(polygonArea(s.walkArea)) === 0)
        add('01', s.file, '/walkArea', 'walkArea must have at least 3 vertices and non-zero area');
    s.doors.forEach((d, i) => {
        const path = doorPath(i);
        if (!pointInPolygon({
            x: d.rect.x + d.rect.w / 2, y: d.rect.y + d.rect.h / 2
        }, s.walkArea))
            add('02', s.file, path + '/rect', 'Door centre is outside walkArea', s.id === 'street' ? 'CHK-001-13' : undefined);
        const target = s.id === 'street' ? {
            scene: 'street', doorId: d.id
        } : {
            scene: 'interior', roomId: s.id, doorId: d.id
        };
        const dest = scenes.find(t => t.id === (d.target.scene === 'street' ? 'street' : d.target.roomId))?.doors.find(t => t.id === d.target.doorId);
        if (dest && (dest.target.scene !== target.scene || dest.target.doorId !== d.id || (dest.target.scene === 'interior' && dest.target.roomId !== s.id)))
            add('03', s.file, path + '/target', 'Door target must point back to this door');
        const outside = !pointInPolygon(d.spawn, s.walkArea);
        if (outside || s.doors.some(x => within(d.spawn, x.rect)))
            add('04', s.file, path + '/spawn', 'Door spawn must be inside walkArea and outside every door rect', outside && s.id !== 'street' ? 'CHK-007-06' : undefined);
        if (d.rect.w <= 0 || d.rect.h <= 0)
            add('08', s.file, path + '/rect', 'Door width and height must be positive');
        s.doors.slice(i + 1).forEach(e => {
            if (d.rect.x < e.rect.x + e.rect.w && d.rect.x + d.rect.w > e.rect.x && d.rect.y < e.rect.y + e.rect.h && d.rect.y + d.rect.h > e.rect.y)
                add('08', s.file, path + '/rect', `Door overlaps "${e.id}"`);
        });
    });
    const points = [
        ...s.walkArea, ...s.doors.flatMap(d => [
            {
                x: d.rect.x, y: d.rect.y
            }, {
                x: d.rect.x + d.rect.w, y: d.rect.y + d.rect.h
            }
        ]), ...(s.id === 'street' ? c.street.houses : [])
    ];
    if (points.some(p => p.x < 0 || p.x > 1920 || p.y < 128 || p.y > 951))
        out.push(finding('CHK-001-09', 'warning', s.file, '/walkArea', 'Scene geometry exceeds the x 0..1920, y 128..951 band'));
    return out;
}

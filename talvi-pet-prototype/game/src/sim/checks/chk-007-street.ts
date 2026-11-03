import type { Point } from '../../content/schema/common';
import type { Content } from '../../content/types';
import { pointInPolygon, pointInRect, segmentInPolygon, type Rect } from '../geometry';
import { finding, type Finding } from './types';

/** DEC-046: the greeting radius in room units; × tuning.roomUnitPx. Named constant until the run moves it to tuning.json
 * (WORK-036-1 may replace it by its tuning key; order fork (f)). */
export const GREETING_RADIUS_RU = 1.5;

type Labelled = { p: Point & { id?: string }; path: string };
type StreetPet = { petId: string; points: Labelled[] };

/** True when the open segment a→b passes through the interior of the rect (Liang–Barsky clip, midpoint test). */
export function segmentCrossesRect(a: Point, b: Point, r: Rect): boolean {
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    for (const [p, q] of [[-dx, a.x - r.x], [dx, r.x + r.w - a.x], [-dy, a.y - r.y], [dy, r.y + r.h - a.y]]) {
        if (p === 0) { if (q < 0) return false; continue; }
        const t = q / p;
        if (p < 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
        if (t0 > t1) return false;
    }
    const mid = { x: a.x + dx * (t0 + t1) / 2, y: a.y + dy * (t0 + t1) / 2 };
    return mid.x > r.x && mid.x < r.x + r.w && mid.y > r.y && mid.y < r.y + r.h;
}

/** Street pets (DEC-045): each house's room resident (its house wander points) and each site's resident (its site points). */
function streetPetsOf(c: Content): StreetPet[] {
    const houses = c.street.houses.flatMap((h, i) => {
        const roomId = h.door.target.scene === 'interior' ? h.door.target.roomId : null;
        const petId = roomId ? c.rooms[roomId]?.residentPetId : undefined;
        return petId ? [{ petId, points: (h.wanderPoints ?? []).map((p, j) => ({ p, path: `/houses/${i}/wanderPoints/${j}` })) }] : [];
    });
    const sites = (c.street.sites ?? []).map((s, i) =>
        ({ petId: s.residentPetId, points: s.wanderPoints.map((p, j) => ({ p, path: `/sites/${i}/wanderPoints/${j}` })) }));
    return [...houses, ...sites];
}

/** WORK-035-1 (DEC-045, gate Q1(a)): CHK-007-09..13 street presence geometry. Applies once the street authors presence
 * (any house wanderPoints or a meetingPoint); content without either (content-min) is not a presence street. */
export function checkStreetPresence(c: Content): Finding[] {
    const s = c.street, out: Finding[] = [];
    if (!s.meetingPoint && !s.houses.some(h => h.wanderPoints)) return out;
    const add = (n: string, path: string, msg: string, level: 'error' | 'warning' = 'error') =>
        out.push(finding(`CHK-007-${n}`, level, 'street.json', path, msg));
    const blockers = s.houses.flatMap(h => h.blockers), doors = s.houses.map(h => h.door.rect);
    const clear = (p: Point) => pointInPolygon(p, s.walkArea) && !blockers.some(b => pointInRect(p, b)) && !doors.some(d => pointInRect(p, d));
    const meet: Labelled | null = s.meetingPoint ? { p: s.meetingPoint, path: '/meetingPoint' } : null;
    const ids = new Set<string>();
    const unique = (id: string, path: string) => { if (ids.has(id)) add('09', path, `Street wander point id "${id}" is not unique`); ids.add(id); };
    (s.sites ?? []).forEach((site, i) => site.wanderPoints.forEach((p, j) => unique(p.id, `/sites/${i}/wanderPoints/${j}`)));
    s.houses.forEach((h, i) => {
        const roomId = h.door.target.scene === 'interior' ? h.door.target.roomId : null;
        if (roomId && c.rooms[roomId]?.residentPetId && h.wanderPoints?.length !== 2)
            add('09', `/houses/${i}/wanderPoints`, 'A house whose room has a resident needs exactly two street wander points');
        (h.wanderPoints ?? []).forEach((p, j) => {
            const path = `/houses/${i}/wanderPoints/${j}`;
            unique(p.id, path);
            if (!clear(p)) add('09', path, 'House wander point must be inside walkArea and outside every blocker and door rect');
        });
    });
    const pets = streetPetsOf(c);
    if (meet) {
        unique(meet.p.id!, meet.path);
        if (!clear(meet.p)) add('10', meet.path, 'meetingPoint must be inside walkArea and outside every blocker and door rect');
    } else if (pets.length >= 2) add('10', '/meetingPoint', 'A street with two or more street pets needs a meetingPoint');
    for (const pet of pets) {
        const ends = meet ? [...pet.points, meet] : pet.points;
        ends.forEach((a, i) => ends.slice(i + 1).forEach(b => {
            if (!segmentInPolygon(a.p, b.p, s.walkArea) || blockers.some(r => segmentCrossesRect(a.p, b.p, r)))
                add('11', a.path, `Segment to ${b.path} leaves walkArea or crosses a blocker`);
        }));
    }
    const radius = GREETING_RADIUS_RU * c.tuning.roomUnitPx;
    const reach = (pet: StreetPet) => meet ? [...pet.points, meet] : pet.points;
    pets.forEach((a, i) => pets.slice(i + 1).forEach(b => {
        const min = Math.min(Infinity, ...reach(a).flatMap(pa => reach(b).map(pb => Math.hypot(pa.p.x - pb.p.x, pa.p.y - pb.p.y))));
        if (!meet || min > radius)
            add('12', meet?.path ?? '/meetingPoint', `Street pets ${a.petId} and ${b.petId} share no meeting point within ${radius} px`);
    }));
    for (const { p, path } of [...s.houses.flatMap((h, i) => (h.wanderPoints ?? []).map((p, j) => ({ p, path: `/houses/${i}/wanderPoints/${j}` }))), ...(meet ? [meet] : [])])
        if (p.y > 951.5) add('13', path, 'Street wander point lies below the 1920x823 visible band (y 951.5)', 'warning');
    return out;
}

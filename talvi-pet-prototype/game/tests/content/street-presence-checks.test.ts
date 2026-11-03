import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Content } from '../../src/content/types';
import { registeredIds, runContentChecks } from '../../src/sim/checks';
import { GREETING_RADIUS_RU, segmentCrossesRect } from '../../src/sim/checks/chk-007-street';

/** WORK-035-1 VERIFY-WORK-035-1-08 / -10: CHK-007-09..13 street presence geometry on the shipped street, and B16. */
const IDS = ['CHK-007-09', 'CHK-007-10', 'CHK-007-11', 'CHK-007-12', 'CHK-007-13'];
const shipped = () => structuredClone(loadContent());
const fired = (c: Content) => [...new Set(runContentChecks(c).flatMap(f => f.ids).filter(id => IDS.includes(id)))].sort();

describe('VERIFY-WORK-035-1-08 CHK-007-09..13', () => {
  it('registeredIds lists CHK-007-09..13; GREETING_RADIUS_RU 1.5 (360 px at 240)', () => {
    for (const id of IDS) expect(registeredIds).toContain(id);
    expect(GREETING_RADIUS_RU * loadContent().tuning.roomUnitPx).toBe(360);
  });
  it('the shipped street passes every rule (no warning either)', () => {
    expect(fired(shipped())).toEqual([]);
  });
  it('meeting point removed -> CHK-007-10 and CHK-007-12', () => {
    const c = shipped(); delete c.street.meetingPoint;
    expect(fired(c)).toEqual(['CHK-007-10', 'CHK-007-12']);
  });
  it('a Pet House point moved into its blocker -> CHK-007-09 (its segments then cross the blocker too: CHK-007-11)', () => {
    const c = shipped(); c.street.houses[1].wanderPoints![1] = { id: 'pet-w2', x: 1500, y: 900 };
    expect(fired(c)).toEqual(['CHK-007-09', 'CHK-007-11']);
  });
  it('a segment through a blocker -> CHK-007-11 only', () => {
    const c = shipped(); c.street.houses[0].wanderPoints![0] = { id: 'starter-w1', x: 390, y: 800 };
    expect(fired(c)).toEqual(['CHK-007-11']);
  });
  it('a duplicate id -> CHK-007-09', () => {
    const c = shipped(); c.street.houses[1].wanderPoints![0] = { ...c.street.houses[1].wanderPoints![0], id: 'garden-w1' };
    expect(fired(c)).toEqual(['CHK-007-09']);
  });
  it('a pair farther than 1.5 ru with no meeting point names the pair (CHK-007-12)', () => {
    const c = shipped(); delete c.street.meetingPoint;
    const messages = runContentChecks(c).filter(f => f.ids.includes('CHK-007-12')).map(f => f.message);
    expect(messages.some(m => m.includes('owl-mate') && m.includes('owl '))).toBe(true);
  });
  it('the meeting point below the visible band -> CHK-007-13 warning', () => {
    const c = shipped(); c.street.meetingPoint = { id: 'street-meet', x: 780, y: 990 };
    const f = runContentChecks(c).filter(f => f.ids.includes('CHK-007-13'));
    expect(f.map(x => x.level)).toEqual(['warning']);
  });
  it('segmentCrossesRect: through, along an edge, and outside', () => {
    const r = { x: 0, y: 0, w: 10, h: 10 };
    expect(segmentCrossesRect({ x: -5, y: 5 }, { x: 15, y: 5 }, r)).toBe(true);
    expect(segmentCrossesRect({ x: -5, y: 10 }, { x: 15, y: 10 }, r)).toBe(false);
    expect(segmentCrossesRect({ x: -5, y: 20 }, { x: 15, y: 20 }, r)).toBe(false);
  });
});

describe('VERIFY-WORK-035-1-10 B16: the garden arrival path', () => {
  it('is at least 720 px (≥ 1.5 s at petSpeedRu × roomUnitPx), inside walkArea, visible at 1920x823, ending at petSpawn', () => {
    const c = loadContent();
    const [site] = c.street.sites;
    const path = site.arrivalPath;
    const length = path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p.x - path[i].x, p.y - path[i].y), 0);
    expect(length).toBeGreaterThanOrEqual(720);
    expect(Math.round(length)).toBe(816);
    expect(length / (c.tuning.petSpeedRu * c.tuning.roomUnitPx)).toBeGreaterThanOrEqual(1.5);
    for (const p of path) { expect(p.x).toBeGreaterThanOrEqual(80); expect(p.x).toBeLessThanOrEqual(1840); expect(p.y).toBeLessThanOrEqual(951.5); }
    expect(path.at(-1)).toEqual({ x: site.petSpawn.x, y: site.petSpawn.y });
  });
});

import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Content } from '../../src/content/types';
import { pointInRect, walkable } from '../../src/sim/geometry';
import type { GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { hold, streetReady, walkTo } from './street-walk';

const sets: [string, Content][] = [['real content', loadContent()], ['content-min', validContent()]];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]].map(([x, y]) => ({ x, y }));

describe.each(sets)('VERIFY-WORK-032-1-04 buildings are solid (%s)', (_name, content) => {
  const blockers = content.street.houses.flatMap(house => house.blockers);
  const assertWalkable = (s: GameState) => {
    if (s.scene.kind !== 'street') return; // a walk along the street lane may cross a door rect and go in
    expect(walkable(s.avatar, content.street.walkArea, blockers), `${s.avatar.x},${s.avatar.y}`).toBe(true);
  };

  it('every house has a blocker inside the walk area band, clear of its door rect', () => {
    for (const house of content.street.houses) {
      expect(house.blockers.length).toBeGreaterThan(0);
      const door = house.door.rect, centre = { x: door.x + door.w / 2, y: door.y + door.h / 2 };
      expect(walkable(centre, content.street.walkArea, blockers)).toBe(true);
      expect(house.blockers.every(b => b.y + b.h <= door.y)).toBe(true);
    }
  });

  const starts = [{ x: 200, y: 800 }, { x: 600, y: 790 }, { x: 1000, y: 800 }, { x: 1200, y: 860 }, { x: 1800, y: 800 },
    { x: 790, y: 900 }, { x: 1600, y: 980 }, { x: 300, y: 1000 }];
  it('steering from in front of, beside and between both houses toward each blocker centre for 5 s never ends a tick inside one', () => {
    for (const start of starts) for (const b of blockers) {
      walkTo(content, streetReady(content, start), { x: b.x + b.w / 2, y: b.y + b.h / 2 }, 5000, assertWalkable);
    }
  });

  it('holding each of the 4 directions and 4 diagonals for 5 s from every start never ends a tick inside a blocker', () => {
    for (const start of starts) for (const move of DIRS) hold(content, streetReady(content, start), move, 5000, assertWalkable);
  });

  it('R3 slide: pushing diagonally into a blocker side slides along its edge and keeps going', () => {
    const starter = content.street.houses[0].blockers[0];
    const from = { x: starter.x - 20, y: starter.y + 10 };
    let touched = false;
    const end = hold(content, streetReady(content, from), { x: 1, y: 0.5 }, 1500, s => {
      assertWalkable(s);
      if (s.avatar.y < starter.y + starter.h) expect(s.avatar.x).toBeLessThan(starter.x);
      else touched = true;
    }).state;
    expect(touched).toBe(true);
    expect(end.avatar.x).toBeGreaterThan(starter.x + starter.w / 2);
    expect(blockers.some(b => pointInRect(end.avatar, b))).toBe(false);
  });

  it('walking straight up into a house from below stops at its blocker base (avatar.y >= base)', () => {
    for (const house of content.street.houses) {
      const b = house.blockers[0], x = b.x + b.w / 2;
      const end = hold(content, streetReady(content, { x, y: 1000 }), { x: 0, y: -1 }, 2000, s => {
        assertWalkable(s); expect(s.avatar.y).toBeGreaterThanOrEqual(b.y + b.h);
      }).state;
      expect(end.avatar.y - (b.y + b.h)).toBeLessThan(12);
    }
  });
});

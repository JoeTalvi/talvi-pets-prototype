import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Content } from '../../src/content/types';
import { walkable } from '../../src/sim/geometry';
import { doorEnabled } from '../../src/sim/select';
import { validContent } from '../content/helpers';
import { tick } from './helpers';
import { reduce } from '../../src/sim/reduce';
import { hold, streetReady, walkTo } from './street-walk';

const sets: [string, Content][] = [['real content', loadContent()], ['content-min', validContent()]];

describe.each(sets)('VERIFY-WORK-032-1-06 doors entered from in front (%s)', (_name, content) => {
  const blockers = content.street.houses.flatMap(house => house.blockers);
  const [starter, pet] = content.street.houses;
  const below = (rect: { x: number; y: number; w: number; h: number }) => ({ x: rect.x + rect.w / 2, y: rect.y + rect.h + 15 });

  it('each door rect centre is walkable and its spawn is walkable and outside every door rect', () => {
    for (const house of content.street.houses) {
      const r = house.door.rect;
      expect(walkable({ x: r.x + r.w / 2, y: r.y + r.h / 2 }, content.street.walkArea, blockers)).toBe(true);
      expect(walkable(below(r), content.street.walkArea, blockers)).toBe(true);
      expect(walkable(house.door.spawn, content.street.walkArea, blockers)).toBe(true);
    }
  });

  it('Starter House: straight line from playerSpawn to below the door, then up: one scene.changed into dog-room', () => {
    const approach = walkTo(content, streetReady(content), below(starter.door.rect));
    expect(approach.events.filter(e => e.type === 'scene.changed')).toEqual([]);
    const entered = hold(content, approach.state, { x: 0, y: -1 }, 1000);
    expect(entered.events.filter(e => e.type === 'scene.changed')).toEqual([expect.objectContaining({ doorId: 'starter-front',
      to: { kind: 'interior', roomId: 'dog-room' } })]);
  });

  it('Pet House: gated until complete && arrivalDone (VERIFY-MEC-001-009 stands), then entered from in front', () => {
    const approach = walkTo(content, streetReady(content), below(pet.door.rect));
    expect(approach.events.filter(e => e.type === 'scene.changed')).toEqual([]);
    const pushed = hold(content, approach.state, { x: 0, y: -1 }, 1000);
    expect(pushed.events.filter(e => e.type === 'scene.changed')).toEqual([]);
    expect(pushed.state.scene).toEqual({ kind: 'street' });
    const state = structuredClone(pushed.state);
    Object.assign(state.projects['pet-house'], { complete: true, acknowledgedPhase: 5, currentCents: 1500 });
    expect(doorEnabled(content, state, pet.door)).toBe(false);
    state.projects['pet-house'].arrivalDone = true;
    const result = reduce(content, state, tick(0, -1, 16));
    expect(result.events.filter(e => e.type === 'scene.changed')).toEqual([expect.objectContaining({ doorId: 'pet-front',
      to: { kind: 'interior', roomId: 'owl-room' } })]);
  });
});

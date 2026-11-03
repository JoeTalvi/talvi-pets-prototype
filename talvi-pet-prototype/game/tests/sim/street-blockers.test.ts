import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { GameState } from '../../src/sim/state';
import { hold, streetReady, walkTo } from './street-walk';

/** WORK-035-1 VERIFY-WORK-035-1-09 (B1): the lawn behind both houses is blocked; the only way to a door is up into its rect. */
const content = loadContent();
const [starter, pet] = content.street.houses;

function bothOpen(at: { x: number; y: number }): GameState {
  const state = streetReady(content, at);
  const goal = content.projects.find(p => p.id === 'pet-house')!.goalCents;
  state.projects['pet-house'] = { currentCents: goal, acknowledgedPhase: 5, complete: true, arrivalDone: true };
  return state;
}

describe('VERIFY-WORK-035-1-09 B1 lawn blockers', () => {
  it('the blockers are the order rects; door rects and spawns unchanged', () => {
    expect(starter.blockers).toEqual([{ x: 400, y: 780, w: 558, h: 100 }]);
    expect(pet.blockers).toEqual([{ x: 1200, y: 780, w: 559, h: 160 }]);
    expect([starter.door.rect, starter.door.spawn]).toEqual([{ x: 425, y: 880, w: 100, h: 50 }, { x: 475, y: 950, facing: 'down' }]);
    expect([pet.door.rect, pet.door.spawn]).toEqual([{ x: 1440, y: 940, w: 100, h: 50 }, { x: 1490, y: 1000, facing: 'down' }]);
  });
  it('pushed up from (380, 960) toward (500, 820) the avatar never ends a street tick above y 880 for x in [400, 958)', () => {
    walkTo(content, bothOpen({ x: 380, y: 960 }), { x: 500, y: 820 }, 5000, s => {
      if (s.scene.kind === 'street' && s.avatar.x >= 400 && s.avatar.x < 958) expect(s.avatar.y).toBeGreaterThanOrEqual(880);
    });
    for (const x of [410, 700, 950]) hold(content, bothOpen({ x, y: 1000 }), { x: 0, y: -1 }, 3000, s => {
      if (s.scene.kind === 'street') expect(s.avatar.y).toBeGreaterThanOrEqual(880);
    });
  });
  it('from (1300, 1000) toward (1300, 820) never above y 940 for x in [1200, 1759)', () => {
    walkTo(content, bothOpen({ x: 1300, y: 1000 }), { x: 1300, y: 820 }, 5000, s => {
      if (s.avatar.x >= 1200 && s.avatar.x < 1759) expect(s.avatar.y).toBeGreaterThanOrEqual(940);
    });
    for (const x of [1210, 1600, 1750]) hold(content, bothOpen({ x, y: 1000 }), { x: 0, y: -1 }, 3000, s => {
      if (s.scene.kind === 'street') expect(s.avatar.y).toBeGreaterThanOrEqual(940);
    });
  });
  it.each([[starter, 'dog-room'], [pet, 'owl-room']] as const)('moving up from the %#th door spawn enters the door', (house, roomId) => {
    const { events } = hold(content, bothOpen(house.door.spawn), { x: 0, y: -1 }, 2000);
    expect(events.find(event => event.type === 'scene.changed')).toMatchObject({ to: { kind: 'interior', roomId } });
  });
});

import { expect, it } from 'vitest';
import type { Content } from '../../src/content/types';
import { pointInPolygon } from '../../src/sim/geometry';
import { reduce } from '../../src/sim/reduce';
import { starsOf } from '../../src/sim/select';
import { initialState, type GameState } from '../../src/sim/state';
import { nextAction } from './arbitrary';
import { deepFreeze, squareFixture } from './helpers';

function expectInvariants(content: Content, state: GameState): void {
  if (state.mode === 'design') expect(state.scene.kind).toBe('interior');
  const polygon = state.scene.kind === 'street' ? content.street.walkArea
    : content.rooms[state.scene.roomId].walkArea;
  expect(pointInPolygon(state.avatar, polygon)).toBe(true);
  expect(state.avatar.immunityMs).toBeGreaterThanOrEqual(0);
  for (const [roomId, room] of Object.entries(state.rooms)) {
    for (const [slotId, typeId] of Object.entries(room.placements)) {
      expect(state.inventory.ownedTypeIds).toContain(typeId);
      const slot = content.rooms[roomId].slots.find(candidate => candidate.id === slotId)!;
      expect(content.charms.types.find(type => type.id === typeId)!.sizeClass).toBe(slot.sizeClass);
    }
    const values = Object.values(room.placements);
    expect(starsOf(content, state, roomId)).toEqual({ points: values.length + new Set(values).size * 3, max: 4 * 12 });
  }
}

it.each([1, 2, 3])(
  'VERIFY-MEC-001-015 / VERIFY-CORE-004,005,006,008 partial: 500 valid tick/setDesignMode/placeCharm/removeCharm actions at seed %s (wants, pets, dialogue, celebration and debug families land in WORK-003-2..5)', seed => {
    const { content } = squareFixture(seed);
    let state = initialState(content, seed), replay = initialState(content, seed), cursor = seed;
    let sceneChanges = 0, modeChanges = 0, placements = 0;
    for (let index = 0; index < 500; index++) {
      const generated = nextAction(content, state, cursor); cursor = generated.seed;
      const first = reduce(content, deepFreeze(state), generated.action);
      const second = reduce(content, deepFreeze(replay), generated.action);
      expect(second).toEqual(first);
      expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state);
      expect(first.events.some(event => event.type === 'action.rejected')).toBe(false);
      expectInvariants(content, first.state);
      sceneChanges += first.events.filter(event => event.type === 'scene.changed').length;
      modeChanges += first.events.filter(event => event.type === 'mode.changed').length;
      placements += first.events.filter(event => event.type === 'charm.placed').length;
      state = first.state; replay = second.state;
    }
    expect(sceneChanges).toBeGreaterThan(2);
    expect(modeChanges).toBeGreaterThan(2);
    expect(placements).toBeGreaterThan(20);
  },
);

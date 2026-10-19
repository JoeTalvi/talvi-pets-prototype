import { expect, it } from 'vitest';
import { pointInPolygon } from '../../src/sim/geometry';
import { applySceneRules } from '../../src/sim/rules/scene';
import { initialState } from '../../src/sim/state';
import { nextSceneAction } from './arbitrary';
import { deepFreeze, squareFixture } from './helpers';

it.each([1, 2, 3])(
  'VERIFY-MEC-001-015 / VERIFY-CORE-006,008 partial: 500 valid scene actions at seed %s', seed => {
    const { content } = squareFixture(seed);
    let state = initialState(content, seed), replay = initialState(content, seed), cursor = seed;
    let sceneChanges = 0, modeChanges = 0;
    for (let index = 0; index < 500; index++) {
      const generated = nextSceneAction(content, state, cursor); cursor = generated.seed;
      const first = applySceneRules(content, deepFreeze(state), generated.action);
      const second = applySceneRules(content, deepFreeze(replay), generated.action);
      expect(second).toEqual(first);
      expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state);
      expect(first.events.some(event => event.type === 'action.rejected')).toBe(false);
      if (first.state.mode === 'design') expect(first.state.scene.kind).toBe('interior');
      const polygon = first.state.scene.kind === 'street' ? content.street.walkArea
        : content.rooms[first.state.scene.roomId].walkArea;
      expect(pointInPolygon(first.state.avatar, polygon)).toBe(true);
      expect(first.state.avatar.immunityMs).toBeGreaterThanOrEqual(0);
      sceneChanges += first.events.filter(event => event.type === 'scene.changed').length;
      modeChanges += first.events.filter(event => event.type === 'mode.changed').length;
      state = first.state; replay = second.state;
    }
    expect(sceneChanges).toBeGreaterThan(2);
    expect(modeChanges).toBeGreaterThan(2);
  },
);

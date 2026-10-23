import { expect, it } from 'vitest';
import type { Content } from '../../src/content/types';
import { pointInPolygon } from '../../src/sim/geometry';
import { reduce } from '../../src/sim/reduce';
import { starsOf } from '../../src/sim/select';
import { initialState, type GameState } from '../../src/sim/state';
import { nextAction } from './arbitrary';
import { deepFreeze, squareFixture } from './helpers';

/** VERIFY-CORE-003 (invariant 2, VERIFY-MEC-009-018) and VERIFY-CORE-010 (MEC-008 dialogue shape). */
function expectWantAndDialogueInvariants(content: Content, state: GameState): void {
  for (const [petId, pet] of Object.entries(state.pets)) {
    expect(pet.hearts).toBe(pet.fulfilledWantIds.length);
    expect(pet.fulfilledWantIds).toEqual(content.pets[petId].wants.slice(0, pet.fulfilledWantIds.length).map(want => want.id));
  }
  const { current, queue } = state.dialogue;
  if (current === null) expect(queue).toHaveLength(0);
  else expect(current.index >= 0 && current.index < current.lines.length).toBe(true);
}

function expectInvariants(content: Content, state: GameState): void {
  expectWantAndDialogueInvariants(content, state);
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
  'VERIFY-MEC-001-015 / VERIFY-CORE-003,004,005,006,008,010 / VERIFY-MEC-009-018 partial: 500 valid tick/setDesignMode/placeCharm/removeCharm/advanceDialogue actions at seed %s (pets, bubbles, celebration and debug families land in WORK-003-3..5)', seed => {
    const { content } = squareFixture(seed);
    let state = initialState(content, seed), replay = initialState(content, seed), cursor = seed;
    let sceneChanges = 0, modeChanges = 0, placements = 0, advances = 0;
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
      advances += generated.action.type === 'advanceDialogue' ? 1 : 0;
      state = first.state; replay = second.state;
    }
    expect(sceneChanges).toBeGreaterThan(2);
    expect(modeChanges).toBeGreaterThan(2);
    expect(placements).toBeGreaterThan(20);
    expect(advances).toBeGreaterThan(1);
  },
);

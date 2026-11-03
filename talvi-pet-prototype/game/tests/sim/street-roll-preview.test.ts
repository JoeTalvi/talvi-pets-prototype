import { expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import { reduce } from '../../src/sim/reduce';
import { initialState, type GameState, type RoomId } from '../../src/sim/state';
import { feedArgs, streetRollLines, streetRollRows } from '../../tools/feed-preview';

/** WORK-035-1 VERIFY-WORK-035-1-12: TOOL-004 --street-roll equals what reduce produces over the same arrivals. */
const content = loadContent();

function arrivals(seed: number, from: RoomId, visits: number): GameState[] {
  let state = initialState(content, seed);
  for (const petId of ['dog', 'owl'])
    state.pets[petId] = { ...state.pets[petId], hearts: 1, introduced: true, fulfilledWantIds: [content.pets[petId].wants[0].id] };
  state.session = { ...state.session, orientationShown: true, eventIntervalMs: null };
  for (const project of content.projects)
    state.projects[project.id] = { currentCents: project.goalCents, acknowledgedPhase: 5, complete: true, arrivalDone: true };
  const door = content.rooms[from].doors.find(candidate => candidate.target.scene === 'street')!;
  const out: GameState[] = [];
  for (let i = 0; i < visits; i++) {
    state = { ...state, scene: { kind: 'interior', roomId: from }, mode: 'play', dialogue: { current: null, queue: [] },
      avatar: { ...state.avatar, x: door.rect.x + door.rect.w / 2, y: door.rect.y + door.rect.h / 2, immunityMs: 0 } };
    state = reduce(content, state, { type: 'tick', dtMs: 16, move: { x: 0, y: 0 } }).state;
    out.push(state);
  }
  return out;
}

it('VERIFY-WORK-035-1-12 20 visits × (dog, owl) equal reduce (the pet whose room was not just left); byte-stable', () => {
  const rows = streetRollRows(content, 1234, 20);
  expect(rows).toHaveLength(20);
  expect(Object.keys(rows[0].outside)).toEqual(['dog', 'owl']);
  arrivals(1234, 'dog-room', 20).forEach((state, i) => {
    expect(state.streetVisits).toBe(i + 1);
    expect([state.pets.dog.outside, state.pets.owl.outside]).toEqual([false, rows[i].outside.owl]);
  });
  arrivals(1234, 'owl-room', 20).forEach((state, i) => expect([state.pets.dog.outside, state.pets.owl.outside]).toEqual([rows[i].outside.dog, false]));
  expect(streetRollLines(content, 1234, 20)).toEqual(streetRollLines(content, 1234, 20));
  expect(streetRollLines(content, 1234, 20)).toHaveLength(22);
  expect(feedArgs(['--seed', '1234', '--street-roll', '20']).streetRoll).toBe(20);
  expect(() => feedArgs(['--seed', '1', '--street-roll', '0'])).toThrow();
});

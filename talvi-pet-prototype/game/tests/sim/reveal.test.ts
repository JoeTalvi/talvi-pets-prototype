import { expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import { revealPopupView, revealProjectId, revealView } from '../../src/sim/select';
import { initialState } from '../../src/sim/state';
import { files, manifest, patchFiles, validContent } from '../content/helpers';
import { ack, act, deepFreeze, owing, run } from './helpers';

const leaks = ['descriptorImage', 'silhouetteImage', 'petName', 'Owl'];

it('VERIFY-MEC-003-001 cards follow acknowledgement, not currentCents: ack 1 at 1260 unlocks card 0 only, mystery, no petName key', () => {
  const content = validContent();
  const state = deepFreeze(owing(content, 1, 1260));
  const view = revealView(content, state, 'pet-house')!;
  expect(view.cards.map(card => card.unlocked)).toEqual([true, false, false, false, false]);
  expect(view.cards[0]).toEqual({ index: 0, phase: 1, unlocked: true, icon: 'clues/fixture', line: 'A green place to rest.' });
  expect(view.cards[1]).toEqual({ index: 1, phase: 2, unlocked: false });
  expect(view.image).toBe('mystery');
  expect('petName' in view).toBe(false);
});

it('VERIFY-MEC-003-002 fast-forward popup: null at milestone, then newCardIndices [1,2,3], completes false, cards 0–3 unlocked', () => {
  const content = validContent();
  const { results } = run(content, owing(content, 1, 1260), [ack, act('cutsceneFinished'), act('collectRewards')]);
  expect(revealPopupView(content, results[1].state)).toBeNull();
  const popup = revealPopupView(content, results[2].state)!;
  expect(popup).toMatchObject({ newCardIndices: [1, 2, 3], completes: false, image: 'mystery' });
  expect(popup.cards.map(card => card.unlocked)).toEqual([true, true, true, true, false]);
});

it('VERIFY-MEC-003-003 completion resolve: full image, Owl, both images, newCardIndices ends with 4; no incomplete state leaks', () => {
  const content = validContent();
  const { state, results } = run(content, owing(content, 0, 0), [{ type: 'debugSetCurrent', projectId: 'pet-house', cents: 700 },
    ack, act('cutsceneFinished'), act('collectRewards'), act('closeReveal'), { type: 'advanceDialogue' },
    { type: 'debugCompleteProject', projectId: 'pet-house' }, ack, act('cutsceneFinished'), act('collectRewards')]);
  const popup = revealPopupView(content, state)!;
  expect(popup).toMatchObject({ image: 'full', petName: 'Owl', silhouetteImage: 'clues/silhouette',
    descriptorImage: 'clues/descriptor', completes: true });
  expect(popup.newCardIndices.at(-1)).toBe(4);
  const incomplete = [owing(content, 0, 0), ...results.slice(0, -1).map(result => result.state)];
  for (const each of incomplete) {
    expect(each.projects['pet-house'].complete).toBe(false);
    const serialised = JSON.stringify([revealView(content, each, 'pet-house'), revealPopupView(content, each)]);
    for (const word of leaks) expect(serialised).not.toContain(word);
  }
});

it('VERIFY-MEC-003-006 reveal project: (a) starter only (variant) null; (b) rising pet-house; (c) complete pet-house with image full', () => {
  const variant = patchFiles(files(), [{ file: 'projects.json', path: '/projects/1', remove: true },
    { file: 'street.json', path: '/houses/1', remove: true }]);
  delete variant['rooms/owl-room.json']; delete variant['pets/owl.json'];
  const starterOnly = loadContent(manifest, variant);
  const alone = initialState(starterOnly, 1);
  expect(revealProjectId(starterOnly, alone)).toBeNull();
  expect(revealView(starterOnly, alone, 'starter-house')).toBeNull();
  const content = validContent();
  expect(revealProjectId(content, initialState(content, 1))).toBe('pet-house');
  const done = run(content, owing(content, 0, 0), [{ type: 'debugCompleteProject', projectId: 'pet-house' }, ack,
    act('cutsceneFinished'), act('collectRewards'), act('closeReveal')]).state;
  expect(revealProjectId(content, done)).toBe('pet-house');
  expect(revealView(content, done, 'pet-house')!.image).toBe('full');
});

it('VERIFY-MEC-003-007 skip chain popups: [1,2,3] completes false, then [4] completes true', () => {
  const content = validContent();
  const { results } = run(content, owing(content, 1, 1260), [ack, act('cutsceneFinished'), act('skipWait'),
    act('closeReveal'), act('cutsceneFinished'), act('collectRewards')]);
  expect(revealPopupView(content, results[2].state)).toMatchObject({ newCardIndices: [1, 2, 3], completes: false });
  expect(revealPopupView(content, results[5].state)).toMatchObject({ newCardIndices: [4], completes: true });
});

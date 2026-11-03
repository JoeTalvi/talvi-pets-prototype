// @vitest-environment jsdom
import './setup';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { destroyScene } from './sceneHarness';
import { click, designSetup, linesOf } from './designHarness';
import type { GameState } from '../../src/sim/state';
import { HEART_ARRIVED } from '../../src/view/celebration/heartMoment';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

type Setup = Awaited<ReturnType<typeof designSetup>>;
const panel = (s: Setup) => s.root.querySelector<HTMLElement>('.tpp-wantPanel')!;
const pills = (s: Setup) => [...panel(s).querySelectorAll<HTMLElement>('.tpp-tag')].map(p =>
  [p.textContent!.trim(), [...p.classList].filter(c => c !== 'tpp-tag').join(' ')]);
const textOf = (s: Setup, sel: string) => [...panel(s).querySelectorAll(sel)].map(e => e.textContent);
const withFulfilled = (ids: string[]) => ({ edit: (s: GameState) => { s.pets.dog.fulfilledWantIds = [...ids]; s.pets.dog.hearts = ids.length; } });
const drain = (s: Setup) => { for (let i = 0; i < 50 && s.state().dialogue.current !== null; i++) s.context.store.dispatch({ type: 'advanceDialogue' }); };

describe('MEC-009 panel states (VERIFY-MEC-009-021)', () => {
  it('MEC-009 panel states — partial: VERIFY-MEC-009-021 jsdom states: a (soft-nap) → d on want.fulfilled, held while the dialogue is open, then want 2 after the drain; ♥ updates', async () => {
    const s = await designSetup();
    expect(textOf(s, '.tpp-want-title')).toEqual(['WANT']);
    expect(textOf(s, '.tpp-want-brief')).toEqual(['soft nap']);
    expect(pills(s)).toEqual([['☐ Soft', ''], ['☐ Seat', '']]);
    expect(textOf(s, '.tpp-want-note')).toEqual([]);
    expect(textOf(s, '.tpp-want-reward')).toEqual(['Reward: Rug and Cushion']);
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'large-1', typeId: 'dog-bed' });
    expect(s.state().dialogue.current).not.toBeNull();
    expect(pills(s)).toEqual([['✓ Soft', 'done'], ['✓ Seat', 'done']]);
    expect(textOf(s, '.tpp-want-note')).toEqual(['Want fulfilled!']);
    expect(textOf(s, '.tpp-want-reward')).toEqual(['Reward: Rug and Cushion']);
    // WORK-038-1 Hearts-counter seam: the count holds n − 1 until the moment's heart arrives (tpp:heartArrived).
    expect(s.root.querySelector('.tpp-hearts')!.textContent).toBe('♥ 0');
    window.dispatchEvent(new Event(HEART_ARRIVED));
    expect(s.root.querySelector('.tpp-hearts')!.textContent).toBe('♥ 1');
    s.context.store.dispatch({ type: 'advanceDialogue' });
    if (s.state().dialogue.current !== null) expect(textOf(s, '.tpp-want-note')).toEqual(['Want fulfilled!']);
    drain(s);
    expect(s.state().dialogue.current).toBeNull();
    expect(textOf(s, '.tpp-want-brief')).toEqual(['bright corner']);
  });

  it('MEC-009 panel states — partial: jsdom state b (bright-corner): plant .unavailable with the nextPhase note, adjacent pill; light ticks after a lamp', async () => {
    const s = await designSetup(withFulfilled(['soft-nap']));
    expect(pills(s)).toEqual([['☐ Light', ''], ['☐ Plant', 'unavailable'], ['☐ Light + Plant beside each other', '']]);
    expect(textOf(s, '.tpp-want-note')).toEqual(['arrives with the next home phase']);
    expect(textOf(s, '.tpp-want-reward')).toEqual(['Reward: Sit on']);
    s.context.store.dispatch({ type: 'placeCharm', slotId: 'floor-1', typeId: 'lamp' });
    expect(pills(s)).toEqual([['✓ Light', 'done'], ['☐ Plant', 'unavailable'], ['☐ Light + Plant beside each other', '']]);
  });

  it('MEC-009 panel states — partial: jsdom state c (feels-like-home): "?" pill never names the hidden tag; .wide Stars floor kept while Stars are hidden (Q8(a))', async () => {
    const s = await designSetup(withFulfilled(['soft-nap', 'bright-corner']));
    expect(pills(s).map(p => p[0])).toEqual(['☐ Plant', '☐ ?', 'room ≥ 24 ★']);
    expect(panel(s).querySelector('.tpp-tag.wide')!.textContent).toBe('room ≥ 24 ★');
    expect(panel(s).textContent!.toLowerCase()).not.toContain('toy');
    s.context.store.dispatch({ type: 'debugSetStarsVisible', on: false });
    expect(panel(s).querySelector('.tpp-tag.wide')!.textContent).toBe('room ≥ 24 ★');
  });

  it('MEC-009 panel states — partial: jsdom exhausted (R14), .dim in design mode only, hidden on the street', async () => {
    const s = await designSetup(withFulfilled(['soft-nap', 'bright-corner', 'feels-like-home']));
    expect(textOf(s, '.tpp-want-brief')).toEqual(['No more wants for now.']);
    expect([pills(s), textOf(s, '.tpp-want-reward')]).toEqual([[], []]);
    expect(panel(s).classList.contains('dim')).toBe(true);
    s.context.store.dispatch({ type: 'setDesignMode', on: false });
    expect(panel(s).classList.contains('dim')).toBe(false);
    destroyScene(); document.body.replaceChildren();
    const street = await designSetup({ edit: st => { st.scene = { kind: 'street', x: 500, y: 600, facing: 'down' } as GameState['scene']; } });
    expect(panel(street).hidden).toBe(true);
  });
});

describe('core §3 ui.wantPanel', () => {
  it('core §3 ui.wantPanel — click toggles data-state expanded/normal and records {expanded} each time; brief, pills and reward in both', async () => {
    const s = await designSetup();
    click(panel(s));
    expect(panel(s).dataset.state).toBe('expanded');
    expect([textOf(s, '.tpp-want-brief'), pills(s).length, textOf(s, '.tpp-want-reward').length]).toEqual([['soft nap'], 2, 1]);
    click(panel(s));
    expect(panel(s).dataset.state).toBe('normal');
    expect([textOf(s, '.tpp-want-brief'), pills(s).length, textOf(s, '.tpp-want-reward').length]).toEqual([['soft nap'], 2, 1]);
    expect(linesOf(s.context, 'ui.wantPanel')).toEqual([{ type: 'ui.wantPanel', expanded: true }, { type: 'ui.wantPanel', expanded: false }]);
  });
});

describe('VERIFY-MEC-009-026 "n charms" reward labels (DEC-043)', () => {
  const real = (pet: string) => JSON.parse(readFileSync(`src/content/pets/${pet}.json`, 'utf8')) as
    { wants: { id: string; rewardLabel: string; reward: { kind: string; items?: { count: number }[] }[] }[] };

  it('VERIFY-MEC-009-026 (new) — the want panel reads "Reward: 2 charms: Rug and Cushion" from the Dog\'s real want 1 label', async () => {
    const s = await designSetup({ patches: [{ file: 'pets/dog.json', path: '/wants/0/rewardLabel', value: real('dog').wants[0].rewardLabel }] });
    expect(textOf(s, '.tpp-want-reward')).toEqual(['Reward: 2 charms: Rug and Cushion']);
  });

  it('VERIFY-MEC-009-026 (new) — every items reward in the real pets reads "<copies> charms: …" (Owl want 2 "2 charms: Potted Tree, Night Light"); no "charm types" remains', () => {
    for (const pet of ['dog', 'owl']) for (const want of real(pet).wants) {
      const copies = want.reward.flatMap(entry => entry.items ?? []).reduce((sum, item) => sum + item.count, 0);
      // WORK-034-2: a reward that also unlocks a site names the site and the charms instead of "<copies> charms: …".
      const unlocksSite = want.reward.some(entry => entry.kind === 'space');
      if (copies > 0 && !unlocksSite) expect(want.rewardLabel).toMatch(new RegExp(`^${copies} charms: `));
      expect(want.rewardLabel).not.toMatch(/charm types/);
      expect(want.rewardLabel.length).toBeLessThanOrEqual(40);
    }
    expect(real('owl').wants[1].rewardLabel).toBe('Garden + Potted Tree, Night Light');
  });
});

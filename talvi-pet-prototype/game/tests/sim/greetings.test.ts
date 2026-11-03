import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import type { Action } from '../../src/sim/actions';
import type { SimEvent } from '../../src/sim/events';
import { reduce } from '../../src/sim/reduce';
import { mulberry32 } from '../../src/sim/rng';
import { bandFor, drawEmote, pairKey } from '../../src/sim/rules/greetings';
import { evaluate } from '../../src/sim/rules/wants';
import type { GameState, PetId } from '../../src/sim/state';
import { parseSaveValue } from '../../src/sim/state.schema';

/** WORK-036-1 (DEC-046): the pet-to-pet greeting, sim half — VERIFY-WORK-036-1-03 … -08. */
const content = loadContent();
const tick = (dtMs = 100): Action => ({ type: 'tick', dtMs, move: { x: 0, y: 0 } });
const MATE_OWL = pairKey('owl-mate', 'owl'); // content pet order is dog, owl-mate, owl
const types = (events: SimEvent[]) => events.map(event => event.type);

function mateArrived(): GameState {
  const loaded = parseSaveValue(content, JSON.parse(readFileSync('tests/view/capture/mate-arrived.real.json', 'utf8')));
  if (!('state' in loaded)) throw new Error(`discarded: ${loaded.discarded}`);
  return loaded.state;
}

const apply = (state: GameState, action: Action) => reduce(content, state, action);
const drain = (state: GameState) => {
  while (state.dialogue.current) state = apply(state, { type: 'advanceDialogue' }).state;
  return state;
};

/** The mate-arrived save with Dog and Owl at 1 Heart and both outside (row 23 "All out"). */
function street(): GameState {
  const base = mateArrived();
  const pets = { ...base.pets };
  for (const petId of ['dog', 'owl'] as PetId[])
    pets[petId] = { ...pets[petId], introduced: true, hearts: 1, fulfilledWantIds: [content.pets[petId].wants[0].id] };
  return apply({ ...base, pets }, { type: 'debugSetPetsOutside', mode: 'all' }).state;
}

/** Stand pets idle (long timer, no target) at the given x on y 950; unlisted street pets go far right/left. */
function place(state: GameState, at: Partial<Record<PetId, number>>): GameState {
  const far: Record<PetId, number> = { dog: 1800, 'owl-mate': 100, owl: 1400 };
  const pets = { ...state.pets };
  for (const petId of ['dog', 'owl-mate', 'owl']) {
    const x = at[petId] ?? far[petId];
    pets[petId] = { ...pets[petId], behaviour: { ...pets[petId].behaviour, phase: 'idle', x, y: 950, timerMs: 600000,
      target: null, verb: null, reaction: null } };
  }
  return { ...state, pets };
}

/** The mate with wants 1–2 fulfilled (want 3 greet-the-owl active), dialogues drained. */
function mateWantsGreeting(): GameState {
  let state = street();
  for (let i = 0; i < 2; i++) state = drain(apply(state, { type: 'debugFulfilActiveWant', petId: 'owl-mate' }).state);
  return state;
}

describe('VERIFY-WORK-036-1-03 proximity trigger ≤ 1.5 ru, both face, meeting', () => {
  it('036-1-03 361 px: nothing; 360 px: both meeting facing each other, one greeting.played, two phaseChanged, no pet.reacted', () => {
    const apart = place(street(), { 'owl-mate': 600, owl: 961 });
    const none = apply(apart, tick());
    expect(types(none.events)).not.toContain('greeting.played');
    expect(none.state.pets.owl.behaviour.phase).toBe('idle');
    expect(none.state.greetings).toEqual({});
    const near = place(street(), { 'owl-mate': 600, owl: 960 });
    const met = apply(near, tick());
    const { owl, 'owl-mate': mate, dog } = met.state.pets;
    expect([mate.behaviour.phase, owl.behaviour.phase]).toEqual(['meeting', 'meeting']);
    expect([mate.behaviour.facing, owl.behaviour.facing]).toEqual(['right', 'left']);
    for (const pet of [mate, owl]) expect(pet.behaviour).toMatchObject({ timerMs: content.tuning.greetMeetingMs, target: null, verb: null, reaction: null });
    const played = met.events.filter(event => event.type === 'greeting.played');
    expect(played).toEqual([{ type: 'greeting.played', petA: 'owl-mate', petB: 'owl', emoteA: expect.any(String), emoteB: expect.any(String) }]);
    expect(met.events.filter(event => event.type === 'pet.phaseChanged' && event.to === 'meeting').map(event => (event as { petId: string }).petId))
      .toEqual(['owl-mate', 'owl']);
    expect(types(met.events)).not.toContain('pet.reacted');
    expect(dog.rngState).toBe(near.pets.dog.rngState);
    expect(owl.rngState).toBe(mulberry32(near.pets.owl.rngState).seed);
    expect(mate.rngState).toBe(mulberry32(near.pets['owl-mate'].rngState).seed);
  });
});

describe('VERIFY-WORK-036-1-04 60 s cooldown per pair, in state', () => {
  it('036-1-04 counts down from 60000, no second greeting before 0, greets at the first eligible tick; interiors count too; another pair greets meanwhile', () => {
    let state = apply(place(street(), { 'owl-mate': 600, owl: 700 }), tick()).state;
    expect(state.greetings[MATE_OWL].cooldownMs).toBe(60000);
    let ticks = 0, again = -1;
    while (again < 0 && ticks < 700) {
      state = place(state, { 'owl-mate': 600, owl: 700 }); // hold the pair idle within radius
      const result = apply(state, tick());
      ticks++;
      if (types(result.events).includes('greeting.played')) again = ticks;
      else expect(result.state.greetings[MATE_OWL].cooldownMs).toBe(60000 - ticks * 100);
      state = result.state;
    }
    expect(again).toBe(600); // the countdown runs first: the tick that reaches 0 (60 000 ms later) is the first eligible one
    const interior: GameState = { ...state, scene: { kind: 'interior', roomId: Object.keys(content.rooms)[0] } };
    expect(apply(interior, tick()).state.greetings[MATE_OWL].cooldownMs).toBe(59900);
    const dog = apply(place(state, { 'owl-mate': 600, owl: 700, dog: 300 }), tick());
    expect(dog.events.filter(event => event.type === 'greeting.played')).toMatchObject([{ petA: 'dog', petB: 'owl-mate' }]);
  });
});

describe('VERIFY-WORK-036-1-05 weighted paired emotes', () => {
  it('036-1-05 bands: 0.9 → ≥ 0.8, 0.6 → ≥ 0.55, 0.5 and 0 → ≥ 0', () => {
    const bands = content.tuning.greetEmoteWeights;
    expect([0.9, 0.6, 0.5, 0].map(c => bandFor(bands, c).minCompatibility)).toEqual([0.8, 0.55, 0, 0]);
  });
  it.each([0.9, 0.6, 0.5])('036-1-05 c = %s: 10 000 draws within ±2 points of the band weights; deterministic; one stream', c => {
    const { weights } = bandFor(content.tuning.greetEmoteWeights, c);
    const total = weights.friendly + weights.polite + weights.surprised;
    const sample = () => {
      let state = street();
      const counts: Record<string, number> = { friendly: 0, polite: 0, surprised: 0 };
      const emotes: string[] = [];
      for (let i = 0; i < 10000; i++) {
        const draw = drawEmote(content, state, 'owl', c);
        state = draw.state; counts[draw.emote]++; emotes.push(draw.emote);
      }
      return { counts, emotes, state };
    };
    const first = sample();
    expect(Object.keys(first.counts)).toEqual(['friendly', 'polite', 'surprised']);
    for (const emote of ['friendly', 'polite', 'surprised'] as const)
      expect(Math.abs(first.counts[emote] / 10000 - weights[emote] / total)).toBeLessThanOrEqual(0.02);
    expect(sample().emotes).toEqual(first.emotes);
    expect(first.state.pets.dog.rngState).toBe(street().pets.dog.rngState);
    expect(first.state.pets['owl-mate'].rngState).toBe(street().pets['owl-mate'].rngState);
  });
});

describe('VERIFY-WORK-036-1-06 the meeting ends, wandering resumes; one meeting per pet', () => {
  it('036-1-06 both idle with an idleMs roll after greetMeetingMs, then walking to a wander target', () => {
    let state = apply(place(street(), { 'owl-mate': 600, owl: 700 }), tick()).state;
    const ended: string[] = [], walked: string[] = [];
    for (let i = 0; i < 300; i++) {
      const result = apply(state, tick());
      for (const event of result.events) if (event.type === 'pet.phaseChanged' && event.petId !== 'dog') {
        if (event.from === 'meeting') { ended.push(`${event.petId}:${event.to}`); expect(event.to).toBe('idle'); }
        if (event.to === 'walking' && event.target && 'wanderPointId' in event.target) walked.push(event.petId);
      }
      state = result.state;
    }
    expect(ended.slice(0, 2).sort()).toEqual(['owl-mate:idle', 'owl:idle']); // later meetings (with the Dog) may follow
    expect([...new Set(walked)].sort()).toEqual(['owl', 'owl-mate']);
  });
  it('036-1-06 three pets within radius: only the first pair in content order meets; the third is not stuck', () => {
    const first = apply(place(street(), { dog: 600, 'owl-mate': 700, owl: 800 }), tick());
    expect(first.events.filter(event => event.type === 'greeting.played')).toMatchObject([{ petA: 'dog', petB: 'owl-mate' }]);
    expect(first.state.pets.owl.behaviour.phase).toBe('idle');
    let state = first.state;
    const owlPhases = new Set<string>();
    for (let i = 0; i < 300; i++) { state = apply(state, tick()).state; owlPhases.add(state.pets.owl.behaviour.phase); }
    expect([...owlPhases].some(phase => phase !== 'idle')).toBe(true);
  });
});

describe('VERIFY-WORK-036-1-07 greeted fulfilled in the same dispatch (gate Q9(a))', () => {
  it('036-1-07 Owl: greeting.played, want.progressed (met), want.fulfilled greet-the-owl hearts 3, heart.earned, wants.exhausted; vignette', () => {
    const result = apply(place(mateWantsGreeting(), { 'owl-mate': 600, owl: 700 }), tick());
    const wanted = ['greeting.played', 'want.progressed', 'want.fulfilled', 'heart.earned', 'wants.exhausted'];
    expect(types(result.events).filter(type => wanted.includes(type))).toEqual(wanted);
    expect(result.events.find(event => event.type === 'want.progressed')).toMatchObject({ petId: 'owl-mate', wantId: 'greet-the-owl',
      conditions: [{ kind: 'greeted', met: true, withPetId: 'owl' }] });
    const firstSlot = content.street.sites[0].slots[0].id;
    expect(result.events.find(event => event.type === 'want.fulfilled')).toMatchObject({ petId: 'owl-mate', wantId: 'greet-the-owl', hearts: 3, focusSlotId: firstSlot });
    expect(result.events.find(event => event.type === 'heart.earned')).toMatchObject({ petId: 'owl-mate', hearts: 3 });
    expect(result.state.pets['owl-mate'].hearts).toBe(3);
    expect(result.state.dialogue.current).toMatchObject({ source: 'vignette', wantId: 'greet-the-owl' });
  });
  it('036-1-07 Dog: greeting.played only', () => {
    const result = apply(place(mateWantsGreeting(), { 'owl-mate': 600, dog: 700 }), tick());
    expect(types(result.events).filter(type => type.startsWith('want') || type === 'greeting.played' || type === 'heart.earned'))
      .toEqual(['greeting.played']);
  });
  it('036-1-07 early: a greeting with the Owl while want 1 is active counts for nothing later', () => {
    const early = apply(place(street(), { 'owl-mate': 600, owl: 700 }), tick());
    expect(types(early.events)).toContain('greeting.played');
    expect(types(early.events)).not.toContain('want.fulfilled');
    let state = early.state;
    for (let i = 0; i < 2; i++) state = drain(apply(state, { type: 'debugFulfilActiveWant', petId: 'owl-mate' }).state);
    expect(evaluate(content, state, 'owl-mate')).toEqual([{ kind: 'greeted', met: false, hidden: false, withPetId: 'owl' }]);
    expect(state.pets['owl-mate'].hearts).toBe(2);
  });
});

describe('VERIFY-WORK-036-1-08 no meeting while input is frozen or off the street', () => {
  const near = () => place(street(), { 'owl-mate': 600, owl: 700 });
  const script = { source: 'vignette' as const, speaker: { petId: 'owl' }, lines: ['…'], index: 0 };
  const cases: [string, (state: GameState) => GameState, (state: GameState) => GameState][] = [
    ['dialogue open', state => ({ ...state, dialogue: { current: script, queue: [] } }), state => ({ ...state, dialogue: { current: null, queue: [] } })],
    ['design mode', state => ({ ...state, mode: 'design' }), state => ({ ...state, mode: 'play' })],
    ['site arrival', state => ({ ...state, siteArrival: { siteId: content.street.sites[0].id, petId: 'owl-mate' } }), state => ({ ...state, siteArrival: null })],
    ['interior', state => ({ ...state, scene: { kind: 'interior', roomId: Object.keys(content.rooms)[0] } }), state => ({ ...state, scene: { kind: 'street' } })],
  ];
  it.each(cases)('036-1-08 %s: no greeting.played, no cooldown; the first tick after it lifts greets', (_name, freeze, lift) => {
    const frozen = apply(freeze(near()), tick());
    expect(types(frozen.events)).not.toContain('greeting.played');
    expect(frozen.state.greetings).toEqual({});
    const lifted = apply(place(lift(frozen.state), { 'owl-mate': 600, owl: 700 }), tick());
    expect(types(lifted.events)).toContain('greeting.played');
  });
});

import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import { PetSchema } from '../../src/content/schema/pet';
import { TuningSchema } from '../../src/content/schema/tuning';
import type { Content } from '../../src/content/types';
import { registeredIds, runContentChecks } from '../../src/sim/checks';

/** WORK-036-1 VERIFY-WORK-036-1-01 / -02: the greeting compatibility and tuning table, and CHK-007-14..17. */
const IDS = ['CHK-007-14', 'CHK-007-15', 'CHK-007-16', 'CHK-007-17'];
const shipped = () => structuredClone(loadContent());
const errors = (c: Content) => runContentChecks(c).filter(f => f.level === 'error');
const fired = (c: Content) => [...new Set(errors(c).flatMap(f => f.ids))].sort();

describe('VERIFY-WORK-036-1-01 compatibility and tuning load (gate Q10(a))', () => {
  it('the gate placeholders load both ways: owl↔owl-mate 0.9, dog↔owl 0.6, dog↔owl-mate 0.5', () => {
    const { pets } = loadContent();
    expect(pets.owl.compatibility).toEqual({ dog: 0.6, 'owl-mate': 0.9 });
    expect(pets['owl-mate'].compatibility).toEqual({ dog: 0.5, owl: 0.9 });
    expect(pets.dog.compatibility).toEqual({ owl: 0.6, 'owl-mate': 0.5 });
  });
  it('the four tuning fields are present (1.5 ru, 60000 ms, 2000 ms, three bands ending at 0)', () => {
    const { tuning } = loadContent();
    expect([tuning.greetRadiusRu, tuning.greetCooldownMs, tuning.greetMeetingMs]).toEqual([1.5, 60000, 2000]);
    expect(tuning.greetEmoteWeights.map(band => band.minCompatibility)).toEqual([0.8, 0.55, 0]);
    expect(tuning.greetEmoteWeights[0].weights).toEqual({ friendly: 6, polite: 3, surprised: 1 });
  });
  it('an older tuning file without the fields parses with the same defaults', () => {
    const raw = { ...shipped().tuning } as Record<string, unknown>;
    for (const key of ['greetRadiusRu', 'greetCooldownMs', 'greetMeetingMs', 'greetEmoteWeights']) delete raw[key];
    const parsed = TuningSchema.parse(raw);
    expect([parsed.greetRadiusRu, parsed.greetCooldownMs, parsed.greetMeetingMs]).toEqual([1.5, 60000, 2000]);
    expect(parsed.greetEmoteWeights).toEqual(loadContent().tuning.greetEmoteWeights);
  });
  it('the shipped content raises none of CHK-007-14..17', () => {
    expect(fired(shipped()).filter(id => IDS.includes(id))).toEqual([]);
  });
});

describe('VERIFY-WORK-036-1-02 CHK-007-14..17 and lines.stripped', () => {
  it('registeredIds lists CHK-007-14..17 (104 ids at the int-MILESTONE-011 union)', () => {
    for (const id of IDS) expect(registeredIds).toContain(id);
    expect(new Set(registeredIds).size).toBe(104);
  });
  it('a missing pair reports CHK-007-15', () => {
    const c = shipped();
    delete c.pets.dog.compatibility!['owl-mate'];
    expect(fired(c)).toEqual(['CHK-007-15']);
  });
  it('a pet with no table at all, when others have one, reports CHK-007-15', () => {
    const c = shipped();
    delete c.pets.dog.compatibility;
    expect(fired(c)).toEqual(['CHK-007-15']);
  });
  it('an asymmetric pair reports CHK-007-16', () => {
    const c = shipped();
    c.pets.owl.compatibility!.dog = 0.7;
    expect(fired(c)).toEqual(['CHK-007-16']);
  });
  it('a self key and an unknown pet key each report CHK-007-14', () => {
    const self = shipped();
    self.pets.dog.compatibility!.dog = 1;
    expect(fired(self)).toEqual(['CHK-007-14']);
    const unknown = shipped();
    unknown.pets.dog.compatibility!.cat = 0.5;
    expect(fired(unknown)).toEqual(['CHK-007-14']);
  });
  it('a value 1.2 fails zod', () => {
    const pet = { ...shipped().pets.dog, compatibility: { owl: 1.2, 'owl-mate': 0.5 } };
    expect(PetSchema.safeParse(pet).success).toBe(false);
  });
  it('a band list without minCompatibility 0, an empty list, or a zero-sum band reports CHK-007-17', () => {
    const noZero = shipped();
    noZero.tuning.greetEmoteWeights = noZero.tuning.greetEmoteWeights.slice(0, 2);
    expect(fired(noZero)).toEqual(['CHK-007-17']);
    const empty = shipped();
    empty.tuning.greetEmoteWeights = [];
    expect(fired(empty)).toEqual(['CHK-007-17']);
    const zero = shipped();
    zero.tuning.greetEmoteWeights[2].weights = { friendly: 0, polite: 0, surprised: 0 };
    expect(fired(zero)).toEqual(['CHK-007-17']);
  });
  it('a pet with empty lines.stripped reports CHK-008-01 (the existing rule)', () => {
    const c = shipped();
    c.pets['owl-mate'].lines.stripped = [];
    expect(errors(c).filter(f => f.ids.includes('CHK-008-01')).map(f => f.path)).toEqual(['/lines/stripped']);
  });
});

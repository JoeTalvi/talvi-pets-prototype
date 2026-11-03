import { describe, it, expect } from 'vitest';
import { runContentChecks } from '../../src/sim/checks';
import type { Content } from '../../src/content/types';
import { realContent } from '../sim/helpers';

/** VERIFY-T2-SITE-002 (WORK-034-2): one broken-content case per site / mate CHK rule, on a clone of the real content. */
const SITE_IDS = ['CHK-001-15', 'CHK-005-09', 'CHK-005-10', 'CHK-009-18', 'CHK-009-19', 'CHK-009-20', 'CHK-009-21'];

function broken(edit: (c: Content) => void): Content {
  const c = structuredClone(realContent());
  edit(c);
  return c;
}
const garden = (c: Content) => c.street.sites.find(site => site.id === 'garden')!;
const findings = (c: Content, id: string) => runContentChecks(c).filter(f => f.ids.includes(id));
const level = (c: Content, id: string) => findings(c, id).map(f => f.level);

describe('site CHK rules (VERIFY-T2-SITE-002)', () => {
  it('real content raises no site or mate error', () => {
    const errors = runContentChecks(realContent()).filter(f => f.level === 'error');
    expect(errors).toEqual([]);
    expect(errors.filter(f => f.ids.some(id => SITE_IDS.includes(id)))).toEqual([]);
  });

  it('CHK-005-09: a wall slot in the site', () => {
    expect(level(broken(c => { garden(c).slots[0].sizeClass = 'wall'; }), 'CHK-005-09')).toContain('error');
  });

  it('CHK-005-09: 4 small + 2 large', () => {
    expect(level(broken(c => { garden(c).slots[0].sizeClass = 'large'; }), 'CHK-005-09')).toContain('error');
  });

  it('CHK-005-09: one-sided adjacency and a slot id shared with a room', () => {
    const c = broken(c => { const site = garden(c); site.slots[0].adjacent = [site.slots[3].id]; site.slots[3].adjacent = []; });
    expect(level(c, 'CHK-005-09')).toContain('error');
    const roomSlot = Object.values(realContent().rooms)[0].slots[0].id;
    expect(level(broken(c => { garden(c).slots[5].id = roomSlot; }), 'CHK-005-09')).toContain('error');
  });

  it('CHK-001-15: the pet spawn inside a house blocker', () => {
    const c = broken(c => { const b = c.street.houses[0].blockers[0]; garden(c).petSpawn = { x: b.x + 10, y: b.y + 10, facing: 'right' }; });
    expect(level(c, 'CHK-001-15')).toContain('error');
  });

  it('CHK-005-10: a slot over the Starter House door rect', () => {
    const c = broken(c => { const r = c.street.houses[0].door.rect; Object.assign(garden(c).slots[1], { x: r.x + 10, y: r.y + 10 }); });
    expect(level(c, 'CHK-005-10')).toContain('error');
  });

});

describe('mate CHK rules (VERIFY-T2-SITE-002)', () => {
  it('CHK-009-18: the site resident is missing / its home disagrees', () => {
    expect(level(broken(c => { garden(c).residentPetId = 'nobody'; }), 'CHK-009-18')).toContain('error');
    expect(level(broken(c => { delete c.pets['owl-mate'].home; }), 'CHK-009-18')).toContain('error');
  });

  it('CHK-009-19: two wants reward the same space', () => {
    const c = broken(c => { c.pets.dog.wants[0].reward.push({ kind: 'space', siteId: 'garden' }); });
    expect(level(c, 'CHK-009-19')).toContain('error');
  });

  it('CHK-009-20: 8 stars unreachable (arrivalAtStars above the max)', () => {
    expect(level(broken(c => { garden(c).arrivalAtStars = 40; }), 'CHK-009-20')).toContain('error');
  });

  it('CHK-009-20: arrivalAtStars within the max but not reachable from the owned copies', () => {
    const c = broken(c => { garden(c).slots.forEach(slot => { slot.sizeClass = 'large'; }); garden(c).arrivalAtStars = 24; });
    expect(level(c, 'CHK-009-20')).toContain('error');
  });

  it('CHK-009-17: an unsatisfiable mate want (a tag no owned site-fitting copy carries)', () => {
    const c = broken(c => { c.pets['owl-mate'].wants[0].conditions = [{ kind: 'tag', tag: 'art' }, { kind: 'tag', tag: 'tall' },
      { kind: 'adjacent', tagA: 'art', tagB: 'tall' }]; });
    const hits = findings(c, 'CHK-009-17').filter(f => f.file === 'pets/owl-mate.json');
    expect(hits.map(f => f.level)).toContain('error');
  });

  it('CHK-009-21: greeted outside the last want', () => {
    const c = broken(c => { const wants = c.pets['owl-mate'].wants; wants.unshift(wants.pop()!); });
    expect(level(c, 'CHK-009-21')).toContain('error');
  });

  it('CHK-001-16: a site element below y 951.5 is a warning only', () => {
    const c = broken(c => { garden(c).wanderPoints[1].y = 1000; });
    expect(level(c, 'CHK-001-16')).toContain('warning');
    expect(level(c, 'CHK-001-16')).not.toContain('error');
  });

  it('CHK-008-01: lines.stripped is iterated (an empty list is reported)', () => {
    expect(level(broken(c => { c.pets['owl-mate'].lines.stripped = []; }), 'CHK-008-01')).toContain('error');
  });
});

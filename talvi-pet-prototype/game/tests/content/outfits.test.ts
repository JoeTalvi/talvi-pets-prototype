import { describe, expect, it } from 'vitest';
import { loadContent } from '../../src/content/load';
import { OutfitsSchema } from '../../src/content/schema/outfits';
import { realContent } from '../sim/helpers';
import { files } from './helpers';

/** WORK-037-2 (DEC-047): outfits.json loads in content order; grant declarations ride on projects and sites. */
describe('outfits content (WORK-037-2)', () => {
  it('loads default, cosy and garden in content order with their sheets and name keys', () => {
    const c = realContent();
    expect(c.outfits.map(o => o.id)).toEqual(['default', 'cosy', 'garden']);
    expect(c.outfits.map(o => o.sheet)).toEqual(['player/avatar-sheet', 'player/avatar-cosy-sheet', 'player/avatar-garden-sheet']);
    for (const outfit of c.outfits) expect(c.strings[outfit.nameKey], outfit.nameKey).toBeTruthy();
  });

  it('declares the cosy set on the Pet House completion and the garden set on the garden arrival', () => {
    const c = realContent();
    expect(c.projects.find(p => p.id === 'pet-house')?.completionOutfitId).toBe('cosy');
    expect(c.projects.filter(p => p.completionOutfitId).map(p => p.id)).toEqual(['pet-house']);
    expect(c.street.sites.find(s => s.id === 'garden')?.arrivalOutfitId).toBe('garden');
  });

  it('an absent outfits.json loads as no outfits (pre-tier-2 bundles)', () => {
    const bundle = files();
    delete bundle['outfits.json'];
    expect(loadContent(undefined, bundle).outfits).toEqual([]);
  });

  it('the schema rejects an empty list and a missing sheet', () => {
    expect(OutfitsSchema.safeParse({ outfits: [] }).success).toBe(false);
    expect(OutfitsSchema.safeParse({ outfits: [{ id: 'default', nameKey: 'k' }] }).success).toBe(false);
  });
});

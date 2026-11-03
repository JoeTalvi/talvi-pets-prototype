import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runContentChecks } from '../../src/sim/checks';
import { AssetManifest } from '../../src/content/schema/assets';
import type { Content } from '../../src/content/types';
import { realContent } from '../sim/helpers';

/** WORK-037-2 (TOOL-001): one pass and one broken fixture per outfit CHK rule (CHK-010-01..06). */
const shipped = AssetManifest.parse(JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')));
const base = shipped.entries.find(entry => entry.id === 'player/avatar-sheet')!;
/** The shipped manifest plus the two outfit rows WORK-037-1 produces (same grid and clips as the base sheet). */
const withOutfitRows = (edit: (row: AssetManifest['entries'][number]) => void = () => {}): AssetManifest => ({
  ...shipped, entries: [...shipped.entries, ...['player/avatar-cosy-sheet', 'player/avatar-garden-sheet'].map(id => {
    const row = structuredClone({ ...base, id, url: `${id}.png` });
    if (id.endsWith('cosy-sheet')) edit(row);
    return row;
  })],
});
function broken(edit: (c: Content) => void): Content {
  const c = structuredClone(realContent());
  edit(c);
  return c;
}
const levels = (c: Content, id: string, m: AssetManifest = withOutfitRows()) =>
  runContentChecks(c, m).filter(f => f.ids.includes(id)).map(f => f.level);

describe('outfit CHK rules (WORK-037-2)', () => {
  it('shipped content passes every CHK-010 rule with the outfit rows present', () => {
    expect(runContentChecks(realContent(), withOutfitRows()).filter(f => f.ids.some(id => id.startsWith('CHK-010')))).toEqual([]);
  });

  it('shipped content with the shipped manifest: the two absent sheets are info only, no error', () => {
    const found = runContentChecks(realContent(), shipped).filter(f => f.ids.some(id => id.startsWith('CHK-010')));
    expect(found.map(f => [f.level, f.path])).toEqual([['info', '/outfits/1/sheet'], ['info', '/outfits/2/sheet']]);
  });

  it('CHK-010-01: a duplicate outfit id', () => {
    expect(levels(broken(c => { c.outfits[2].id = 'cosy'; }), 'CHK-010-01')).toEqual(['error']);
  });

  it('CHK-010-02: no default, two defaults, or a default on another sheet', () => {
    expect(levels(broken(c => { c.outfits[0].id = 'everyday'; }), 'CHK-010-02')).toEqual(['error']);
    expect(levels(broken(c => { c.outfits[1].id = 'default'; }), 'CHK-010-02')).toEqual(['error']);
    expect(levels(broken(c => { c.outfits[0].sheet = 'player/avatar-cosy-sheet'; }), 'CHK-010-02')).toEqual(['error']);
  });

  it('CHK-010-03: wrong frame, missing clip, or not a spritesheet', () => {
    const c = realContent();
    expect(levels(c, 'CHK-010-03', withOutfitRows(row => { row.frame = { w: 128, h: 128 }; }))).toEqual(['error']);
    expect(levels(c, 'CHK-010-03', withOutfitRows(row => { delete row.clips!['walk-up']; }))).toEqual(['error']);
    expect(levels(c, 'CHK-010-03', withOutfitRows(row => { row.type = 'image'; }))).toEqual(['error']);
  });

  it('CHK-010-04: a grant naming an unknown outfit or the default', () => {
    expect(levels(broken(c => { c.projects.find(p => p.id === 'pet-house')!.completionOutfitId = 'nope'; }), 'CHK-010-04')).toEqual(['error']);
    expect(levels(broken(c => { c.street.sites[0].arrivalOutfitId = 'default'; }), 'CHK-010-04')).toEqual(['error']);
  });

  it('CHK-010-05: an outfit granted by no beat or by two beats', () => {
    expect(levels(broken(c => { delete c.street.sites[0].arrivalOutfitId; }), 'CHK-010-05')).toEqual(['error']);
    expect(levels(broken(c => { c.projects.find(p => p.id === 'starter-house')!.completionOutfitId = 'cosy'; }), 'CHK-010-05')).toEqual(['error']);
  });

  it('CHK-010-06: a name key missing from strings.json', () => {
    expect(levels(broken(c => { delete c.strings['tpp.outfit.garden']; }), 'CHK-010-06')).toEqual(['error']);
  });

  it('no outfits.json: no CHK-010 finding', () => {
    expect(levels(broken(c => { c.outfits = []; }), 'CHK-010-02')).toEqual([]);
  });
});

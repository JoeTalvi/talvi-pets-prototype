import type { Content } from '../../content/types';
import type { AssetManifest } from '../../content/schema/assets';
import { finding, type Finding } from './types';

/** WORK-037-2 (DEC-047, TOOL-001): avatar outfits, CHK-010-01..06. Skipped when no outfits.json is present. */
export const DEFAULT_OUTFIT_ID = 'default';
export const BASE_AVATAR_SHEET = 'player/avatar-sheet';
const FILE = 'outfits.json';

export function check010(c: Content, m?: AssetManifest): Finding[] {
  const outfits = c.outfits ?? [];
  if (!outfits.length) return [];
  return [...uniqueIds(c), ...oneDefault(c), ...sheets(c, m), ...grantTargets(c), ...grantedOnce(c), ...nameKeys(c)];
}

/** CHK-010-01: outfit ids are unique. */
function uniqueIds(c: Content): Finding[] {
  const seen = new Set<string>();
  return c.outfits.flatMap((outfit, i) => {
    const dup = seen.has(outfit.id);
    seen.add(outfit.id);
    return dup ? [finding('CHK-010-01', 'error', FILE, `/outfits/${i}/id`, `Duplicate outfit id "${outfit.id}"`)] : [];
  });
}

/** CHK-010-02: exactly one `default` outfit, wearing the base avatar sheet. */
function oneDefault(c: Content): Finding[] {
  const defaults = c.outfits.filter(outfit => outfit.id === DEFAULT_OUTFIT_ID);
  return defaults.length === 1 && defaults[0].sheet === BASE_AVATAR_SHEET ? []
    : [finding('CHK-010-02', 'error', FILE, '/outfits', `Exactly one outfit "${DEFAULT_OUTFIT_ID}" with sheet "${BASE_AVATAR_SHEET}" is required`)];
}

/** CHK-010-03: each sheet is a manifest row, a 192×256 spritesheet with the base sheet's clip names (WORK-037-3: an absent row is an error since the WORK-037-1 rows merged). */
function sheets(c: Content, m?: AssetManifest): Finding[] {
  if (!m) return [];
  const base = m.entries.find(entry => entry.id === BASE_AVATAR_SHEET);
  const baseClips = Object.keys(base?.clips ?? {}).sort().join(',');
  return c.outfits.flatMap((outfit, i) => {
    const path = `/outfits/${i}/sheet`, entry = m.entries.find(candidate => candidate.id === outfit.sheet);
    if (!entry) return [finding('CHK-010-03', 'error', FILE, path, `Sheet "${outfit.sheet}" is not in the manifest`)];
    const clips = Object.keys(entry.clips ?? {}).sort().join(',');
    const ok = entry.type === 'spritesheet' && entry.frame?.w === 192 && entry.frame?.h === 256 && clips === baseClips;
    return ok ? [] : [finding('CHK-010-03', 'error', FILE, path,
      `Sheet "${outfit.sheet}" must be a 192x256 spritesheet with the clips of "${BASE_AVATAR_SHEET}" (${baseClips})`)];
  });
}

const grants = (c: Content) => [
  ...c.projects.flatMap((project, i) => project.completionOutfitId === undefined ? []
    : [{ outfitId: project.completionOutfitId, file: 'projects.json', path: `/projects/${i}/completionOutfitId` }]),
  ...(c.street.sites ?? []).flatMap((site, i) => site.arrivalOutfitId === undefined ? []
    : [{ outfitId: site.arrivalOutfitId, file: 'street.json', path: `/sites/${i}/arrivalOutfitId` }]),
];

/** CHK-010-04: a grant names a known, non-default outfit. */
function grantTargets(c: Content): Finding[] {
  const ids = new Set(c.outfits.map(outfit => outfit.id));
  return grants(c).flatMap(grant => ids.has(grant.outfitId) && grant.outfitId !== DEFAULT_OUTFIT_ID ? []
    : [finding('CHK-010-04', 'error', grant.file, grant.path, `Grant must name a known non-default outfit (got "${grant.outfitId}")`)]);
}

/** CHK-010-05: every non-default outfit is granted by exactly one beat (a completion or an arrival). */
function grantedOnce(c: Content): Finding[] {
  const all = grants(c);
  return c.outfits.flatMap((outfit, i) => {
    if (outfit.id === DEFAULT_OUTFIT_ID) return [];
    const count = all.filter(grant => grant.outfitId === outfit.id).length;
    return count === 1 ? [] : [finding('CHK-010-05', 'error', FILE, `/outfits/${i}`, `Outfit "${outfit.id}" must be granted by exactly one beat (found ${count})`)];
  });
}

/** CHK-010-06: every `nameKey` is in strings.json. */
function nameKeys(c: Content): Finding[] {
  return c.outfits.flatMap((outfit, i) => Object.hasOwn(c.strings, outfit.nameKey) ? []
    : [finding('CHK-010-06', 'error', FILE, `/outfits/${i}/nameKey`, `String key "${outfit.nameKey}" is missing from strings.json`)]);
}

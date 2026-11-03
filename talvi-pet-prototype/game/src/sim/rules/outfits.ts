import type { Content } from '../../content/types';
import type { Action } from '../actions';
import type { RuleResult, SimEvent } from '../events';
import type { GameState, OutfitId } from '../state';
import { inputFrozen } from '../select';

type ActionOf<T extends Action['type']> = Extract<Action, { type: T }>;

const reject = (state: GameState, action: ActionOf<'chooseOutfit' | 'debugSetOutfit'>, reason: string): RuleResult =>
  ({ state, events: [{ type: 'action.rejected', action, reason }] });
const known = (content: Content, outfitId: OutfitId) =>
  outfitId === 'default' || (content.outfits ?? []).some(outfit => outfit.id === outfitId);

/** CONTRACT-SELECT (WORK-037-2, Q16(a)): never stored. `default`, then each outfit granted by a complete project
 * (`completionOutfitId`) or an arrived site (`arrivalOutfitId`), in outfits.json order. */
export function unlockedOutfitIds(content: Content, state: GameState): OutfitId[] {
  const granted = new Set<OutfitId>(['default']);
  for (const project of content.projects)
    if (project.completionOutfitId && state.projects[project.id]?.complete) granted.add(project.completionOutfitId);
  for (const site of content.street.sites ?? [])
    if (site.arrivalOutfitId && state.spaces[site.id]?.arrivalDone) granted.add(site.arrivalOutfitId);
  const ordered = (content.outfits ?? []).map(outfit => outfit.id).filter(id => granted.has(id));
  return ordered.includes('default') ? ordered : ['default', ...ordered];
}

/** DEC-047: the completion beat's grant, emitted right after `project.completed`. */
export function completionOutfitEvents(content: Content, projectId: string): SimEvent[] {
  const outfitId = content.projects.find(project => project.id === projectId)?.completionOutfitId;
  return outfitId ? [{ type: 'outfit.unlocked', outfitId, source: 'completion', projectId }] : [];
}

/** DEC-047: the arrival beat's grant, emitted right after `pet.arrived`. */
export function arrivalOutfitEvents(content: Content, siteId: string): SimEvent[] {
  const outfitId = (content.street.sites ?? []).find(site => site.id === siteId)?.arrivalOutfitId;
  return outfitId ? [{ type: 'outfit.unlocked', outfitId, source: 'arrival', siteId }] : [];
}

const wear = (state: GameState, outfitId: OutfitId): GameState => ({ ...state, avatar: { ...state.avatar, outfitId } });

/** MEC-001 (WORK-037-2): wear an unlocked outfit; the worn one is a no-op; design mode does not block (fork 5). */
export function chooseOutfit(content: Content, state: GameState, action: ActionOf<'chooseOutfit'>): RuleResult {
  if (!known(content, action.outfitId)) return reject(state, action, 'unknownOutfit');
  if (inputFrozen(content, { ...state, mode: 'play' })) return reject(state, action, 'inputFrozen');
  if (!unlockedOutfitIds(content, state).includes(action.outfitId)) return reject(state, action, 'outfitLocked');
  const from = state.avatar.outfitId;
  if (from === action.outfitId) return { state, events: [] };
  return { state: wear(state, action.outfitId), events: [{ type: 'outfit.changed', from, to: action.outfitId }] };
}

/** MEC-010 row 25 "Outfits": wear any known outfit regardless of its lock. */
export function debugSetOutfit(content: Content, state: GameState, action: ActionOf<'debugSetOutfit'>): RuleResult {
  if (!known(content, action.outfitId)) return reject(state, action, 'unknownOutfit');
  const from = state.avatar.outfitId;
  const events: SimEvent[] = [{ type: 'debug.applied', action }];
  if (from !== action.outfitId) events.push({ type: 'outfit.changed', from, to: action.outfitId });
  return { state: wear(state, action.outfitId), events };
}

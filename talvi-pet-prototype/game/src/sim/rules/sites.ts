import type { Content } from '../../content/types';
import type { RuleResult } from '../events';
import type { GameState } from '../state';
import { siteRef } from '../space';
import { buildScript, enqueueScript } from './dialogue';
import { starsOfSpace } from './stars';
import { activateFirstWant } from './wants';

const chain = (result: RuleResult, next: RuleResult): RuleResult =>
  ({ state: next.state, events: [...result.events, ...next.events] });

/** DEC-044 + fork 3: on the street in play mode with nothing open, the first unlocked, not yet arrived site whose Stars
 * reach `arrivalAtStars` starts its resident's arrival. Called on leaving design mode and on entering the street. */
export function maybeStartSiteArrival(content: Content, state: GameState): RuleResult {
  if (state.scene.kind !== 'street' || state.mode !== 'play' || state.dialogue.current !== null ||
    state.celebration !== null || state.arrival !== null || state.siteArrival !== null) return { state, events: [] };
  const site = content.street.sites.find(candidate => {
    const space = state.spaces[candidate.id];
    return space.unlocked && !space.arrivalDone &&
      starsOfSpace(content, state, siteRef(candidate.id)).points >= candidate.arrivalAtStars;
  });
  if (!site) return { state, events: [] };
  const siteArrival = { siteId: site.id, petId: site.residentPetId };
  return { state: { ...state, siteArrival }, events: [{ type: 'space.arrivalStarted', ...siteArrival }] };
}

/** Core §6.3/§6.4 for a site: the resident stands at `petSpawn`, is introduced (intro script, then its first want). */
export function finishSiteArrival(content: Content, state: GameState): RuleResult {
  const { siteId, petId } = state.siteArrival!;
  const site = content.street.sites.find(candidate => candidate.id === siteId)!;
  const pet = state.pets[petId];
  const { x, y, facing } = site.petSpawn;
  const arrived: GameState = { ...state, siteArrival: null,
    spaces: { ...state.spaces, [siteId]: { ...state.spaces[siteId], arrivalDone: true } },
    pets: { ...state.pets, [petId]: { ...pet, introduced: true, outside: true,
      behaviour: { phase: 'idle', x, y, facing, timerMs: content.tuning.idleMs.min, target: null, verb: null, reaction: null } } } };
  let result: RuleResult = { state: arrived,
    events: [{ type: 'arrival.finished', petId }, { type: 'pet.arrived', petId, siteId }] };
  result = chain(result, enqueueScript(result.state, buildScript(content, 'intro', { petId })));
  return chain(result, activateFirstWant(content, result.state, petId));
}

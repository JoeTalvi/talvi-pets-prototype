import type { Content } from '../../content/types';
import type { Action } from '../actions';
import type { RuleResult, SimEvent } from '../events';
import type { DialogueScript, GameState, PetId, ProjectId, WantId } from '../state';

/** Sources the sim builds (`tutorial` is not built by any rule yet). */
export type ScriptSource = Extract<DialogueScript['source'],
  'orientation' | 'intro' | 'wantAnnounce' | 'vignette' | 'phaseMessage' | 'completionMessage'>;
type ScriptIds = { petId?: PetId; wantId?: WantId; projectId?: ProjectId; phase?: number };

/** MEC-008 §2.5 / MEC-002 §2.6: game-spoken project messages, copied from `projects.json`. */
function projectScript(content: Content, source: 'phaseMessage' | 'completionMessage',
  ids: ScriptIds): DialogueScript {
  const project = content.projects.find(candidate => candidate.id === ids.projectId);
  if (!project) throw new Error(`buildScript ${source} needs a known projectId`);
  const lines = source === 'phaseMessage'
    ? project.phaseMessages?.[(ids.phase ?? 0) - 1] : project.completionMessage;
  if (!lines || lines.length === 0) throw new Error(`buildScript ${source} has no lines for "${project.id}"`);
  return { source, speaker: { game: true }, lines: [...lines], index: 0, projectId: project.id };
}

/** MEC-008 §2.5: lines are copied from content at enqueue, so a saved script plays as saved. */
export function buildScript(content: Content, source: ScriptSource, ids: ScriptIds = {}): DialogueScript {
  if (source === 'orientation')
    return { source, speaker: { game: true }, lines: [...content.dialogue.orientation], index: 0 };
  if (source === 'phaseMessage' || source === 'completionMessage') return projectScript(content, source, ids);
  const pet = content.pets[ids.petId ?? ''];
  if (!pet) throw new Error(`buildScript ${source} needs a known petId`);
  const speaker = { petId: pet.id };
  if (source === 'intro') return { source, speaker, lines: [...pet.lines.intro], index: 0 };
  const wantId = ids.wantId ?? '';
  const lines = source === 'wantAnnounce' ? [pet.lines.wantAnnounce[wantId]] : pet.lines.vignettes[wantId];
  if (!lines || lines.some(line => line === undefined))
    throw new Error(`buildScript ${source} has no lines for want "${wantId}"`);
  return { source, speaker, lines: [...lines], index: 0, wantId };
}

/** MEC-008 §2.4: open when nothing is open, else append; never dropped or deduplicated. */
export function enqueueScript(state: GameState, script: DialogueScript): RuleResult {
  if (state.dialogue.current === null) {
    const current = { ...script, index: 0 };
    return { state: { ...state, dialogue: { current, queue: [] } },
      events: [{ type: 'dialogue.opened', script: current }] };
  }
  return { state: { ...state, dialogue: { ...state.dialogue, queue: [...state.dialogue.queue, script] } },
    events: [] };
}

/** MEC-008 §2.4 `advanceDialogue {}`: one line at a time, then the next queued script. */
export function advanceDialogue(_content: Content, state: GameState,
  action: Extract<Action, { type: 'advanceDialogue' }>): RuleResult {
  const current = state.dialogue.current;
  if (current === null) return { state, events: [{ type: 'action.rejected', action, reason: 'noDialogue' }] };
  if (current.index + 1 < current.lines.length) {
    const index = current.index + 1;
    return { state: { ...state, dialogue: { ...state.dialogue, current: { ...current, index } } },
      events: [{ type: 'dialogue.advanced', index }] };
  }
  const [next = null, ...queue] = state.dialogue.queue;
  const events: SimEvent[] = [{ type: 'dialogue.closed', source: current.source }];
  if (next !== null) events.push({ type: 'dialogue.opened', script: next });
  return { state: { ...state, dialogue: { current: next, queue } }, events };
}

export type ActivateFirstWant = (content: Content, state: GameState, petId: PetId) => RuleResult;

function append(result: RuleResult, next: RuleResult): RuleResult {
  return { state: next.state, events: [...result.events, ...next.events] };
}

/** Tick step 5, scripts half (core §4, §6.4): orientation once per save; on a `scene.changed`
 * into an un-introduced resident's room, the intro then `wants.activateFirstWant` (injected by
 * the reducer so dialogue.ts and wants.ts do not import each other). */
export function stepScripts(content: Content, state: GameState, eventsSoFar: readonly SimEvent[],
  activateFirstWant: ActivateFirstWant): RuleResult {
  let result: RuleResult = { state, events: [] };
  if (!state.session.orientationShown) {
    const shown = { ...state, session: { ...state.session, orientationShown: true } };
    result = enqueueScript(shown, buildScript(content, 'orientation'));
  }
  for (const event of eventsSoFar) {
    if (event.type !== 'scene.changed' || event.to.kind !== 'interior') continue;
    const petId = content.rooms[event.to.roomId]?.residentPetId;
    if (!petId || result.state.pets[petId].introduced) continue;
    const pets = { ...result.state.pets, [petId]: { ...result.state.pets[petId], introduced: true } };
    result = append(result, enqueueScript({ ...result.state, pets }, buildScript(content, 'intro', { petId })));
    result = append(result, activateFirstWant(content, result.state, petId));
  }
  return result;
}

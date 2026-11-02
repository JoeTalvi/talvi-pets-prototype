import type { RewardList } from '../content/schema/pet';
import type { Action } from './actions';
import type {
  CharmTypeId, DialogueScript, DoorId, GameState, PetBehaviour, PetId,
  ProjectId, Reaction, RoomId, Scene, SiteId, SlotId, TagId, VerbId, WantId,
} from './state';

export type ConditionView = {
  kind: 'tag' | 'adjacent' | 'stars' | 'greeted'; met: boolean; hidden: boolean;
  withPetId?: PetId; tag?: TagId; tagA?: TagId; tagB?: TagId; min?: number; current?: number;
  availability?: 'owned' | 'nextPhase' | 'laterPhase' | 'heart' | 'never';
};

/** Exact completed-change notifications, core.md §3; controller records excluded. */
export type SimEvent =
  | { type: 'scene.changed'; from: Scene; to: Scene; doorId: DoorId }
  | { type: 'mode.changed'; mode: 'play' | 'design' }
  // WORK-034-2: a placement event names exactly one of `roomId` (an interior) / `siteId` (a street site)
  | { type: 'charm.placed'; roomId?: RoomId; siteId?: SiteId; slotId: SlotId; typeId: CharmTypeId; replacedTypeId: CharmTypeId | null }
  | { type: 'charm.removed'; roomId?: RoomId; siteId?: SiteId; slotId: SlotId; typeId: CharmTypeId; interruptedPetId: PetId | null }
  | { type: 'charm.stripped'; roomId: RoomId; slotId: SlotId; typeId: CharmTypeId; petId: PetId }
  | { type: 'stars.changed'; roomId: RoomId; from: number; to: number; delta: number; max: number }
  | { type: 'space.stars.changed'; siteId: SiteId; from: number; to: number; delta: number; max: number }
  | { type: 'space.unlocked'; siteId: SiteId; petId: PetId; wantId: WantId | null }
  | { type: 'space.arrivalStarted'; siteId: SiteId; petId: PetId }
  | { type: 'pet.arrived'; petId: PetId; siteId: SiteId }
  | { type: 'stars.visibilityChanged'; visible: boolean }
  | { type: 'want.activated'; petId: PetId; wantId: WantId; index: number }
  | { type: 'want.progressed'; petId: PetId; wantId: WantId; conditions: ConditionView[] }
  | { type: 'want.hiddenRevealed'; petId: PetId; wantId: WantId; tag: TagId }
  | { type: 'want.fulfilled'; petId: PetId; wantId: WantId; hearts: number; reward: RewardList; focusSlotId: SlotId }
  | { type: 'heart.earned'; petId: PetId; hearts: number }
  | { type: 'wants.exhausted'; petId: PetId }
  | { type: 'items.granted'; typeId: CharmTypeId; count: number; source: 'phase' | 'heart' | 'debug' }
  | { type: 'verb.unlocked'; petId: PetId; verb: VerbId }
  | { type: 'roundup.fired'; projectId: ProjectId; merchantId: string; merchantName: string; amountCents: number; changeCents: number; currentCents: number }
  | { type: 'phase.reached'; projectId: ProjectId; phase: 1 | 2 | 3 | 4 | 5; currentCents: number }
  | { type: 'feed.stopped'; reason: 'noActiveProject' }
  | { type: 'celebration.started'; projectId: ProjectId; fromPhase: number; toPhase: number; completes: boolean; unlockedTypeIds: CharmTypeId[]; clueIndices: number[]; replay: boolean }
  | { type: 'celebration.stepped'; step: 'milestone' | 'reveal' }
  | { type: 'completeNow.shown'; projectId: ProjectId; priceCents: number }
  | { type: 'completeNow.taken'; projectId: ProjectId; priceCents: number }
  | { type: 'rewards.collected'; projectId: ProjectId; phases: number[]; typeIds: CharmTypeId[] }
  | { type: 'project.completed'; projectId: ProjectId }
  | { type: 'celebration.ended'; projectId: ProjectId }
  | { type: 'arrival.started'; projectId: ProjectId; petId: PetId; doorId: DoorId }
  | { type: 'arrival.finished'; petId: PetId }
  | { type: 'pet.reacted'; petId: PetId; reaction: Reaction; slotId: SlotId | null; typeId: CharmTypeId | null; line: string | null; walkOver: boolean }
  | { type: 'pet.phaseChanged'; petId: PetId; from: PetBehaviour['phase']; to: PetBehaviour['phase']; target: PetBehaviour['target']; verb: VerbId | null; reaction: Reaction | null }
  | { type: 'pet.verbStarted'; petId: PetId; verb: VerbId; slotId: SlotId }
  | { type: 'pet.verbEnded'; petId: PetId; verb: VerbId; slotId: SlotId }
  | { type: 'pet.wantBubble'; petId: PetId; tag: TagId | null }
  | { type: 'pet.tapped'; petId: PetId; bubble: { kind: 'want'; tag: TagId | null } | { kind: 'chatter'; line: string } }
  | { type: 'dialogue.opened'; script: DialogueScript }
  | { type: 'dialogue.advanced'; index: number }
  | { type: 'dialogue.closed'; source: DialogueScript['source'] }
  | { type: 'audio.muteChanged'; muted: boolean }
  | { type: 'debug.applied'; action: Action; adjusted?: { field: string; requested: number; applied: number } }
  | { type: 'state.reset' }
  | { type: 'action.rejected'; action: Action; reason: string };

export type RuleResult = { state: GameState; events: SimEvent[] };

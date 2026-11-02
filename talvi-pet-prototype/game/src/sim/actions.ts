import type { CharmTypeId, PetId, ProjectId, SiteId, SlotId } from './state';

/** Exact action vocabulary from core.md §2. Types do not imply implemented rules. */
export type Action =
  | { type: 'tick'; dtMs: number; move: { x: number; y: number } }
  | { type: 'setDesignMode'; on: boolean }
  | { type: 'placeCharm'; slotId: SlotId; typeId: CharmTypeId }
  | { type: 'removeCharm'; slotId: SlotId }
  | { type: 'acknowledgeProject'; projectId: ProjectId }
  | { type: 'cutsceneFinished' }
  | { type: 'collectRewards' }
  | { type: 'skipWait' }
  | { type: 'closeReveal' }
  | { type: 'arrivalFinished' }
  | { type: 'advanceDialogue' }
  | { type: 'tapPet'; petId: PetId }
  | { type: 'debugSimulatePurchase' }
  | { type: 'debugSetEventInterval'; ms: number | null }
  | { type: 'debugSetFeedPresentation'; mode: 'events' | 'trickle' }
  | { type: 'debugSetSeed'; seed: number }
  | { type: 'debugSetCurrent'; projectId: ProjectId; cents: number }
  | { type: 'debugJumpPhase'; projectId: ProjectId }
  | { type: 'debugCompleteProject'; projectId: ProjectId }
  | { type: 'debugUnlockAllTypes' }
  | { type: 'debugGrantCopies'; typeId: CharmTypeId; count: number }
  | { type: 'debugUnlockSpace'; siteId: SiteId }
  | { type: 'debugFillSpace'; siteId: SiteId }
  | { type: 'debugFulfilActiveWant'; petId: PetId }
  | { type: 'debugSetStarsVisible'; on: boolean }
  | { type: 'debugSetMuted'; on: boolean }
  | { type: 'debugSetTesterLabel'; text: string }
  | { type: 'reset'; seed?: number };

export type TickAction = Extract<Action, { type: 'tick' }>;
export type SceneAction = Extract<Action, { type: 'tick' | 'setDesignMode' }>;

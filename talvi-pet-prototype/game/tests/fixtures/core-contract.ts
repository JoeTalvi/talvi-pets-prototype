/**
 * Vendored contract fixture so the suite runs from the committed tree alone (WORK-017 F-03).
 * Manual transcription of core.md v1.4 §2 (actions), §3 (events), §5 (selectors).
 * Source: talvi-pet-prototype/phase-2-technical/systems/core.md (untracked in this repository),
 * SHA-256 7e4278cdcae4b55dd3e042ce99b55cc52116ccf2ce49bb4dde383a9767c406e9 when vendored (2026-10-20, TASK-077).
 * When the contract changes, re-transcribe these lists and update the version, path and hash together.
 */
export const SOURCE_DOC = '../phase-2-technical/systems/core.md';
export const SOURCE_SHA256 = '7e4278cdcae4b55dd3e042ce99b55cc52116ccf2ce49bb4dde383a9767c406e9';
export const CONTRACT_VERSION = '1.5' as const;
export const actionNames = [
  'tick', 'setDesignMode', 'placeCharm', 'removeCharm', 'acknowledgeProject',
  'cutsceneFinished', 'collectRewards', 'skipWait', 'closeReveal', 'arrivalFinished',
  'advanceDialogue', 'tapPet', 'debugSimulatePurchase', 'debugSetEventInterval',
  'debugSetFeedPresentation', 'debugSetSeed', 'debugSetCurrent', 'debugJumpPhase',
  'debugCompleteProject', 'debugUnlockAllTypes', 'debugGrantCopies', 'debugUnlockSpace', 'debugFillSpace', 'debugFulfilActiveWant', 'debugSetPetsOutside', 'debugGreetNow', 'debugSetStarsVisible', 'debugSetMuted',
  'debugSetTesterLabel', 'reset',
] as const;
export const eventNames = [
  'scene.changed', 'mode.changed', 'charm.placed', 'charm.removed', 'charm.stripped', 'stars.changed',
  'stars.visibilityChanged', 'want.activated', 'want.progressed', 'want.hiddenRevealed',
  'want.fulfilled', 'heart.earned', 'wants.exhausted', 'items.granted', 'verb.unlocked',
  'roundup.fired', 'phase.reached', 'feed.stopped', 'celebration.started', 'celebration.stepped',
  'completeNow.shown', 'completeNow.taken', 'rewards.collected', 'project.completed',
  'celebration.ended', 'arrival.started', 'arrival.finished', 'space.stars.changed', 'space.unlocked', 'space.arrivalStarted', 'pet.arrived', 'pet.outside', 'greeting.played', 'pet.reacted', 'pet.phaseChanged',
  'pet.verbStarted', 'pet.verbEnded', 'pet.wantBubble', 'pet.tapped', 'dialogue.opened',
  'dialogue.advanced', 'dialogue.closed', 'audio.muteChanged',
  'debug.applied', 'state.reset', 'action.rejected',
] as const;
export const selectorNames = [
  'inputFrozen', 'doorEnabled', 'residentPet', 'petUsingSlot', 'boundaryCents', 'phaseOf',
  'owedPhases', 'activeProjectId', 'hudProjectId', 'completeNowPriceCents', 'completeNowOffered',
  'ackFloorCents', 'attentionVisible', 'displayedPhase', 'typeUnlockPhase',
  'revealProjectId', 'revealView', 'revealPopupView', 'chooserTypes', 'copiesOf', 'ownsTag',
  'slotOf', 'placementAt', 'starsOf', 'activeWant', 'wantConditions', 'tagAvailability', 'missingWantTags',
  'starsOfSpace', 'scenePet', 'playerSpace', 'homeSpaceOf', 'streetPets',
] as const;

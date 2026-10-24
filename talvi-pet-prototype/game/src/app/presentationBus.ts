import type { Reaction } from '@sim/state';
import type { Log } from './log';

/** Presentation §3.4: view → controller UI intents (controller-owned; not CONTRACT-EVENTS members). */
export type PresentationEvent =
  | { type: 'slot.tapped'; slotId: string; filled: boolean }
  | { type: 'bubble.tapped'; petId: string; class: 'want' | 'chatter' | Reaction; text: string }
  | { type: 'house.tapped'; projectId: string };
export type PresentationEventType = PresentationEvent['type'];
type EventOfType<T extends PresentationEventType> = Extract<PresentationEvent, { type: T }>;
type Listener = (event: PresentationEvent) => void;

export type PresentationBus = {
  on<T extends PresentationEventType>(type: T, fn: (event: EventOfType<T>) => void): () => void;
  emit(event: PresentationEvent): void;
};

/** Core §3 `ui.*` records for a bus event; `house.tapped` is relayed only (its `input.tap` comes from the pointer path). */
function recordFor(record: Log['record'], event: PresentationEvent): void {
  if (event.type === 'slot.tapped') record(event.filled ? 'ui.sheetOpened' : 'ui.chooserOpened', { slotId: event.slotId });
  else if (event.type === 'bubble.tapped') record('ui.bubbleTapped', { petId: event.petId, class: event.class });
}

export function createPresentationBus(record: Log['record']): PresentationBus {
  const listeners = new Map<PresentationEventType, Set<Listener>>();
  return {
    on(type, fn) {
      const set = listeners.get(type) ?? new Set<Listener>();
      listeners.set(type, set);
      const listener = fn as Listener;
      set.add(listener);
      return () => { set.delete(listener); };
    },
    emit(event) {
      recordFor(record, event);
      for (const fn of [...(listeners.get(event.type) ?? [])]) fn(event);
    },
  };
}

import { describe, expect, it } from 'vitest';
import { createPresentationBus, type PresentationEvent } from '../../src/app/presentationBus';

function busWithRecords() {
  const records: { type: string; payload?: Record<string, unknown> }[] = [];
  const bus = createPresentationBus((type, payload) => records.push({ type, payload }));
  return { bus, records };
}

describe('presentation §3.4 bus', () => {
  it('presentation §3.4 bus slot.tapped on an empty slot reaches its listener and records ui.chooserOpened', () => {
    const { bus, records } = busWithRecords();
    const seen: PresentationEvent[] = [];
    bus.on('slot.tapped', event => seen.push(event));
    bus.emit({ type: 'slot.tapped', slotId: 'floor-1', filled: false });
    expect(seen).toEqual([{ type: 'slot.tapped', slotId: 'floor-1', filled: false }]);
    expect(records).toEqual([{ type: 'ui.chooserOpened', payload: { slotId: 'floor-1' } }]);
  });

  it('presentation §3.4 bus slot.tapped on a filled slot records ui.sheetOpened', () => {
    const { bus, records } = busWithRecords();
    bus.emit({ type: 'slot.tapped', slotId: 'floor-1', filled: true });
    expect(records).toEqual([{ type: 'ui.sheetOpened', payload: { slotId: 'floor-1' } }]);
  });

  it('presentation §3.4 bus bubble.tapped records ui.bubbleTapped {petId, class} without text', () => {
    const { bus, records } = busWithRecords();
    const seen: string[] = [];
    bus.on('bubble.tapped', event => seen.push(event.text));
    bus.emit({ type: 'bubble.tapped', petId: 'dog', class: 'want', text: 'A soft place to nap?' });
    expect(seen).toEqual(['A soft place to nap?']);
    expect(records).toEqual([{ type: 'ui.bubbleTapped', payload: { petId: 'dog', class: 'want' } }]);
  });

  it('presentation §3.4 bus relays house.tapped with no record', () => {
    const { bus, records } = busWithRecords();
    const seen: string[] = [];
    bus.on('house.tapped', event => seen.push(event.projectId));
    bus.emit({ type: 'house.tapped', projectId: 'pet-house' });
    expect(seen).toEqual(['pet-house']);
    expect(records).toEqual([]);
  });

  it('presentation §3.4 bus unsubscribed listener receives nothing and no listener does not throw', () => {
    const { bus } = busWithRecords();
    const seen: PresentationEvent[] = [];
    const off = bus.on('slot.tapped', event => seen.push(event));
    off();
    expect(() => bus.emit({ type: 'slot.tapped', slotId: 'floor-1', filled: false })).not.toThrow();
    expect(() => bus.emit({ type: 'house.tapped', projectId: 'pet-house' })).not.toThrow();
    expect(seen).toEqual([]);
  });
});

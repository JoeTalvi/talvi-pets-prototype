import type { Log } from '@app/log';
import { rotateCurtain } from './templates';
import { textFor } from '../text';

/** Presentation §2.2: the curtain covers the game on a touch device held in portrait. */
export function curtainShown(orientation: string, isTouch: boolean): boolean {
  return isTouch && orientation.startsWith('portrait');
}

export type RotateCurtain = { update(orientation: string, isTouch: boolean): void; readonly shown: boolean };

/** Mounts the hidden curtain; `update` toggles it and records `ui.rotateCurtain { shown }` on change only. */
export function createRotateCurtain(root: HTMLElement, record: Log['record'], strings?: Record<string, string>): RotateCurtain {
  const holder = document.createElement('div');
  holder.innerHTML = rotateCurtain({ state: 'hidden', text: textFor(strings) });
  const element = holder.firstElementChild as HTMLElement;
  root.append(element);
  let shown = false;
  return {
    update(orientation, isTouch) {
      const next = curtainShown(orientation, isTouch);
      if (next === shown) return;
      shown = next;
      element.hidden = !next;
      element.dataset.state = next ? 'normal' : 'hidden';
      record('ui.rotateCurtain', { shown: next });
    },
    get shown() { return shown; },
  };
}

import type Phaser from 'phaser';
import type { PetId, ProjectId } from '@sim/state';
import { Bubble, REACTION_EMOJI, textFrom } from '../objects/Bubble';
import type { ViewContext } from '../context';

export type Arrival = { projectId: ProjectId; petId: PetId };

/**
 * Order fork 5 stub of presentation §7.6: the 🎵 greeting at the house's door point (`arrivalPath.at(-1)`) for
 * `bubbleMs`, then `arrivalFinished` exactly once. No pet sprite and no walk: WORK-023 replaces this class with the
 * Owl's arrival walk. Not tappable (the street routes no `bubble:` target). Advanced by `StreetScene.syncScene`.
 */
export class ArrivalStub {
  readonly bubble: Bubble;
  finished = false;
  constructor(scene: Phaser.Scene, private readonly context: ViewContext, readonly arrival: Arrival) {
    const { content } = context;
    const house = content.street.houses.find(h => h.projectId === arrival.projectId);
    const door = house?.arrivalPath.at(-1);
    if (!door) throw new Error(`Arrival stub: project "${arrival.projectId}" has no street arrivalPath`);
    this.bubble = new Bubble(scene, arrival.petId, 0, textFrom(content.strings),
      { bubbleMs: content.tuning.bubbleMs, bubbleTextMs: content.tuning.bubbleTextMs }, () => {});
    this.bubble.follow(door);
    this.bubble.show({ kind: 'emoji', class: 'greeting', glyph: REACTION_EMOJI.greeting });
  }
  /** Runs the bubble's lifetime (its fade is inside `bubbleMs`); when it has cleared, dispatches `arrivalFinished` once. */
  update(dtMs: number): void {
    if (this.finished) return;
    this.bubble.update(dtMs);
    if (this.bubble.current() !== null) return;
    this.finish();
    this.context.store.dispatch({ type: 'arrivalFinished' });
  }
  /** `state.reset` / shutdown: removes the bubble and dispatches nothing. */
  cancel(): void { if (!this.finished) this.finish(); }
  private finish(): void { this.finished = true; this.bubble.destroy(); }
}

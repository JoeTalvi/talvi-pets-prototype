import type Phaser from 'phaser';
import { streetPets } from '@sim/select';
import type { GameState, PetId } from '@sim/state';
import type { SimEvent } from '@sim/events';
import type { ViewContext } from '../context';
import { PetSprite } from '../objects/PetSprite';
import { Bubble, textFrom } from '../objects/Bubble';
import { registerClips, type SheetEntry } from '../anims';

/** WORK-035-2 (DEC-045): one street pet's sprite and its bubble. */
export type StreetPet = { readonly sprite: PetSprite; readonly bubble: Bubble };
type PhaseChanged = Extract<SimEvent, { type: 'pet.phaseChanged' }>;

/** The pets the street draws: `streetPets` (content order), a site resident only once its arrival walk is over. */
export function drawnStreetPets(content: ViewContext['content'], state: GameState): PetId[] {
  return streetPets(content, state)
    .filter(entry => entry.ref.kind !== 'site' || state.siteArrival === null)
    .map(entry => entry.petId);
}

/** WORK-035-2: the street's pet layer, kept equal to `drawnStreetPets`. A pet leaving the set is destroyed in the same
 * dispatch and a pet entering it appears at its `behaviour` position, both without a fade (never drawn in two places). */
export class StreetPetLayer {
  readonly pets = new Map<PetId, StreetPet>();
  /** `context` is read lazily: the scene's context is set in `create`, after `init` builds the layer. */
  constructor(private scene: Phaser.Scene, private contextOf: () => ViewContext) {}
  private get context(): ViewContext { return this.contextOf(); }

  /** Rebuild the set from state: destroy leavers, create joiners. */
  sync(): void {
    const { content, store } = this.context;
    const state = store.getState();
    const wanted = new Set(drawnStreetPets(content, state));
    for (const [petId, pet] of [...this.pets]) {
      if (wanted.has(petId) && state.pets[petId]) continue;
      pet.sprite.destroy(); pet.bubble.destroy();
      this.pets.delete(petId);
    }
    for (const petId of wanted) if (!this.pets.has(petId) && state.pets[petId]) this.pets.set(petId, this.create(petId, state));
    // Keep the map in `streetPets` (content) order: `petAt` breaks depth ties by it.
    for (const petId of wanted) { const pet = this.pets.get(petId); if (pet) { this.pets.delete(petId); this.pets.set(petId, pet); } }
  }

  private create(petId: PetId, state: GameState): StreetPet {
    const { content, manifest, bus } = this.context;
    const entry = manifest.entries.find(e => e.id === content.pets[petId]?.sheet);
    if (entry && this.scene.textures.exists(entry.id)) registerClips(this.scene, entry as SheetEntry);
    const sprite = new PetSprite(this.scene, petId, content.verbs, entry, state.pets[petId].behaviour);
    const { bubbleMs, bubbleTextMs } = content.tuning;
    const index = Math.max(0, Object.keys(content.pets).indexOf(petId));
    const bubble = new Bubble(this.scene, petId, index, textFrom(content.strings), { bubbleMs, bubbleTextMs },
      tap => bus.emit({ type: 'bubble.tapped', petId, class: tap.class, text: tap.text }));
    bubble.follow(sprite.bubbleAnchor());
    return { sprite, bubble };
  }

  /** Every frame: each sprite follows its `behaviour` (depth = base y), each bubble its sprite. */
  update(deltaMs: number): void {
    const state = this.context.store.getState();
    for (const [petId, { sprite, bubble }] of this.pets) {
      const pet = state.pets[petId];
      if (pet) sprite.sync(pet.behaviour);
      bubble.follow(sprite.bubbleAnchor());
      bubble.update(deltaMs);
    }
  }

  bubbleOf(petId: string | undefined): Bubble | undefined {
    return petId === undefined ? undefined : this.pets.get(petId)?.bubble;
  }

  /** The frontmost bubble containing the point (highest depth). */
  bubbleAt(x: number, y: number): Bubble | undefined {
    return [...this.pets.values()].map(p => p.bubble).filter(b => b.contains(x, y)).sort((a, b) => b.depth - a.depth)[0];
  }

  /** The frontmost pet containing the point: highest depth (largest base y); a tie goes to the later pet in set order. */
  petAt(x: number, y: number): PetSprite | undefined {
    let best: PetSprite | undefined;
    for (const { sprite } of this.pets.values()) if (sprite.hitContains(x, y) && (!best || sprite.depth >= best.depth)) best = sprite;
    return best;
  }

  /** `pet.phaseChanged` routed to the matching sprite: its clip, and its bubble's pending text. */
  phaseChanged(event: PhaseChanged): void {
    const pet = this.pets.get(event.petId);
    if (!pet) return;
    pet.sprite.setClip(pet.sprite.clipFor({ phase: event.to, verb: event.verb, reaction: event.reaction }));
    if (event.to === 'reacting' || event.to === 'greeting') pet.bubble.releasePending();
    else if (event.to !== 'walking') pet.bubble.dropPending();
  }

  clear(): void {
    for (const { sprite, bubble } of this.pets.values()) { sprite.destroy(); bubble.destroy(); }
    this.pets.clear();
  }
}

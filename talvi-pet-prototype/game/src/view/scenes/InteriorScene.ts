import type { Room, Slot } from '@content/schema/room';
import { CharmSprite } from '../objects/CharmSprite';
import { PetSprite } from '../objects/PetSprite';
import { WorldScene } from './WorldScene';

const POP_MS = 180;
const REMOVE_FADE_MS = 120;

/** Presentation §4 Interior: room art, charms at slot positions, the avatar and the resident pet, all from content and state. */
export class InteriorScene extends WorldScene {
  roomId = '';
  room!: Room;
  charms = new Map<string, CharmSprite>();
  pet?: PetSprite;
  private paintingErrorRecorded = false;
  constructor() { super('Interior'); }
  init(data: { roomId?: string }): void {
    this.roomId = data.roomId ?? '';
    this.transitioning = false;
    this.charms = new Map();
    this.pet = undefined;
  }
  drawWorld(): void {
    const { content, store } = this.context;
    this.room = content.rooms[this.roomId];
    this.drawBackground();
    const placements = store.getState().rooms[this.roomId]?.placements ?? {};
    for (const [slotId, typeId] of Object.entries(placements)) this.placeCharm(slotId, typeId);
    this.createPet();
  }
  private drawBackground(): void {
    const key = this.room.background;
    if (this.textures.exists(key)) this.add.image(0, 0, key).setOrigin(0).setDepth(0);
    else this.add.image(0, 0, 'missing').setOrigin(0).setDisplaySize(1920, 1080).setDepth(0);
  }
  private createPet(): void {
    const { content, manifest, store } = this.context;
    const petId = this.room.residentPetId;
    const pet = store.getState().pets[petId];
    if (!pet) return;
    const entry = manifest.entries.find(e => e.id === content.pets[petId]?.sheet);
    this.pet = new PetSprite(this, petId, content.verbs, entry, pet.behaviour);
  }
  /** MEC-005 R13/R15: a charm at its slot position, origin (0.5, 1), depth = depthOverride ?? y. */
  placeCharm(slotId: string, typeId: string): CharmSprite | undefined {
    const slot = this.room.slots.find(s => s.id === slotId);
    const type = this.context.content.charms.types.find(t => t.id === typeId);
    if (!slot || !type) return undefined;
    this.charms.get(slotId)?.destroy();
    const sprite = this.charmSprite(slot, this.textures.exists(type.sprite) ? type.sprite : 'missing');
    sprite.setDepth(slot.depthOverride ?? slot.y);
    this.charms.set(slotId, sprite);
    return sprite;
  }
  private charmSprite(slot: Slot, key: string): CharmSprite {
    if (key !== 'charms/painting' || !slot.wall) return new CharmSprite(this, slot.x, slot.y, key);
    const sourceHash = this.context.manifest.entries.find(e => e.id === key)?.hash ?? '';
    try { return new CharmSprite(this, slot.x, slot.y, key, { side: slot.wall, sourceHash }); }
    catch (error) {
      if (!this.paintingErrorRecorded) {
        this.paintingErrorRecorded = true;
        this.context.log.record('app.error', { message: `painting projection: ${String(error)}`, stack: (error as Error)?.stack ?? '' });
      }
      return new CharmSprite(this, slot.x, slot.y, key);
    }
  }
  protected subscribeScene(): void {
    this.on('charm.placed', event => {
      if (event.roomId !== this.roomId) return;
      const sprite = this.placeCharm(event.slotId, event.typeId);
      if (sprite) this.tweens.add({ targets: sprite, scale: { from: 0.6, to: 1 }, duration: POP_MS, ease: 'Back.easeOut' });
    });
    this.on('charm.removed', event => {
      const sprite = event.roomId === this.roomId ? this.charms.get(event.slotId) : undefined;
      if (!sprite) return;
      this.charms.delete(event.slotId);
      this.tweens.add({ targets: sprite, alpha: 0, duration: REMOVE_FADE_MS, onComplete: () => sprite.destroy() });
    });
    this.on('pet.phaseChanged', event => {
      if (this.pet && event.petId === this.pet.petId) this.pet.setClip(this.pet.clipFor({ phase: event.to, verb: event.verb }));
    });
  }
  protected syncScene(): void {
    if (this.pet) this.pet.sync(this.context.store.getState().pets[this.pet.petId].behaviour);
  }
}

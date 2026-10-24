import type { Room, Slot } from '@content/schema/room';
import { placementAt } from '@sim/select';
import { recordPointer, type PointerSample } from '@app/input/pointerRouting';
import { CharmSprite } from '../objects/CharmSprite';
import { PetSprite } from '../objects/PetSprite';
import { Bubble, chatterBubble, reactionBubble, textFrom, verbBubble, wantBubble } from '../objects/Bubble';
import type { PetBehaviour } from '@sim/state';
import { SlotOutline } from '../objects/SlotOutline';
import { WorldScene } from './WorldScene';

const POP_MS = 180;
const REMOVE_FADE_MS = 120;

/** The pointer fields the routing reads (a Phaser pointer, or synthetic data in jsdom — GAP-5). */
export type ScenePointer = { id: number; worldX: number; worldY: number; downTime: number; upTime: number };

/** Presentation §4 Interior: room art, charms at slot positions, the avatar and the resident pet, all from content and state. */
export class InteriorScene extends WorldScene {
  roomId = '';
  room!: Room;
  charms = new Map<string, CharmSprite>();
  pet?: PetSprite;
  bubble?: Bubble;
  outlines = new Map<string, SlotOutline>();
  private downs = new Map<number, PointerSample>();
  private joystickPointer: number | null = null;
  private paintingErrorRecorded = false;
  protected readonly previewKind = 'interior';
  constructor() { super('Interior'); }
  init(data: { roomId?: string }): void {
    this.roomId = data.roomId ?? '';
    this.transitioning = false;
    this.charms = new Map();
    this.pet = undefined;
    this.bubble = undefined;
    this.outlines = new Map();
    this.downs = new Map();
    this.joystickPointer = null;
  }
  drawWorld(): void {
    const { content, store } = this.context;
    this.room = content.rooms[this.roomId];
    this.drawBackground();
    const placements = store.getState().rooms[this.roomId]?.placements ?? {};
    for (const [slotId, typeId] of Object.entries(placements)) this.placeCharm(slotId, typeId);
    this.createPet();
    this.createOutlines();
  }
  /** Presentation §6.2: one outline per slot, shown by `mode` (a reload in design mode shows them, MEC-001 R7). */
  private createOutlines(): void {
    const design = this.context.store.getState().mode === 'design';
    for (const slot of this.room.slots) {
      const outline = new SlotOutline(this, slot);
      outline.setShown(design);
      this.outlines.set(slot.id, outline);
    }
    this.syncOutlines();
  }
  /** Outline state from placements and the slot the chooser/sheet holds (`context.selectedSlotId`). */
  syncOutlines(): void {
    const placements = this.context.store.getState().rooms[this.roomId]?.placements ?? {};
    const selected = this.context.selectedSlotId ?? null;
    for (const [slotId, outline] of this.outlines) outline.setOutlineState(slotId === selected ? 'selected' : placements[slotId] ? 'filled' : 'empty');
  }
  private outlineAt(x: number, y: number): SlotOutline | undefined {
    let top: SlotOutline | undefined;
    for (const outline of this.outlines.values()) if (outline.contains(x, y) && (!top || outline.depth > top.depth)) top = outline;
    return top;
  }
  /** Presentation §3.1: a pointer the joystick captured is not classified. */
  pointerDown = (p: ScenePointer): void => {
    if (this.joystick.active && this.joystickPointer === null) { this.joystickPointer = p.id; return; }
    this.downs.set(p.id, { x: p.worldX, y: p.worldY, t: p.downTime });
  };
  /** TECH-004: record `input.tap`/`input.drag` with its target; only a tap on a visible outline opens a panel (MEC-005 R13/R14). */
  pointerUp = (p: ScenePointer): void => {
    if (p.id === this.joystickPointer) { this.joystickPointer = null; return; }
    const down = this.downs.get(p.id);
    if (!down) return;
    this.downs.delete(p.id);
    const up = { x: p.worldX, y: p.worldY, t: p.upTime };
    const outline = this.outlineAt(up.x, up.y);
    const onBubble = !outline && this.bubble?.contains(up.x, up.y) === true;
    const onPet = !outline && !onBubble && this.pet?.hitContains(up.x, up.y) === true;
    const petId = this.pet?.petId ?? '';
    const target = outline ? `slot:${outline.slotId}` : onBubble ? `bubble:${petId}` : onPet ? `pet:${petId}` : 'world';
    const result = recordPointer(this.context.log.record, target, down, up);
    if (result.kind !== 'tap') return;
    // Order fork 5: a bubble tap is tap-to-text only; a tap on the pet itself dispatches `tapPet` (mec-008 §2.3).
    if (onBubble) { this.bubble!.tap(); return; }
    if (onPet) { this.context.store.dispatch({ type: 'tapPet', petId }); return; }
    if (!outline) return;
    const { content, store, bus } = this.context;
    bus.emit({ type: 'slot.tapped', slotId: outline.slotId, filled: placementAt(content, store.getState(), this.roomId, outline.slotId) !== null });
  };
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
    this.applyDepthRule(pet.behaviour);
    const { bubbleMs, bubbleTextMs } = content.tuning;
    this.bubble = new Bubble(this, petId, 0, textFrom(content.strings), { bubbleMs, bubbleTextMs },
      tap => this.context.bus.emit({ type: 'bubble.tapped', petId, class: tap.class, text: tap.text }));
    this.bubble.follow(this.pet.bubbleAnchor());
  }
  /** Gate fork 1 / presentation §6.1 order fork 3: a pet `using` a `large` slot draws at slot depth + 1, else at its base y. */
  private applyDepthRule(behaviour: Pick<PetBehaviour, 'phase' | 'target'>): void {
    const target = behaviour.target && 'slotId' in behaviour.target ? behaviour.target.slotId : null;
    const slot = behaviour.phase === 'using' && target ? this.room.slots.find(s => s.id === target) : undefined;
    this.pet?.setDepthOverride(slot?.sizeClass === 'large' ? (slot.depthOverride ?? slot.y) + 1 : null);
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
  /** A charm image at the slot (wall paintings projected); the fill preview layer reuses it. */
  charmSprite(slot: Slot, key: string): CharmSprite {
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
    this.input.on('pointerdown', this.pointerDown); this.input.on('pointerup', this.pointerUp);
    this.unsubscribes.push(() => { this.input.off('pointerdown', this.pointerDown); this.input.off('pointerup', this.pointerUp); });
    this.on('mode.changed', event => {
      for (const outline of this.outlines.values()) outline.setShown(event.mode === 'design', true);
      this.syncOutlines();
    });
    this.subscribeCharms();
    this.on('pet.phaseChanged', event => {
      if (!this.pet || event.petId !== this.pet.petId) return;
      this.pet.setClip(this.pet.clipFor({ phase: event.to, verb: event.verb, reaction: event.reaction }));
      this.applyDepthRule({ phase: event.to, target: event.target });
      if (event.to === 'reacting' || event.to === 'greeting') this.bubble?.releasePending();
      else if (event.to !== 'walking') this.bubble?.dropPending();
    });
    this.subscribeBubbles();
  }
  /** mec-008 §2.1 / MEC-007 §3 consumers: every bubble fact comes from an event payload (the view computes no taste). */
  private subscribeBubbles(): void {
    const { content } = this.context;
    const text = textFrom(content.strings);
    const mine = (petId: string) => this.bubble && this.bubble.petId === petId ? this.bubble : undefined;
    const name = (petId: string) => content.pets[petId]?.name ?? petId;
    this.on('pet.reacted', event => {
      const bubble = mine(event.petId);
      const shown = reactionBubble(text, name(event.petId), event);
      // Q11(a): the ladder grade after a verb ends arrives as `pet.reacted {walkOver:false}` and shows at once.
      if (event.walkOver) bubble?.hold(shown); else bubble?.show(shown);
    });
    this.on('pet.verbStarted', event => {
      const shown = verbBubble(content, name(event.petId), event.verb);
      if (shown) mine(event.petId)?.show(shown);
    });
    this.on('pet.verbEnded', event => { mine(event.petId)?.clearClass('verb'); });
    // Q12(a): a want whose unmet tags are all hidden arrives as `tag: null` and shows ❓.
    this.on('pet.wantBubble', event => { mine(event.petId)?.show(wantBubble(content, text, name(event.petId), event.tag)); });
    this.on('pet.tapped', event => {
      const bubble = event.bubble.kind === 'want' ? wantBubble(content, text, name(event.petId), event.bubble.tag) : chatterBubble(event.bubble.line);
      mine(event.petId)?.show(bubble);
    });
  }
  private subscribeCharms(): void {
    this.on('charm.placed', event => {
      if (event.roomId !== this.roomId) return;
      this.syncOutlines();
      const sprite = this.placeCharm(event.slotId, event.typeId);
      if (sprite) this.tweens.add({ targets: sprite, scale: { from: 0.6, to: 1 }, duration: POP_MS, ease: 'Back.easeOut' });
    });
    this.on('charm.removed', event => {
      const sprite = event.roomId === this.roomId ? this.charms.get(event.slotId) : undefined;
      this.syncOutlines();
      if (!sprite) return;
      this.charms.delete(event.slotId);
      this.tweens.add({ targets: sprite, alpha: 0, duration: REMOVE_FADE_MS, onComplete: () => sprite.destroy() });
    });
  }
  protected syncScene(deltaMs: number): void {
    this.syncOutlines();
    if (!this.pet) return;
    this.pet.sync(this.context.store.getState().pets[this.pet.petId].behaviour);
    this.bubble?.follow(this.pet.bubbleAnchor());
    this.bubble?.update(deltaMs);
  }
}

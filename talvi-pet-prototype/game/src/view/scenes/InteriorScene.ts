import Phaser from 'phaser';
import type { Room, Slot } from '@content/schema/room';
import { placementAt } from '@sim/select';
import { recordPointer, type PointerSample } from '@app/input/pointerRouting';
import { CharmSprite } from '../objects/CharmSprite';
import { PetSprite } from '../objects/PetSprite';
import { Bubble, reactionBubble, textFrom } from '../objects/Bubble';
import type { PetBehaviour } from '@sim/state';
import type { SlotOutline } from '../objects/SlotOutline';
import { charmDepth, createOutlines, fadeCharm, outlineAt, popCharm, syncOutlineStates } from '../objects/slotLayer';
import { createEditorHook, type EditorHook } from '../editor';
import { WorldScene } from './WorldScene';
import { burstConfetti } from '../celebration/Confetti';
import { CONFETTI_LIFETIME, HEART_MOMENT, HEART_PET_DEPTH } from '../celebration/timings';
import { HEART_MOMENT_END } from '../celebration/heartMoment';
import { clipKey } from '../anims';

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
  /** WORK-015 room editor hook (row 15 / `E`). */
  editor: EditorHook | null = null;
  private downs = new Map<number, PointerSample>();
  private joystickPointer: number | null = null;
  private paintingErrorRecorded = false;
  /** WORK-032-2 fix 6b: the Heart moment's scene half (confetti, the pet's big `react`), ended by its timer or the overlay's end event. */
  heartPet: Phaser.GameObjects.Sprite | null = null;
  private heartTimers: ReturnType<typeof setTimeout>[] = [];
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
    this.editor = null;
    this.heartPet = null;
    this.heartTimers = [];
  }
  /** The room the preview layers draw: the editor's draft while it is open, else the content room. */
  shownRoom(): Room { return this.editor?.draft() ?? this.room; }
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
    this.outlines = createOutlines(this, this.room.slots, this.context.store.getState().mode === 'design');
    this.syncOutlines();
  }
  /** Outline state from placements and the slot the chooser/sheet holds (`context.selectedSlotId`). */
  syncOutlines(): void {
    syncOutlineStates(this.outlines, this.context.store.getState().rooms[this.roomId]?.placements ?? {}, this.context.selectedSlotId ?? null);
  }
  /** Presentation §3.1: a pointer the joystick captured is not classified. */
  pointerDown = (p: ScenePointer): void => {
    if (this.editor?.session()) return;
    if (this.joystick.active && this.joystickPointer === null) { this.joystickPointer = p.id; return; }
    this.downs.set(p.id, { x: p.worldX, y: p.worldY, t: p.downTime });
  };
  /** TECH-004: record `input.tap`/`input.drag` with its target; only a tap on a visible outline opens a panel (MEC-005 R13/R14). */
  pointerUp = (p: ScenePointer): void => {
    if (this.editor?.session()) { this.downs.delete(p.id); return; }
    if (p.id === this.joystickPointer) { this.joystickPointer = null; return; }
    const down = this.downs.get(p.id);
    if (!down) return;
    this.downs.delete(p.id);
    const up = { x: p.worldX, y: p.worldY, t: p.upTime };
    const outline = outlineAt(this.outlines, up.x, up.y);
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
    this.holdArrivalBubble(petId, pet.behaviour);
  }
  /**
   * The greeting's `pet.reacted {walkOver:true}` is published during the street fade, before this scene exists (and a reload
   * mid-walk-over has none): a `walking` behaviour that carries a `reaction` holds that bubble, with the `line` of the matching
   * `pet.reacted` controller record when the log still has it.
   */
  private holdArrivalBubble(petId: string, behaviour: PetBehaviour): void {
    if (behaviour.phase !== 'walking' || !behaviour.reaction || !this.bubble) return;
    const record = this.context.log.lines().filter(l => l.type === 'pet.reacted' && l.petId === petId).at(-1);
    const line = record && record.reaction === behaviour.reaction && typeof record.line === 'string' ? record.line : null;
    const slotId = behaviour.target && 'slotId' in behaviour.target ? behaviour.target.slotId : null;
    const name = this.context.content.pets[petId]?.name ?? petId;
    this.bubble.hold(reactionBubble(textFrom(this.context.content.strings), name,
      { type: 'pet.reacted', petId, reaction: behaviour.reaction, slotId, typeId: null, line, walkOver: true }));
  }
  /** Gate fork 1 / presentation §6.1 order fork 3: a pet `using` a `large` slot draws at slot depth + 1, else at its base y.
   * A used charm with a `seat` (cushion, rug, stool) also lifts the pet onto it at the slot centre, above the charm. */
  private applyDepthRule(behaviour: Pick<PetBehaviour, 'phase' | 'target'>): void {
    const target = behaviour.target && 'slotId' in behaviour.target ? behaviour.target.slotId : null;
    const slot = behaviour.phase === 'using' && target ? this.room.slots.find(s => s.id === target) : undefined;
    const typeId = slot ? this.context.store.getState().rooms[this.roomId]?.placements[slot.id] : undefined;
    const seat = this.context.content.charms.types.find(t => t.id === typeId)?.seat;
    const above = slot && (seat || slot.sizeClass === 'large') ? (slot.depthOverride ?? slot.y) + 1 : null;
    this.pet?.setDepthOverride(above);
    this.pet?.setSeat(slot && seat ? { x: slot.x, y: slot.y - seat.y } : null);
  }
  /** MEC-005 R13/R15: a charm at its slot position, origin (0.5, 1), depth = depthOverride ?? y. */
  placeCharm(slotId: string, typeId: string): CharmSprite | undefined {
    const slot = this.room.slots.find(s => s.id === slotId);
    const type = this.context.content.charms.types.find(t => t.id === typeId);
    if (!slot || !type) return undefined;
    this.charms.get(slotId)?.destroy();
    const sprite = this.charmSprite(slot, this.textures.exists(type.sprite) ? type.sprite : 'missing');
    sprite.setDepth(charmDepth(slot, type));
    this.charms.set(slotId, sprite);
    return sprite;
  }
  /** A charm image at the slot (wall paintings projected; other wall art is drawn for its type's `wallArtFacing` wall, default
   * left, and mirrored on the other wall; a floor-standing charm sits on the slot's floor line); the fill preview layer reuses it. */
  charmSprite(slot: Slot, key: string): CharmSprite {
    const type = this.context.content.charms.types.find(t => t.sprite === key);
    const standing = slot.floorY !== undefined && type?.standsOnFloor === true;
    const flip = slot.wall !== undefined && slot.wall !== (type?.wallArtFacing ?? 'left');
    if (key !== 'charms/painting' || !slot.wall) return new CharmSprite(this, slot.x, standing ? slot.floorY! : slot.y, key).setFlipX(flip);
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
    this.subscribePetBubbles();
    this.on('heart.earned', event => this.heartMoment(event.petId));
    const onMomentEnd = () => this.endHeartPet();
    window.addEventListener(HEART_MOMENT_END, onMomentEnd);
    this.unsubscribes.push(() => { window.removeEventListener(HEART_MOMENT_END, onMomentEnd); this.endHeartPet(); for (const t of this.heartTimers.splice(0)) clearTimeout(t); });
    this.editor = createEditorHook(this);
    this.unsubscribes.push(() => { this.editor?.destroy(); });
  }
  /**
   * WORK-032-2 fix 6b, the scene half of the Heart moment (the dim, the heart and the input capture are the overlay's): the existing
   * confetti bursts up from mid-screen and the pet's `react` clip plays large in the overlay's spotlight, camera-fixed above the
   * world, while the room's own pet keeps following the simulation (its walk-over is untouched).
   */
  private heartMoment(petId: string): void {
    this.endHeartPet();
    const { width, height } = this.scale.gameSize, top = this.cameras.main.scrollY;
    const emitter = burstConfetti(this, new Phaser.Geom.Rectangle(width / 2 - 360, top + height / 2 - 80, 720, 160));
    this.heartTimers.push(setTimeout(() => emitter.destroy(), CONFETTI_LIFETIME));
    const sheet = `pets/${petId}-sheet`, react = clipKey(sheet, 'react');
    if (!react || !this.anims.exists(react) || !this.textures.exists(sheet)) return;
    this.heartPet = this.add.sprite(width / 2, height * HEART_MOMENT.petBaseY, sheet).setOrigin(0.5, 1).setScale(HEART_MOMENT.petScale)
      .setScrollFactor(0).setDepth(HEART_PET_DEPTH).play(react);
    this.tweens.add({ targets: this.heartPet, alpha: { from: 0, to: 1 }, duration: 160 });
    this.heartTimers.push(setTimeout(() => this.endHeartPet(), HEART_MOMENT.totalMs));
  }
  private endHeartPet(): void {
    this.heartPet?.destroy();
    this.heartPet = null;
  }
  /** The scene's pet bubble (the shared bubble subscriptions in `WorldScene` route through it). */
  protected petBubble(): Bubble | undefined { return this.bubble; }
  private subscribeCharms(): void {
    this.on('charm.placed', event => {
      if (event.roomId !== this.roomId) return;
      this.syncOutlines();
      const sprite = this.placeCharm(event.slotId, event.typeId);
      if (sprite) popCharm(this, sprite);
    });
    this.on('charm.removed', event => {
      const sprite = event.roomId === this.roomId ? this.charms.get(event.slotId) : undefined;
      this.syncOutlines();
      if (!sprite) return;
      this.charms.delete(event.slotId);
      fadeCharm(this, sprite);
    });
  }
  protected syncScene(deltaMs: number): void {
    this.editor?.sync();
    this.syncOutlines();
    if (!this.pet) return;
    this.pet.sync(this.context.store.getState().pets[this.pet.petId].behaviour);
    this.bubble?.follow(this.pet.bubbleAnchor());
    this.bubble?.update(deltaMs);
  }
}

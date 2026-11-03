import Phaser from 'phaser';
import { attentionVisible, displayedPhase, scenePet } from '@sim/select';
import type { ProjectId, SiteId } from '@sim/state';
import type { Site } from '@content/schema/street';
import { sitesOf } from '@sim/space';
import { recordPointer, type PointerSample } from '@app/input/pointerRouting';
import { AttentionIcon, HouseSprite } from '../objects/HouseSprite';
import { CelebrationDirector, directorClock } from '../celebration/CelebrationDirector';
import { ArrivalWalk, type Arrival, type SiteArrival } from '../celebration/ArrivalWalk';
import { CharmSprite } from '../objects/CharmSprite';
import { PetSprite } from '../objects/PetSprite';
import { Bubble, textFrom } from '../objects/Bubble';
import type { SlotOutline } from '../objects/SlotOutline';
import { charmDepth, createOutlines, fadeCharm, outlineAt, popCharm, syncOutlineStates } from '../objects/slotLayer';
import { registerClips, type SheetEntry } from '../anims';
import { depthAtBase } from '../depth';
import { MISSING_TEXTURE } from './BootScene';
import type { ScenePointer } from './InteriorScene';
import { WorldScene } from './WorldScene';
import { burstConfetti } from '../celebration/Confetti';
import { CONFETTI_LIFETIME, GARDEN } from '../celebration/timings';

export type { ScenePointer };

/** ASSET-009 tile size: the rect a tile covers when its texture is missing. */
export const TILE_SIZE = { w: 320, h: 213 } as const;
export const GROUND_DEPTH = -1;
/** WORK-034-3: a site's ground art sits just above the ground tiles and below every other world object. */
export const SITE_ART_DEPTH = GROUND_DEPTH + 0.5;
/** DEC-049 §4 (WORK-038-3): window event `{ slotId, x, y }` (overlay px) fired on `charm.placed {siteId}`; `hudStreet` starts the site Stars burst there. */
export const SITE_SLOT_AT = 'tpp:siteSlotAt';
/** DEC-049 §7: mirrors `toast.SPACE_TOAST_SHOWN` (the view does not import ui panels). */
const SPACE_TOAST_SHOWN = 'tpp:spaceToastShown';
/** Spec §7 beat text (order fork (d)): the site pulse scale, 3 yoyo pulses, the confetti tints (green and gold). */
export const BEACON = { scale: 1.06, pulses: 3, tints: [0x6f7f3f, 0xd9a441] } as const;
/** Fork (b): sites whose garden toast showed while no street was active (view-local module memory: never replayed after a reload). */
const unseenBeacons = new Set<SiteId>();
/** The running StreetScene, if any; the toast's window event reaches it here (one listener for the page's lifetime). */
let liveStreet: StreetScene | null = null;
let beaconListener = false;
function listenForBeacons(): void {
  if (beaconListener || typeof window === 'undefined') return;
  beaconListener = true;
  window.addEventListener(SPACE_TOAST_SHOWN, e => {
    const siteId = (e as CustomEvent<{ siteId: SiteId }>).detail.siteId;
    const street = liveStreet;
    if (street && !(street.game as { pendingDestroy?: boolean }).pendingDestroy && street.sys.isActive() && street.context.store.getState().scene.kind === 'street' && !street.transitioning) street.beacon(siteId);
    else unseenBeacons.add(siteId);
  });
}
type Rect = { x: number; y: number; w: number; h: number };

/** Presentation §4.2 street column (plus `celebration.stepped`, when `displayedPhase` moves to `toPhase`). */
const REFRESH_ON = ['phase.reached', 'completeNow.shown', 'completeNow.taken', 'celebration.started', 'celebration.stepped',
  'celebration.ended', 'rewards.collected', 'arrival.started', 'arrival.finished', 'debug.applied'] as const;

/** Presentation §5.3: the axis-aligned union of the given rects. */
export function unionRect(rects: readonly Rect[]): Rect {
  if (rects.length === 0) throw new Error('street.groundTiles is empty: no camera bounds');
  const x = Math.min(...rects.map(r => r.x)), y = Math.min(...rects.map(r => r.y));
  return { x, y, w: Math.max(...rects.map(r => r.x + r.w)) - x, h: Math.max(...rects.map(r => r.y + r.h)) - y };
}

/** Presentation §4 Street: ground tiles, props and houses from `street.json`, house textures and attention icons from state. */
export class StreetScene extends WorldScene {
  protected readonly previewKind = 'street';
  houses = new Map<ProjectId, HouseSprite>();
  icons = new Map<ProjectId, AttentionIcon>();
  tiles: Phaser.GameObjects.Image[] = [];
  /** Presentation §7: built per scene start; owns the celebrating house's texture while it holds a cue (order fork 6). */
  director: CelebrationDirector | null = null;
  /** Presentation §7.6: the arrival walk while `state.arrival` runs (WORK-023-2). */
  arrival: ArrivalWalk | null = null;
  /** WORK-034-3 (DEC-044): each site's ground art, in its locked (`art.empty`) or unlocked (`art.base`) state. */
  siteArt = new Map<SiteId, Phaser.GameObjects.Image>();
  /** Outlines at the sites' slots only (gate fork 11), shown in design mode for an unlocked site. */
  outlines = new Map<string, SlotOutline>();
  /** Charms placed at site slots, keyed by slot id. */
  charms = new Map<string, CharmSprite>();
  /** The arrived site resident (the Owl's mate) and its bubble (DEC-044/045); absent before its arrival. */
  pet?: PetSprite;
  bubble?: Bubble;
  /** DEC-049 §7: the garden beacon's "New" bubble, kept until the next `scene.changed` (this scene's shutdown). */
  beaconBubble?: Bubble;
  private downs = new Map<number, PointerSample>();
  private joystickPointer: number | null = null;
  constructor() { super('Street'); }
  init(): void {
    this.transitioning = false;
    this.houses = new Map();
    this.icons = new Map();
    this.tiles = [];
    this.downs = new Map();
    this.joystickPointer = null;
    this.director = null;
    this.arrival = null;
    this.siteArt = new Map();
    this.outlines = new Map();
    this.charms = new Map();
    this.pet = undefined;
    this.bubble = undefined;
    this.beaconBubble = undefined;
  }
  /** WORK-038-1 Heart scene seam: the site charm sprite at a slot. */
  override charmAt(slotId: string): CharmSprite | undefined { return this.charms.get(slotId); }
  /** Presentation §4: "if `state.celebration` → `CelebrationDirector.replay(state.celebration)`" after the shared frame is built. */
  create(): void {
    super.create();
    const state = this.context.store.getState();
    this.director!.resume(state);
    // Presentation §7.6: a reload with `arrival ≠ null` replays the arrival.
    if (state.arrival) this.startArrival(state.arrival);
    else if (state.siteArrival) this.startArrival(state.siteArrival);
    liveStreet = this;
    const release = () => { if (liveStreet === this) liveStreet = null; };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, release); this.events.once(Phaser.Scenes.Events.DESTROY, release);
    for (const siteId of [...unseenBeacons]) { unseenBeacons.delete(siteId); this.beacon(siteId); }
  }
  /**
   * DEC-049 §7 world beacon (WORK-038-3): the site art (and any shown outline) pulses 1 → 1.06 `GARDEN.pulseMs` yoyo × 3,
   * `GARDEN.confetti` 16 green and gold confetti burst over the site, and a "New" bubble stays until the next `scene.changed`.
   */
  beacon(siteId: SiteId): void {
    const site = sitesOf(this.context.content).find(s => s.id === siteId);
    const art = this.siteArt.get(siteId);
    if (!site || !art) return;
    const targets = [art, ...site.slots.map(slot => this.outlines.get(slot.id)).filter((o): o is SlotOutline => o !== undefined && o.visible)];
    this.tweens.add({ targets, scale: BEACON.scale, duration: GARDEN.pulseMs / 2, yoyo: true, repeat: BEACON.pulses - 1, onComplete: () => { for (const t of targets) t.setScale(1); } });
    const b = art.getBounds();
    const confetti = burstConfetti(this, b, { count: GARDEN.confetti, tints: BEACON.tints });
    this.time.delayedCall(CONFETTI_LIFETIME, () => confetti.destroy());
    this.beaconBubble?.destroy();
    const { bubbleMs, bubbleTextMs } = this.context.content.tuning;
    this.beaconBubble = new Bubble(this, `beacon:${siteId}`, 1, textFrom(this.context.content.strings), { bubbleMs, bubbleTextMs }, () => {});
    this.beaconBubble.follow({ x: b.centerX, y: b.top });
    this.beaconBubble.show({ kind: 'text', class: 'chatter', text: this.context.content.strings['tpp.reward.new'] ?? 'New' });
  }
  private startArrival(arrival: Arrival | SiteArrival): void {
    if (this.arrival && !this.arrival.finished && this.arrival.arrival.petId === arrival.petId) return;
    this.arrival?.cancel();
    const depth = 'projectId' in arrival ? this.houses.get(arrival.projectId)?.depth ?? 0 : null;
    this.arrival = new ArrivalWalk(this, this.context, arrival, depth);
  }
  private cancelArrival(): void { this.arrival?.cancel(); this.arrival = null; }
  protected syncScene(deltaMs: number): void {
    this.arrival?.update(deltaMs);
    if (this.arrival?.finished) this.arrival = null;
    this.syncOutlines();
    if (!this.pet) return;
    this.pet.sync(this.context.store.getState().pets[this.pet.petId].behaviour);
    this.bubble?.follow(this.pet.bubbleAnchor());
    this.bubble?.update(deltaMs);
  }
  /** The scene's pet bubble for the shared bubble subscriptions. */
  protected petBubble(): Bubble | undefined { return this.bubble; }
  /** DEC-044: `art.base` once the site is unlocked, else `art.empty`; anchored base-centre at the site's (x, y). */
  refreshSites(): void {
    const state = this.context.store.getState();
    for (const site of sitesOf(this.context.content)) {
      const key = this.keyOf(state.spaces[site.id]?.unlocked ? site.art.base : site.art.empty);
      const art = this.siteArt.get(site.id);
      if (art && art.texture.key === key) continue;
      art?.destroy();
      this.siteArt.set(site.id, this.add.image(site.x, site.y, key).setOrigin(0.5, 1).setDepth(SITE_ART_DEPTH));
    }
    this.syncSiteCharms(false);
    this.showOutlines(false);
    this.ensurePet();
  }
  private siteOfSlot(slotId: string): Site | undefined { return sitesOf(this.context.content).find(site => site.slots.some(slot => slot.id === slotId)); }
  private sitePlacements(): Record<string, string> {
    const state = this.context.store.getState();
    return Object.assign({}, ...sitesOf(this.context.content).map(site => state.spaces[site.id]?.placements ?? {}));
  }
  /** Outlines at an unlocked site's slots in design mode only. */
  private showOutlines(fade: boolean): void {
    const state = this.context.store.getState();
    for (const [slotId, outline] of this.outlines) {
      const site = this.siteOfSlot(slotId);
      outline.setShown(state.mode === 'design' && site !== undefined && state.spaces[site.id]?.unlocked === true, fade);
    }
    this.syncOutlines();
  }
  syncOutlines(): void { syncOutlineStates(this.outlines, this.sitePlacements(), this.context.selectedSlotId ?? null); }
  /** Charms follow the sites' placements (a load, `debug.applied`, `charm.placed/removed {siteId}`); `animate` pops / fades the change. */
  private syncSiteCharms(animate: boolean): void {
    const { content } = this.context;
    const placements = this.sitePlacements();
    for (const [slotId, sprite] of [...this.charms]) {
      const type = content.charms.types.find(t => t.id === placements[slotId]);
      if (type && sprite.texture.key === this.keyOf(type.sprite)) continue;
      this.charms.delete(slotId);
      if (animate) fadeCharm(this, sprite); else sprite.destroy();
    }
    for (const [slotId, typeId] of Object.entries(placements)) {
      if (this.charms.has(slotId)) continue;
      const slot = this.siteOfSlot(slotId)?.slots.find(s => s.id === slotId);
      const type = content.charms.types.find(t => t.id === typeId);
      if (!slot || !type) continue;
      // A site slot has no wall: the charm stands at the slot point, facing its slot anchor (art drawn facing left).
      const sprite = new CharmSprite(this, slot.x, slot.y, this.keyOf(type.sprite)).setFlipX(slot.anchor.facing === 'right');
      sprite.setDepth(charmDepth(slot, type));
      this.charms.set(slotId, sprite);
      if (animate) popCharm(this, sprite);
    }
  }
  /** DEC-045: the site resident is drawn on the street once its arrival is done (`scenePet`), never before. */
  private ensurePet(): void {
    const { content, manifest, store } = this.context;
    const state = store.getState();
    const shared = scenePet(content, state);
    if (this.pet || !shared || shared.ref.kind !== 'site' || state.siteArrival !== null) return;
    const petId = shared.petId, pet = state.pets[petId];
    if (!pet) return;
    const entry = manifest.entries.find(e => e.id === content.pets[petId]?.sheet);
    if (entry && this.textures.exists(entry.id)) registerClips(this, entry as SheetEntry);
    this.pet = new PetSprite(this, petId, content.verbs, entry, pet.behaviour);
    const { bubbleMs, bubbleTextMs } = content.tuning;
    this.bubble = new Bubble(this, petId, 0, textFrom(content.strings), { bubbleMs, bubbleTextMs },
      tap => this.context.bus.emit({ type: 'bubble.tapped', petId, class: tap.class, text: tap.text }));
    this.bubble.follow(this.pet.bubbleAnchor());
  }
  drawWorld(): void {
    const { street } = this.context.content;
    const rects = street.groundTiles.map(tile => this.drawTile(tile));
    const sites = sitesOf(this.context.content);
    this.outlines = createOutlines(this, sites.flatMap(site => site.slots), false);
    for (const prop of street.props) this.add.image(prop.x, prop.y, this.keyOf(prop.sprite)).setOrigin(0.5, 1).setDepth(depthAtBase(prop.y));
    for (const house of street.houses) {
      const sprite = new HouseSprite(this, house, displayedPhase(this.context.content, this.context.store.getState(), house.projectId));
      this.houses.set(house.projectId, sprite);
      this.icons.set(house.projectId, sprite.icon);
    }
    const bounds = unionRect(rects);
    this.cameras.main.setBounds(bounds.x, bounds.y, bounds.w, bounds.h);
    this.refreshHouses();
    this.refreshSites();
  }
  private keyOf(key: string): string { return this.textures.exists(key) ? key : MISSING_TEXTURE; }
  private drawTile(tile: { sprite: string; x: number; y: number }): Rect {
    const key = this.keyOf(tile.sprite);
    const image = this.add.image(tile.x, tile.y, key).setOrigin(0, 0).setDepth(GROUND_DEPTH);
    if (key === MISSING_TEXTURE) image.setDisplaySize(TILE_SIZE.w, TILE_SIZE.h);
    this.tiles.push(image);
    return key === MISSING_TEXTURE ? { x: tile.x, y: tile.y, ...TILE_SIZE } : { x: tile.x, y: tile.y, w: image.frame.width, h: image.frame.height };
  }
  /** Mec-002 §2.4: each icon iff `attentionVisible`; each house at `displayedPhase` (order fork 4: WORK-020-2 owns the cutscene swap). */
  refreshHouses(): void {
    const { content, store } = this.context;
    const state = store.getState();
    for (const [projectId, house] of this.houses) {
      house.icon.setVisible(attentionVisible(content, state, projectId));
      if (this.director?.owns(projectId)) continue;
      const phase = displayedPhase(content, state, projectId);
      if (phase !== house.phase) house.setPhase(phase);
    }
  }
  /** Order fork 3: a house (or its icon) is a tap target iff its icon is visible; the icon wins over the sprites. */
  private targetAt(x: number, y: number): ProjectId | null {
    const { content, store } = this.context;
    const state = store.getState();
    const targets = [...this.houses.values()].filter(h => attentionVisible(content, state, h.projectId));
    const onIcon = targets.find(h => h.icon.contains(x, y));
    if (onIcon) return onIcon.projectId;
    return targets.sort((a, b) => b.depth - a.depth).find(h => h.hitContains(x, y))?.projectId ?? null;
  }
  /** Presentation §3.1: a pointer the joystick captured is not classified. */
  pointerDown = (p: ScenePointer): void => {
    if (this.joystick.active && this.joystickPointer === null) { this.joystickPointer = p.id; return; }
    this.downs.set(p.id, { x: p.worldX, y: p.worldY, t: p.downTime });
  };
  /** TECH-004: record `input.tap`/`input.drag`; a tap on `house:<projectId>` dispatches `acknowledgeProject` (mec-002 §2.4). */
  pointerUp = (p: ScenePointer): void => {
    if (p.id === this.joystickPointer) { this.joystickPointer = null; return; }
    const down = this.downs.get(p.id);
    if (!down) return;
    this.downs.delete(p.id);
    const up = { x: p.worldX, y: p.worldY, t: p.upTime };
    // WORK-034-3: a visible site outline wins (design mode), then the mate's bubble and the mate (tap-to-text / `tapPet`), then a house.
    const outline = outlineAt(this.outlines, up.x, up.y);
    const onBubble = !outline && this.bubble?.contains(up.x, up.y) === true;
    const onPet = !outline && !onBubble && this.pet?.hitContains(up.x, up.y) === true;
    const projectId = outline || onBubble || onPet ? null : this.targetAt(up.x, up.y);
    const petId = this.pet?.petId ?? '';
    const target = outline ? `slot:${outline.slotId}` : onBubble ? `bubble:${petId}` : onPet ? `pet:${petId}` : projectId ? `house:${projectId}` : 'world';
    const result = recordPointer(this.context.log.record, target, down, up);
    if (result.kind !== 'tap') return;
    if (outline) this.context.bus.emit({ type: 'slot.tapped', slotId: outline.slotId, filled: this.sitePlacements()[outline.slotId] !== undefined });
    else if (onBubble) this.bubble!.tap();
    else if (onPet) this.context.store.dispatch({ type: 'tapPet', petId });
    else if (projectId) this.context.store.dispatch({ type: 'acknowledgeProject', projectId });
  };
  protected subscribeScene(): void {
    this.input.on('pointerdown', this.pointerDown); this.input.on('pointerup', this.pointerUp);
    this.unsubscribes.push(() => { this.input.off('pointerdown', this.pointerDown); this.input.off('pointerup', this.pointerUp); });
    const director = new CelebrationDirector(this, directorClock.create(this));
    this.director = director;
    this.on('celebration.started', (event, state) => director.started(event, state));
    this.on('celebration.ended', () => director.ended());
    this.on('state.reset', () => director.cancel());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => director.cancel());
    this.on('arrival.started', event => this.startArrival({ projectId: event.projectId, petId: event.petId }));
    this.on('state.reset', () => this.cancelArrival());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cancelArrival());
    for (const type of REFRESH_ON) this.on(type, () => this.refreshHouses());
    this.subscribeSite();
    this.subscribeBeacon();
  }
  /** DEC-049 §4: tells the street HUD where a site slot is on screen (overlay = canvas px) so its Stars burst starts there. */
  private announceSlotAt(slotId: string): void {
    const slot = this.siteOfSlot(slotId)?.slots.find(s => s.id === slotId);
    if (!slot) return;
    const cam = this.cameras.main;
    window.dispatchEvent(new CustomEvent(SITE_SLOT_AT, { detail: { slotId, x: slot.x - cam.scrollX, y: slot.y - 60 - cam.scrollY } }));
  }
  /** DEC-049 §7: the garden toast showed; the active street plays the beacon, otherwise the next Street create does (fork (b)). */
  private subscribeBeacon(): void {
    listenForBeacons();
    this.on('state.reset', () => unseenBeacons.clear());
  }
  /** WORK-034-3: the site's art, outlines, charms, the mate's arrival walk and the mate (bubbles through the shared subscriptions). */
  private subscribeSite(): void {
    this.on('space.unlocked', () => this.refreshSites());
    this.on('debug.applied', () => this.refreshSites());
    this.on('mode.changed', () => this.showOutlines(true));
    this.on('charm.placed', event => { if (event.siteId) { this.syncOutlines(); this.syncSiteCharms(true); this.announceSlotAt(event.slotId); } });
    this.on('charm.removed', event => { if (event.siteId) { this.syncOutlines(); this.syncSiteCharms(true); } });
    this.on('space.arrivalStarted', event => this.startArrival({ siteId: event.siteId, petId: event.petId }));
    // The walk ends on the 🎵 without a fade; the street sprite appears in the same dispatch, at the walk's last point.
    this.on('pet.arrived', () => this.ensurePet());
    this.on('pet.phaseChanged', event => {
      if (!this.pet || event.petId !== this.pet.petId) return;
      this.pet.setClip(this.pet.clipFor({ phase: event.to, verb: event.verb, reaction: event.reaction }));
      if (event.to === 'reacting' || event.to === 'greeting') this.bubble?.releasePending();
      else if (event.to !== 'walking') this.bubble?.dropPending();
    });
    this.subscribePetBubbles();
  }
}

import Phaser from 'phaser';
import type { Street } from '@content/schema/street';
import { depthAtBase } from '../depth';
import { MISSING_TEXTURE } from '../scenes/BootScene';

export type StreetHouse = Street['houses'][number];

/** Presentation §6.1: the attention icon draws above every world sprite. */
export const ATTENTION_DEPTH = 6000;
/** Tier 1 (journal): the renders' r 18 icon ×2 → 72 px, a 44 px Nunito 800 "!" in ink. */
export const ATTENTION_ICON = { size: 72, glyphPx: 44, glyphColor: '#503d2d', texture: 'ui/Btn_RoundIcon' } as const;

const textureOr = (scene: Phaser.Scene, key: string | undefined): string =>
  key !== undefined && scene.textures.exists(key) ? key : MISSING_TEXTURE;

/** Mec-002 §2.4 attention icon: `ui/Btn_RoundIcon` + "!" at the house's `attentionAnchor`, hit-tested by its circle. */
export class AttentionIcon extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, anchor: { x: number; y: number }) {
    super(scene, anchor.x, anchor.y);
    const { size, glyphPx, glyphColor, texture } = ATTENTION_ICON;
    const button = scene.add.image(0, 0, textureOr(scene, texture)).setDisplaySize(size, size);
    const glyph = scene.add.text(0, 0, '!', { fontFamily: 'Nunito, sans-serif', fontStyle: '800', fontSize: `${glyphPx}px`, color: glyphColor }).setOrigin(0.5);
    this.add([button, glyph]);
    scene.add.existing(this);
    this.setDepth(ATTENTION_DEPTH).setVisible(false);
  }
  /** True when the icon is shown and (x, y) lies inside its circle. */
  contains(x: number, y: number): boolean {
    return this.visible && Math.hypot(x - this.x, y - this.y) <= ATTENTION_ICON.size / 2;
  }
}

/** Presentation §6.2 `HouseSprite`: `stageSprites[phase]` at the house's base point, origin (0.5, 1), depth = y. */
export class HouseSprite extends Phaser.GameObjects.Image {
  readonly house: StreetHouse;
  readonly icon: AttentionIcon;
  phase: number;
  constructor(scene: Phaser.Scene, house: StreetHouse, phase: number) {
    super(scene, house.x, house.y, textureOr(scene, house.stageSprites[phase]));
    this.house = house;
    this.phase = phase;
    scene.add.existing(this);
    this.setOrigin(0.5, 1).setDepth(depthAtBase(house.y));
    this.icon = new AttentionIcon(scene, house.attentionAnchor);
  }
  get projectId(): string { return this.house.projectId; }
  /** Shows `stageSprites[p]` (`missing` when the texture is absent); WORK-020-2 drives the cutscene swaps through it. */
  setPhase(phase: number): this {
    this.phase = phase;
    return this.setTexture(textureOr(this.scene, this.house.stageSprites[phase]));
  }
  /** Tier 1: the sprite's world bounds (not pixel alpha). */
  hitContains(x: number, y: number): boolean {
    return this.getBounds().contains(x, y);
  }
}

import type Phaser from 'phaser';

export const GRID_DEPTH = 3000;
const ARM = 40;
const COLOUR = 0xff0088;

/** Verification GAP-2 / VERIFY-WORK-001-16: the five viewport points in game px for a `width × height` viewport. */
export function alignmentPoints(width: number, height: number): [number, number][] {
  return [[0, 0], [width, 0], [0, height], [width, height], [width / 2, height / 2]];
}

/** Crosshairs at the five viewport points (`scrollFactor 0`, depth 3000), sized to the current `gameSize`. */
export function drawAlignment(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const { width, height } = scene.scale.gameSize;
  const graphics = scene.add.graphics().setScrollFactor(0).setDepth(GRID_DEPTH);
  graphics.lineStyle(3, COLOUR, 1);
  for (const [x, y] of alignmentPoints(width, height)) {
    graphics.lineBetween(x - ARM, y, x + ARM, y);
    graphics.lineBetween(x, y - ARM, x, y + ARM);
    graphics.strokeCircle(x, y, ARM / 2);
  }
  graphics.setData('points', alignmentPoints(width, height));
  return graphics;
}

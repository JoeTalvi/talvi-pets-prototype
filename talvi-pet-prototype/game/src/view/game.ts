import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { InteriorScene } from './scenes/InteriorScene';
import { StreetScene } from './scenes/StreetScene';
import { REGISTRY_KEY, type ViewContext } from './context';
export function createGame(context: ViewContext): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.WEBGL, parent: 'game', backgroundColor: '#efe7d6',
    scale: { mode: Phaser.Scale.EXPAND, width: 1920, height: 823, max: { width: 1920, height: 1080 }, autoCenter: Phaser.Scale.CENTER_BOTH },
    render: { antialias: true, roundPixels: false, pixelArt: false },
    input: { activePointers: 2, keyboard: true, touch: true, mouse: true },
    fps: { target: 60, smoothStep: true }, disableContextMenu: true,
    callbacks: { preBoot: game => { game.registry.set(REGISTRY_KEY, context); } },
    scene: [BootScene, StreetScene, InteriorScene]
  });
}

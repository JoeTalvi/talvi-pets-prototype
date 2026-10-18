import Phaser from 'phaser';
let game: Phaser.Game | undefined;
export function createGame(): Promise<Phaser.Scene> {
  return new Promise(resolve => {
    game = new Phaser.Game({ type: Phaser.HEADLESS, width: 1920, height: 1080, banner: false, audio: { noAudio: true }, scene: { key: 'Test', create(this: Phaser.Scene) { resolve(this); } } });
  });
}
export function destroyGame(): void { game?.destroy(true); game = undefined; }

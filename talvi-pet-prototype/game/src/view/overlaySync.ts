import type Phaser from 'phaser';
export function syncOverlay(game: Phaser.Game, root: HTMLElement): () => void {
  const sync = () => {
    const bounds = game.canvas.getBoundingClientRect();
    const height = game.scale.gameSize.height;
    const scale = bounds.width / 1920;
    Object.assign(root.style, { left: `${bounds.left}px`, top: `${bounds.top}px`, width: '1920px', height: `${height}px`, transform: `scale(${scale})` });
    root.style.setProperty('--overlay-scale', String(scale));
    for (const scene of game.scene.getScenes(true)) scene.cameras.main.setScroll(0, (1080 - height) / 2);
  };
  game.scale.on('resize', sync);
  sync();
  return () => { game.scale.off('resize', sync); };
}

import type Phaser from 'phaser';
import { log, logs } from '@app/log';
import { spike } from '@app/spikeController';
import { setAlignmentGrid } from '@ui/overlay';
// Dev-only diagnostics, removed with the WORK-001 harness in WORK-014.
export function drawAlignment(scene: Phaser.Scene): void {
  const graphics = scene.add.graphics().setScrollFactor(0).setDepth(3000);
  const draw = () => {
    graphics.clear();
    if (!document.querySelector<HTMLInputElement>('#grid-toggle')?.checked) return;
    const height = scene.scale.gameSize.height;
    graphics.lineStyle(3, 0x00bcd4);
    for (const [x, y] of [[0, 0], [1920, 0], [0, height], [1920, height], [960, height / 2]]) { graphics.strokeCircle(x, y, 18); graphics.lineBetween(x - 20, y, x + 20, y); graphics.lineBetween(x, y - 20, x, y + 20); }
  };
  scene.events.on('update', draw);
}
export function installDiagnostics(game: Phaser.Game, root: HTMLElement): void {
  const grid = root.querySelector<HTMLInputElement>('#grid-toggle')!;
  grid.addEventListener('change', () => setAlignmentGrid(root, grid.checked));
  const status = root.querySelector<HTMLOutputElement>('#spike-status')!;
  const timer = setInterval(() => { status.value = `${spike.state.scene} · ${game.scale.gameSize.width} × ${game.scale.gameSize.height} · ${game.loop.actualFps.toFixed(1)} fps\nAvatar ${spike.state.avatar.x.toFixed(1)}, ${spike.state.avatar.y.toFixed(1)} · audio locked: ${game.sound.locked}`; }, 500);
  game.events.once('destroy', () => clearInterval(timer));
  const sample = async (state: 'idle' | 'walking') => {
    const samples: number[] = [];
    for (let index = 0; index < 10; index++) { await new Promise(resolve => setTimeout(resolve, 1000)); samples.push(game.loop.actualFps); }
    const result = { state, samples, mean: samples.reduce((sum, value) => sum + value, 0) / samples.length, min: Math.min(...samples) };
    log('perf.sample', result); return result;
  };
  Object.assign(window, { __tpp: { game, spike, logs, sample } });
}

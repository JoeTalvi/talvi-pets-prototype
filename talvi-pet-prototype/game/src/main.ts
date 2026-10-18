import { createGame } from '@view/game';
import { syncOverlay } from '@view/overlaySync';
import { installDiagnostics } from '@view/spikeDiagnostics';
import { mountOverlay } from '@ui/overlay';
import { showError } from '@ui/panels/errorScreen';
import { installPointerRouting } from '@app/input/pointerRouting';
import { log } from '@app/log';
import '@ui/styles/tokens.css';
import '@ui/styles/nineslice.css';
async function boot(): Promise<void> {
  const probe = document.createElement('canvas');
  if (!(probe.getContext('webgl2') || probe.getContext('webgl'))) { showError('This prototype needs WebGL. Enable hardware graphics and reload.'); return; }
  await Promise.all([document.fonts.load('700 32px "Baloo 2"'), document.fonts.load('400 24px Nunito')]);
  const root = document.getElementById('overlay')!; mountOverlay(root);
  const game = createGame();
  game.events.once('ready', () => {
    syncOverlay(game, root); installPointerRouting();
    if (import.meta.env.DEV) installDiagnostics(game, root);
    log('audio.locked', { locked: game.sound.locked });
    installSound(game, root);
  });
  log('session.started', { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio, standalone: matchMedia('(display-mode: standalone)').matches }, userAgent: navigator.userAgent });
}
function installSound(game: ReturnType<typeof createGame>, root: HTMLElement): void {
  document.addEventListener('pointerup', () => {
    const sound = game.sound as typeof game.sound & { context?: AudioContext };
    sound.context?.resume().catch(error => log('audio.failed', { reason: String(error) }));
  }, { once: true });
  root.querySelector('#sound')!.addEventListener('click', () => {
    if (game.sound.locked) game.sound.once('unlocked', () => game.sound.play('sfx/place'));
    else { game.sound.play('sfx/place'); log('audio.played', { key: 'sfx/place' }); }
  });
}
boot().catch(error => showError(String(error)));

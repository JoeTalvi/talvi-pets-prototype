// @vitest-environment jsdom
import './setup';
import { afterEach, expect, it } from 'vitest';
import { createGame, destroyGame } from './helper';
import { mountOverlay } from '@ui/overlay';
import { createKeyboard } from '@app/input/keyboard';
afterEach(() => { destroyGame(); document.body.replaceChildren(); });
it('VERIFY-WORK-001-02 real HEADLESS scene boots through package import and overlay mounts', async () => {
  const scene = await createGame();
  expect(scene.scene.key).toBe('Test');
  const avatar = scene.add.sprite(10, 20, '__DEFAULT'); expect(avatar.y).toBe(20);
  const root = document.createElement('div'); document.body.append(root); mountOverlay(root);
  expect(root.querySelector('h1')?.textContent).toContain('Talvi');
});
it('VERIFY-WORK-001-14 DOM keyboard reaches adapter, normalises diagonal, clears on focus', () => {
  const keyboard = createKeyboard();
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'ArrowRight' }));
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
  expect(Math.hypot(keyboard.vector().x, keyboard.vector().y)).toBeCloseTo(1);
  const input = document.createElement('input'); document.body.append(input); input.focus();
  expect(keyboard.vector()).toEqual({ x: 0, y: 0 }); keyboard.destroy();
});

// @vitest-environment jsdom
import './setup';
import { afterEach, expect, it } from 'vitest';
import { createGame, destroyGame } from './helper';

afterEach(() => destroyGame());

/** GAP-12 fact (a): what `add.nineslice` does at Phaser 4.2.1 under HEADLESS in jsdom; the test passes either way and prints the fact. */
it('GAP-12 nineslice under HEADLESS partial: records whether add.nineslice exists (WebGL-only would mean WORK-019 bubbles and WORK-020 world bar draw via CSS or images under CANVAS)', async () => {
  const scene = await createGame();
  const canvas = document.createElement('canvas'); canvas.width = 832; canvas.height = 492;
  scene.textures.addImage('ui/Panel_ModalDialog', canvas as unknown as HTMLImageElement);
  let fact: string;
  try {
    const slice = scene.add.nineslice(0, 0, 'ui/Panel_ModalDialog', undefined, 300, 140, 100, 100, 100, 100);
    fact = slice ? `exists: ${slice.type} ${slice.width}x${slice.height}` : `returned ${String(slice)}`;
    if (slice) expect([slice.width, slice.height]).toEqual([300, 140]);
  } catch (error) { fact = `throws: ${String(error)}`; }
  console.info(`GAP-12 nineslice fact: ${fact}`); // eslint-disable-line no-console
  expect(fact).toBeTruthy();
});

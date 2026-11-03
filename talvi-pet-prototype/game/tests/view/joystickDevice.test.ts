// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { designSetup } from './designHarness';
import { destroyScene } from './sceneHarness';
import type { InteriorScene } from '../../src/view/scenes/InteriorScene';

/** The on-screen joystick shows only on a touch-first device (`context.touch`); a desktop plays with the keyboard. */
afterEach(() => { destroyScene(); document.body.replaceChildren(); });
const parts = (scene: InteriorScene) => scene.joystick as unknown as { base: { visible: boolean }; knob: { visible: boolean } };
const frame = (scene: InteriorScene) => scene.update(1000, 16);

describe('joystick on a desktop', () => {
  it('base and knob stay hidden through frames, and a pointer down inside the base captures nothing (the tap reaches the scene)', async () => {
    const s = await designSetup({ mode: 'play', touch: false });
    frame(s.scene); frame(s.scene);
    expect([parts(s.scene).base.visible, parts(s.scene).knob.visible]).toEqual([false, false]);
    const centre = { x: s.context.content.tuning.joystick.x, y: s.scene.scale.gameSize.height - s.context.content.tuning.joystick.bottomOffset };
    s.scene.input.emit('pointerdown', { id: 7, x: centre.x, y: centre.y });
    expect(s.scene.joystick.active).toBe(false);
    expect(s.scene.joystick.vector).toEqual({ x: 0, y: 0 });
  });
});

describe('joystick on a touch device', () => {
  it('base and knob show while input is free, hide while frozen, and a pointer down inside the base captures', async () => {
    const s = await designSetup({ mode: 'play', touch: true });
    frame(s.scene);
    expect([parts(s.scene).base.visible, parts(s.scene).knob.visible]).toEqual([true, true]);
    const centre = { x: s.context.content.tuning.joystick.x, y: s.scene.scale.gameSize.height - s.context.content.tuning.joystick.bottomOffset };
    s.scene.input.emit('pointerdown', { id: 7, x: centre.x, y: centre.y });
    expect(s.scene.joystick.active).toBe(true);
    s.context.debugOpen = true; frame(s.scene);
    expect([parts(s.scene).base.visible, s.scene.joystick.active]).toEqual([false, false]);
  });
});

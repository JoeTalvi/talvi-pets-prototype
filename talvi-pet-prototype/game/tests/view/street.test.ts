// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it } from 'vitest';
import { StreetScene } from '../../src/view/scenes/StreetScene';
import { startSceneFor } from '../../src/view/startup';
import { parseSaveValue } from '../../src/sim/state.schema';
import type { GameState } from '../../src/sim/state';
import { validContent } from '../content/helpers';
import { fixtureText } from '../app/helpers';
import { bootScene, contextFor, destroyScene } from './sceneHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); });

describe('VERIFY-PRES-008 replay boot', () => {
  it('VERIFY-PRES-008 partial: state/scene half — FX-SAVE-V1-CEL-milestone starts Street with the avatar at state and store.start() publishes one replay celebration.started (popup, framing and house: WORK-020; Chrome half: WORK-021)', async () => {
    const content = validContent();
    const parsed = parseSaveValue(content, JSON.parse(fixtureText('save-v1.milestone.json')));
    const state = (parsed as { state: GameState }).state;
    expect(startSceneFor(state)).toEqual({ key: 'Street', data: {} });
    const context = contextFor(content, state);
    const scene = await bootScene(StreetScene, context);
    expect(scene.scene.key).toBe('Street');
    expect(context.store.getState().celebration?.step).toBe('milestone');
    expect([scene.avatar.x, scene.avatar.y, scene.avatar.depth]).toEqual([960, 900, 900]);
    context.store.start();
    const replays = context.log.lines().filter(l => l.type === 'celebration.started');
    expect(replays).toHaveLength(1);
    expect(replays[0]).toMatchObject({ replay: true, projectId: 'pet-house', fromPhase: 1, toPhase: 4 });
  });

  it('presentation §4 Street placeholder draws one faint rect per street door and no houses', async () => {
    const content = validContent();
    const scene = await bootScene(StreetScene, contextFor(content, (parseSaveValue(content, JSON.parse(fixtureText('save-v1.milestone.json'))) as { state: GameState }).state));
    const doors = scene.children.list.filter(c => c.type === 'Rectangle' && (c as Phaser.GameObjects.Rectangle).fillAlpha === 0.25) as Phaser.GameObjects.Rectangle[];
    expect(doors.map(d => [d.x, d.y, d.width, d.height])).toEqual(content.street.houses.map(h => [h.door.rect.x, h.door.rect.y, h.door.rect.w, h.door.rect.h]));
    expect(scene.children.list.filter(c => c.type === 'Image' && String((c as Phaser.GameObjects.Image).texture.key).startsWith('houses/'))).toHaveLength(0);
  });
});

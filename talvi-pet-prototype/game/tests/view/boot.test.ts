// @vitest-environment jsdom
import './setup';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGame, destroyGame } from './helper';
import { mountOverlay } from '@ui/overlay';
import { showError } from '@ui/panels/errorScreen';
import { createKeyboard } from '@app/input/keyboard';
import { createJoystickAdapter } from '@app/input/joystick';
import { ContentError, loadContent } from '@content/load';
import { manifest } from '../content/helpers';
afterEach(() => { destroyGame(); document.body.replaceChildren(); vi.restoreAllMocks(); });
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

const tuning = JSON.parse(readFileSync('src/content/tuning.json', 'utf8')) as {
  joystick: { x: number; bottomOffset: number; baseDiameter: number; range: number } };

function joystickAt(height: number) {
  const records: { type: string; payload?: Record<string, unknown> }[] = [];
  let clock = 1000;
  const joystick = createJoystickAdapter({
    centre: () => ({ x: tuning.joystick.x, y: height - tuning.joystick.bottomOffset }),
    range: tuning.joystick.range, captureHalf: tuning.joystick.baseDiameter / 2,
    record: (type, payload) => records.push({ type, payload }), now: () => clock,
  });
  return { joystick, records, advance: (ms: number) => { clock += ms; } };
}

describe('VERIFY-PRES-003 joystick', () => {
  it('VERIFY-PRES-003 joystick adapter driven directly with synthetic pointer data (GAP-5): raw clamped vector and input.joystick records', () => {
    const { joystick, records, advance } = joystickAt(823);
    expect(joystick.down(1, 220, 523)).toBe(true);
    expect(joystick.active).toBe(true);
    expect(joystick.vector).toEqual({ x: 0, y: 0 });
    expect(records).toEqual([{ type: 'input.joystick', payload: { phase: 'start' } }]);
    joystick.move(1, 260, 523); expect(joystick.vector).toEqual({ x: 0.5, y: 0 });
    joystick.move(2, 400, 523); expect(joystick.vector).toEqual({ x: 0.5, y: 0 });
    joystick.move(1, 420, 523); expect(joystick.vector).toEqual({ x: 1, y: 0 });
    joystick.move(1, 260, 563); expect(joystick.vector).toEqual({ x: 0.5, y: 0.5 });
    advance(640);
    joystick.up(1);
    expect(joystick.vector).toEqual({ x: 0, y: 0 });
    expect(joystick.active).toBe(false);
    expect(records[1]).toEqual({ type: 'input.joystick', payload: { phase: 'end', ms: 640 } });
    expect(joystick.down(1, 600, 523)).toBe(false);
    expect(records).toHaveLength(2);
  });

  it('VERIFY-PRES-003 joystick release() (gameout/hidden) ends the session and a second pointer cannot capture while active', () => {
    const { joystick, records } = joystickAt(823);
    joystick.down(1, 240, 523);
    expect(joystick.down(2, 220, 523)).toBe(false);
    joystick.release();
    expect(joystick.vector).toEqual({ x: 0, y: 0 });
    expect(records.map(r => r.payload?.phase)).toEqual(['start', 'end']);
  });
});

describe('VERIFY-PRES-004 keyboard', () => {
  it('VERIFY-PRES-004 keyboard DOM-driven under jsdom (WORK-001-02 showed DOM keys reach the adapter): diagonal, focus rule, Backquote toggle', () => {
    const keyboard = createKeyboard();
    const toggles = vi.fn();
    keyboard.onDebugToggle(toggles);
    const key = (type: 'keydown' | 'keyup', code: string) => window.dispatchEvent(new KeyboardEvent(type, { code }));
    key('keydown', 'KeyD'); key('keydown', 'KeyW');
    expect(keyboard.vector().x).toBeCloseTo(0.7071, 4); expect(keyboard.vector().y).toBeCloseTo(-0.7071, 4);
    const input = document.createElement('input'); document.body.append(input); input.focus();
    expect(keyboard.vector()).toEqual({ x: 0, y: 0 });
    key('keydown', 'Backquote'); expect(toggles).not.toHaveBeenCalled();
    input.blur(); key('keydown', 'KeyD'); key('keydown', 'KeyW');
    expect(keyboard.vector().x).toBeCloseTo(0.7071, 4); expect(keyboard.vector().y).toBeCloseTo(-0.7071, 4);
    key('keyup', 'KeyD'); key('keyup', 'KeyW');
    expect(keyboard.vector()).toEqual({ x: 0, y: 0 });
    key('keydown', 'Backquote'); expect(toggles).toHaveBeenCalledTimes(1);
    keyboard.destroy();
  });
});

/** The mounted error screen is written for the reviewer when TPP_EVIDENCE_DIR is set (a DOM state read). */
function writeEvidence(name: string, text: string) {
  const dir = process.env.TPP_EVIDENCE_DIR;
  if (!dir) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), text);
}

describe('VERIFY-PRES-013 error screen', () => {
  it('VERIFY-PRES-013 partial: jsdom half — FX-BAD charms-bad-size-class mounts the fail-fast error screen (Export works: WORK-014 button + WORK-021 playable row; device half not-run)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const overlay = document.createElement('div'); overlay.id = 'overlay';
    overlay.append(document.createElement('button')); document.body.append(overlay);
    const files = JSON.parse(readFileSync('tests/fixtures/bad/charms-bad-size-class.json', 'utf8'));
    let error: unknown;
    try { loadContent(manifest, files); } catch (thrown) { error = thrown; }
    expect(error).toBeInstanceOf(ContentError);
    showError((error as ContentError).message);
    const screen = document.querySelector('#error-screen')!;
    expect(screen.querySelector('h1[data-string-key="tpp.error.title"]')).not.toBeNull();
    const detail = screen.querySelector('p')!.textContent!;
    expect(detail).toMatch(/charms\.json:\/types\/3\/sizeClass/);
    expect(detail).toContain((error as ContentError).issues[0].message);
    expect(overlay.childElementCount).toBe(0);
    expect(document.querySelector('canvas')).toBeNull();
    writeEvidence('error-screen.html', screen.outerHTML);
  });
});
it('VERIFY-ASSET-005 the six avatar clip keys exist after the BootScene.create registration loop over the real manifest, with ASSET-016 frame ranges and manifest rates', async () => {
  const scene = await createGame();
  const { realManifest, addTexture } = await import('./sceneHarness');
  const { registerClips } = await import('@view/anims');
  for (const entry of realManifest.entries) if (entry.type === 'spritesheet') { addTexture(scene, entry.id, entry.px!.w, entry.px!.h, entry.frame); registerClips(scene, entry); }
  const ranges = { 'idle-down': [0, 3], 'idle-up': [6, 9], 'idle-side': [12, 15], 'walk-down': [18, 23], 'walk-up': [24, 29], 'walk-side': [30, 35] };
  for (const [clip, [start, end]] of Object.entries(ranges)) {
    const anim = scene.anims.get(`avatar-${clip}`)!;
    expect(scene.anims.exists(`avatar-${clip}`)).toBe(true);
    expect(anim.frames.map(f => f.frame.name)).toEqual(Array.from({ length: end - start + 1 }, (_, i) => start + i));
    expect(anim.frameRate).toBe(clip.startsWith('walk') ? 10 : 6);
  }
});

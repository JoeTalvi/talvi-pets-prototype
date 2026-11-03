// @vitest-environment jsdom
import './setup';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { designSetup } from './designHarness';
import { destroyScene } from './sceneHarness';

afterEach(() => { destroyScene(); document.body.replaceChildren(); vi.restoreAllMocks(); });

const M1_PANELS = ['hudInterior', 'hudStreet', 'toast', 'wantPanel', 'dialogue', 'chooser', 'replaceRemove', 'milestonePopup', 'revealPopup', 'revealPanel', 'debugPanel', 'roomEditor'];

describe('presentation §8 mount order (WORK-021-1)', () => {
  it('presentation §8 mount order (WORK-021-1, WORK-023-1) — #panels holds the 12 panel roots (11 M1 + revealPanel) once each, in the as-landed order, one per #panels child (the replaceRemove sheet sits inside its own .tpp-panel-layer wrapper); every Panels member is defined and matches a root', async () => {
    const s = await designSetup();
    const panels = s.root; // the harness root is #panels
    expect(panels.id).toBe('panels');
    const roots = [...s.root.querySelectorAll<HTMLElement>('[data-panel]')];
    // WORK-037-3: the Closet picker root is mounted by hudStreet right after its own root (not a Panels member).
    const DOM_ROOTS = [...M1_PANELS.slice(0, 2), 'closet', ...M1_PANELS.slice(2)];
    expect(roots.map(r => r.dataset.panel)).toEqual(DOM_ROOTS);
    const children = [...panels.children] as HTMLElement[];
    expect(children).toHaveLength(DOM_ROOTS.length);
    expect(children.map(c => c.dataset.panel ?? c.querySelector<HTMLElement>('[data-panel]')?.dataset.panel)).toEqual(DOM_ROOTS);
    expect(children[7].className).toBe('tpp-panel-layer');
    expect(Object.keys(s.panels).sort()).toEqual([...M1_PANELS].sort());
    for (const name of M1_PANELS) expect(s.panels[name as keyof typeof s.panels]).toBeDefined();
  });
});

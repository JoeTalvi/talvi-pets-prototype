// @vitest-environment jsdom
import './setup';
import { describe, expect, it } from 'vitest';
import { findingsOf, lenientAllowed, startSceneFor } from '../../src/view/startup';
import { loadContent } from '../../src/content/load';
import { realManifest } from './sceneHarness';

describe('foundation §4.2 startup', () => {
  it('foundation §4.2 startup startSceneFor maps state.scene to the Boot hand-over', () => {
    expect(startSceneFor({ scene: { kind: 'street' } })).toEqual({ key: 'Street', data: {} });
    expect(startSceneFor({ scene: { kind: 'interior', roomId: 'dog-room' } })).toEqual({ key: 'Interior', data: { roomId: 'dog-room' } });
  });

  it('foundation §4.2 startup lenientAllowed: ?lenient=1 only in a dev build (QT-1(a))', () => {
    expect(lenientAllowed('?lenient=1', true)).toBe(true);
    expect(lenientAllowed('?lenient=1', false)).toBe(false);
    expect(lenientAllowed('', true)).toBe(false);
    expect(lenientAllowed('?lenient=0', true)).toBe(false);
  });

  it('foundation §4.2 startup findingsOf(real content, real manifest): the 22 unresolved later-batch ids are the only errors, each listed once', () => {
    const content = loadContent(undefined);
    const findings = findingsOf(content, realManifest);
    const errors = findings.filter(f => f.level === 'error');
    expect(errors).toHaveLength(22);
    for (const error of errors) {
      expect(error.ids[0]).toBe('CHK-CORE-03');
      expect(error.message).toMatch(/^Asset "(charms|pets|clues)\/[a-z-]+" must resolve as (image|spritesheet)$/);
    }
    expect(new Set(errors.map(e => `${e.file}${e.path}`)).size).toBe(22);
  });
});

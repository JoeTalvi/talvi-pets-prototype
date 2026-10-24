import type { AssetManifest } from '@content/schema/assets';
import { resolveContent } from '@content/resolve';
import { pointer, type Content } from '@content/types';
import { runContentChecks } from '@sim/checks/index';
import type { Finding } from '@sim/checks/types';
import type { GameState } from '@sim/state';

export type SceneKey = 'Street' | 'Interior';
export type SceneStart = { key: SceneKey; data: { roomId?: string } };

/** Foundation §4.2: Boot hands over to the scene `state.scene` names. */
export function startSceneFor(state: Pick<GameState, 'scene'>): SceneStart {
  const scene = state.scene;
  return scene.kind === 'street' ? { key: 'Street', data: {} } : { key: 'Interior', data: { roomId: scene.roomId } };
}

/** Tools §7 QT-1(a): `?lenient=1` boots past error findings, dev builds only. */
export function lenientAllowed(search: string, dev: boolean): boolean {
  return dev && new URLSearchParams(search).get('lenient') === '1';
}

const keyOf = (f: Pick<Finding, 'file' | 'path' | 'message'>) => `${f.file}\u0000${f.path}\u0000${f.message}`;

/** Resolution issues (as error findings) plus the content checks; a resolution issue the core checks also report appears once. */
export function findingsOf(content: Content, manifest: AssetManifest): Finding[] {
  const resolution: Finding[] = resolveContent(content, manifest).map(issue => ({
    ids: issue.ids ?? [issue.code], level: 'error', file: issue.file, path: pointer(issue.path), message: issue.message,
  }));
  const checks = runContentChecks(content, manifest);
  const seen = new Set(checks.map(keyOf));
  return [...resolution.filter(f => !seen.has(keyOf(f))), ...checks];
}

export const hasErrors = (findings: readonly Finding[]): boolean => findings.some(f => f.level === 'error');

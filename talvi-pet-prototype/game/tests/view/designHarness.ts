import { loadContent } from '../../src/content/load';
import type { GameState } from '../../src/sim/state';
import { InteriorScene, type ScenePointer } from '../../src/view/scenes/InteriorScene';
import { mountOverlay, type Panels } from '../../src/ui/overlay';
import type { ViewContext } from '../../src/view/context';
import { files, manifest, patchFiles } from '../content/helpers';
import { designIn } from '../sim/helpers';
import { bootScene, contextFor } from './sceneHarness';

type Patch = { file: string; path: string; value: unknown };
/** The real strings the acceptance rows read (FX-CONTENT-MIN's strings.json says "Fixture"). */
export const REAL_STRINGS: Patch[] = Object.entries({
  'tpp.hud.decorate': 'Decorate', 'tpp.hud.done': 'Done', 'tpp.stars.label': '{stars} / {max} ★',
  'tpp.chooser.empty': 'Nothing you own fits this spot yet.', 'tpp.sheet.replace': 'Replace', 'tpp.sheet.remove': 'Remove',
  'tpp.bubble.love': 'Just right!', 'tpp.bubble.like': 'I like this.', 'tpp.bubble.dislike': 'Not quite my thing.',
  'tpp.bubble.interrupted': 'Where did it go?', 'tpp.bubble.greeting': 'Hello!', 'tpp.bubble.want': 'Something {tag} would be lovely.',
  'tpp.bubble.wantHidden': 'Watch its reactions.', 'tpp.bubble.chatter': 'A thought to share.',
}).map(([key, value]) => ({ file: 'strings.json', path: `/${key}`, value }));

export type DesignSetup = { context: ViewContext; scene: InteriorScene; root: HTMLElement; panels: Panels; state: () => GameState };
export type SetupOptions = { mode?: 'play' | 'design'; patches?: Patch[]; edit?: (state: GameState) => void; images?: string[]; omitAssets?: string[] };

/** FX-CONTENT-MIN Dog room (intro done) with the overlay panels mounted and the Interior booted in the harness. */
export async function designSetup(options: SetupOptions = {}): Promise<DesignSetup> {
  const content = loadContent(manifest, patchFiles(files(), [...REAL_STRINGS, ...(options.patches ?? [])]));
  const state = designIn(content);
  state.mode = options.mode ?? 'design';
  options.edit?.(state);
  const context = contextFor(content, state);
  const omit = new Set(options.omitAssets ?? []);
  context.manifest = { ...context.manifest, entries: context.manifest.entries.filter(e => !omit.has(e.id)) };
  const host = document.createElement('div'); document.body.append(host);
  const panels = mountOverlay(host, context)!;
  const scene = await bootScene(InteriorScene, context, { roomId: 'dog-room' }, options.images ?? ['charms/lamp', 'rooms/fixture']);
  scene.cameras.main.emit('camerafadeincomplete');
  return { context, scene, root: host.querySelector<HTMLElement>('#panels')!, panels, state: () => context.store.getState() };
}

let nextId = 1;
/** A synthetic pointer through the scene's own handlers (GAP-5): `ms` after the down, moved `dx` px. */
export function pointer(scene: InteriorScene, x: number, y: number, { ms = 60, dx = 0, id = nextId++ } = {}): void {
  const down: ScenePointer = { id, worldX: x, worldY: y, downTime: 1000, upTime: 0 };
  scene.pointerDown(down);
  scene.pointerUp({ ...down, worldX: x + dx, upTime: 1000 + ms });
}

/** Log lines of the given types without their `t`/`wall` stamps. */
export const linesOf = (context: ViewContext, ...types: string[]) =>
  context.log.lines().filter(l => types.includes(l.type)).map(line => {
    const rest: Record<string, unknown> = { ...line };
    delete rest.t; delete rest.wall;
    return rest;
  });
export const click = (el: Element | null) => { if (!el) throw new Error('missing element'); (el as HTMLElement).click(); };

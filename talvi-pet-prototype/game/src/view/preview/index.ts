import type Phaser from 'phaser';
import type { ViewContext } from '../context';
import { outlinePoints } from '../objects/SlotOutline';
import type { InteriorScene } from '../scenes/InteriorScene';
import { createFillLayer } from './fillLayer';
import { createGeometryLayer } from './geometryLayer';
import { COLOURS, noPreview, PREVIEW_DEPTH, PREVIEW_LAYERS, type PreviewFlags, type PreviewLayer, type PreviewLayerName } from './layer';
import { createPetsLayer } from './petsLayer';
import { createSegmentsLayer } from './segmentsLayer';

export { noPreview, PREVIEW_LAYERS, PREVIEW_DEPTH, type PreviewFlags, type PreviewLayerName } from './layer';

/** `?preview=fill,pets,geometry,segments` (dev only): the flags at boot; unknown names are ignored. */
export function previewFlagsFrom(search: string): PreviewFlags | null {
  const raw = new URLSearchParams(search).get('preview');
  if (raw === null) return null;
  const names = new Set(raw.split(',').map(s => s.trim()));
  return Object.fromEntries(PREVIEW_LAYERS.map(name => [name, names.has(name)])) as PreviewFlags;
}

export type Preview = {
  readonly layers: Partial<Record<PreviewLayerName, PreviewLayer>>;
  /** Slot polygon strokes at α .5 shown in play mode while fill/pets/geometry is on (design mode's SlotOutline owns them otherwise). */
  readonly outlineStroke: Phaser.GameObjects.Graphics | null;
  sync(): void;
  destroy(): void;
};

/** The layers a world scene offers: all four on the Interior, the geometry layer on the Street. */
export function layersFor(kind: 'interior' | 'street'): Partial<Record<PreviewLayerName, PreviewLayer>> {
  if (kind === 'street') return { geometry: createGeometryLayer('street') };
  return { fill: createFillLayer(), pets: createPetsLayer(), geometry: createGeometryLayer('interior'), segments: createSegmentsLayer() };
}

function slotStroke(scene: InteriorScene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(PREVIEW_DEPTH).setVisible(false);
  g.lineStyle(3, COLOURS.slot, 0.5);
  for (const slot of scene.room.slots) { const points = outlinePoints(slot); g.strokePoints([...points, points[0]]); }
  return g;
}

/** TOOL-002 stage 1: follows `context.preview` each frame (a poll in `update`, so a scene change restores the flags); view-only, never dispatches. */
export function previewLayers(scene: Phaser.Scene, context: ViewContext, kind: 'interior' | 'street'): Preview {
  const layers = layersFor(kind);
  const shown = new Set<PreviewLayerName>();
  const outlineStroke = kind === 'interior' ? slotStroke(scene as InteriorScene) : null;
  const sync = () => {
    const flags = context.preview ?? noPreview();
    for (const name of PREVIEW_LAYERS) {
      const layer = layers[name];
      if (!layer) continue;
      if (flags[name] && !shown.has(name)) { layer.show(scene, context); shown.add(name); }
      else if (!flags[name] && shown.has(name)) { layer.hide(); shown.delete(name); }
    }
    if (shown.has('fill')) (layers.fill as ReturnType<typeof createFillLayer>).rehide();
    outlineStroke?.setVisible(context.store.getState().mode === 'play' && (flags.fill || flags.pets || flags.geometry));
  };
  sync();
  return {
    layers, outlineStroke, sync,
    destroy() { for (const layer of Object.values(layers)) layer.destroy(); shown.clear(); outlineStroke?.destroy(); },
  };
}

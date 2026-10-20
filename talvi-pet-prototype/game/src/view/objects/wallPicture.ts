import type Phaser from 'phaser';

export type WallSide = 'left' | 'right';
type Bounds = { left: number; top: number; right: number; bottom: number };
export const PAINTING_WALL_PROFILE = {
  version: 'painting-wall-v1',
  sourceHash: '8dcb5496879c2d681f61ad140ae333732d1afe7fcc4f54bd7566e4c5739b7698',
  width: 128, height: 128, xScale: Math.cos(Math.PI / 6), sourceDeskew: 0.10,
} as const;

function occupiedBounds(data: Uint8ClampedArray, width: number, a = 1, b = 0, threshold = 1): Bounds {
  const bounds = { left: Infinity, top: Infinity, right: -Infinity, bottom: -Infinity };
  for (let i = 0; i < data.length / 4; i++) {
    if (data[i * 4 + 3] < threshold) continue;
    const x = i % width, y = Math.floor(i / width);
    for (const dx of [0, 1]) for (const dy of [0, 1]) {
      const px = a * (x + dx), py = y + dy + b * (x + dx);
      bounds.left = Math.min(bounds.left, px); bounds.right = Math.max(bounds.right, px);
      bounds.top = Math.min(bounds.top, py); bounds.bottom = Math.max(bounds.bottom, py);
    }
  }
  if (!Number.isFinite(bounds.left)) throw new Error('Wall picture has no visible pixels');
  return bounds;
}

export function wallPictureTexture(scene: Phaser.Scene, assetId: string, sourceHash: string, side: WallSide) {
  const p = PAINTING_WALL_PROFILE;
  if (assetId !== 'charms/painting' || sourceHash !== p.sourceHash) throw new Error('Wall picture requires a reviewed source/profile');
  const source = scene.textures.get(assetId).getSourceImage() as HTMLImageElement;
  if (source.width !== p.width || source.height !== p.height) throw new Error('Wall picture source must be 128×128');
  const canvas = document.createElement('canvas'); canvas.width = p.width; canvas.height = p.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const data = ctx.getImageData(0, 0, p.width, p.height).data;
  const left = occupiedBounds(data, p.width, p.xScale, -0.5 - p.sourceDeskew);
  const right = occupiedBounds(data, p.width, p.xScale, 0.5 - p.sourceDeskew);
  const scale = Math.min(1, p.width / Math.max(left.right - left.left, right.right - right.left),
    p.height / Math.max(left.bottom - left.top, right.bottom - right.top));
  const projected = side === 'left' ? left : right, b = (side === 'left' ? -0.5 : 0.5) - p.sourceDeskew;
  const tx = p.width / 2 - scale * (projected.left + projected.right) / 2, ty = p.height - scale * projected.bottom;
  const key = `__derived/${p.version}/${sourceHash}/${side}`;
  if (!scene.textures.exists(key)) {
    const texture = scene.textures.createCanvas(key, p.width, p.height);
    if (!texture) throw new Error('Unable to allocate wall picture texture');
    const out = texture.getContext();
    out.imageSmoothingEnabled = true; out.imageSmoothingQuality = 'high';
    out.setTransform(scale * p.xScale, scale * b, 0, scale, tx, ty);
    out.drawImage(source, 0, 0); out.resetTransform(); texture.refresh();
  }
  const output = scene.textures.get(key) as Phaser.Textures.CanvasTexture;
  const rgba = output.getContext().getImageData(0, 0, p.width, p.height).data;
  const alphaBounds = occupiedBounds(rgba, p.width), opaqueBounds = occupiedBounds(rgba, p.width, 1, 0, 128);
  return { key, evidence: { profile: p.version, sourceHash, side, canvas: [p.width, p.height],
    matrix: [scale * p.xScale, scale * b, 0, scale, tx, ty], commonScale: scale,
    sourceBounds: occupiedBounds(data, p.width), projected, alphaBounds, opaqueBounds,
    sideMargins: [alphaBounds.left, p.width - alphaBounds.right],
    bottomGap: p.height - alphaBounds.bottom, centreOffset: Math.abs((alphaBounds.left + alphaBounds.right) / 2 - p.width / 2) } };
}

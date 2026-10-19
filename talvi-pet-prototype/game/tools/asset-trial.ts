// Disposable TASK-064 validation support. Tools normally exclude engine imports;
// this explicitly authorized, development-only entrypoint inspects Phaser textures.
// eslint-disable-next-line no-restricted-imports
import Phaser from 'phaser';
import { AssetManifest, type AssetEntry } from '../src/content/schema/assets';
import { RoomSchema, type Room } from '../src/content/schema/room';
import { CharmsSchema } from '../src/content/schema/charms';
import './asset-trial.css';

type LoadRow = { id: string; status: string; url?: string; source?: string; ledgerHash?: string; actualHash?: string; hashMatches?: boolean; declared?: { w: number; h: number }; decoded?: { w: number; h: number }; textureSource?: string; error?: string };
type Placement = { slot: string; id: string; sizeClass: string; x: number; y: number; depth: number; w: number; h: number };
const params = new URLSearchParams(location.search);
const height = params.get('height') === '823' ? 823 : 1080;
const mode = params.get('mode') === 'room' ? 'room' : 'fill';
const guides = params.get('guides') !== '0';
const bounds = params.get('bounds') === '1';
const report = { scope: 'Selected asset import and authored alignment only; no full-content or gameplay validation', phase: 'loading', phaser: Phaser.VERSION, viewport: { w: 1920, h: height }, cameraScrollY: (1080 - height) / 2, mode, guides, bounds, manifestUrl: params.get('failure') === 'manifest' ? '/assets/__asset-trial-missing-manifest.json' : '/assets/manifest.json', inputHashes: {} as Record<string, string>, assets: [] as LoadRow[], loadErrors: [] as string[], decodeErrors: [] as string[], placements: [] as Placement[], canvasOverlaps: [] as string[], missingSlots: [] as string[], fatal: '' };
Object.assign(window, { assetTrial: report });
const element = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const refreshReport = () => { element('report').textContent = JSON.stringify(report, null, 2); };
const hash = async (bytes: ArrayBuffer) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
async function inputJson(url: string): Promise<unknown> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer(); report.inputHashes[url] = await hash(bytes);
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Error(`${url}: response is not JSON (missing file or server fallback)`); }
}
function controls(): void {
  element<HTMLSelectElement>('height').value = String(height); element<HTMLSelectElement>('mode').value = mode;
  element<HTMLInputElement>('guides').checked = guides; element<HTMLInputElement>('bounds').checked = bounds;
  element('controls').addEventListener('change', () => {
    const next = new URL(location.href);
    next.searchParams.set('height', element<HTMLSelectElement>('height').value);
    next.searchParams.set('mode', element<HTMLSelectElement>('mode').value);
    next.searchParams.set('guides', element<HTMLInputElement>('guides').checked ? '1' : '0');
    next.searchParams.set('bounds', element<HTMLInputElement>('bounds').checked ? '1' : '0');
    location.assign(next);
  });
  element('reload').onclick = () => { const next = new URL(location.href); next.searchParams.delete('failure'); location.assign(next); };
  element('stage').style.aspectRatio = `1920 / ${height}`;
  element('mapping').textContent = `World 1920 × 1080 → viewport 1920 × ${height}; camera scroll (0, ${report.cameraScrollY}). Viewport y = world y − ${report.cameraScrollY}. Background origin (0,0); charms origin (0.5,1), scale 1, depth = authored override or base y.`;
}
function drawGuides(scene: Phaser.Scene, room: Room): void {
  const g = scene.add.graphics().setDepth(10000);
  g.lineStyle(3, 0x287dbe, 0.9).strokeRect(0, 128.5, 1920, 823);
  g.lineStyle(3, 0x139151, 0.95).strokePoints(room.walkArea.map(p => new Phaser.Math.Vector2(p.x, p.y)), true);
  const label = (x: number, y: number, text: string, color = '#075264') => scene.add.text(x, y, text, { fontFamily: 'monospace', fontSize: '15px', color, backgroundColor: '#fffaf0e8', padding: { x: 3, y: 2 } }).setDepth(10001);
  for (const s of room.slots) {
    g.lineStyle(2, 0xdc8422, 0.8).lineBetween(s.x, s.y, s.anchor.x, s.anchor.y);
    g.fillStyle(0xdc8422).fillCircle(s.anchor.x, s.anchor.y, 6);
    g.lineStyle(3, 0x087f9b).strokeCircle(s.x, s.y, 9).lineBetween(s.x - 13, s.y, s.x + 13, s.y).lineBetween(s.x, s.y - 13, s.x, s.y + 13);
    label(s.x + 12, s.y + 7, `${s.id} (${s.x},${s.y})`);
  }
  for (const d of room.doors) { g.lineStyle(3, 0xaa368b).strokeRect(d.rect.x, d.rect.y, d.rect.w, d.rect.h); label(d.rect.x, d.rect.y - 22, d.id, '#aa368b'); }
  for (const p of room.wanderPoints) g.fillStyle(0x139151).fillCircle(p.x, p.y, 5);
  g.lineStyle(3, 0x555555).strokeCircle(room.petSpawn.x, room.petSpawn.y, 12);
}
function overlapReport(): void {
  const a = report.placements;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const x = a[i], y = a[j];
    if (Math.abs(x.x - y.x) < (x.w + y.w) / 2 && Math.max(x.y - x.h, y.y - y.h) < Math.min(x.y, y.y)) report.canvasOverlaps.push(`${x.slot} / ${y.slot}`);
  }
}
async function start(): Promise<void> {
  controls();
  if (!import.meta.env.DEV) throw new Error('Asset inspection is available only in the Vite development server.');
  const manifest = AssetManifest.parse(await inputJson(report.manifestUrl));
  const room = RoomSchema.parse(await inputJson('/src/content/rooms/dog-room.json'));
  const charms = CharmsSchema.parse(await inputJson('/src/content/charms.json'));
  const ids = [room.background, 'charms/dog-bed', 'charms/lamp', 'charms/painting'];
  const queued: { entry: AssetEntry; row: LoadRow; blobUrl: string }[] = [];
  for (const id of ids) {
    const entry = manifest.entries.find(e => e.id === id);
    const row: LoadRow = { id, status: entry ? 'fetching' : 'missing-manifest-entry' }; report.assets.push(row);
    if (!entry) continue;
    row.source = entry.source; row.ledgerHash = entry.hash; row.declared = entry.px;
    if (entry.type !== 'image' || entry.html || !entry.url) { row.status = 'unsupported-selected-entry'; continue; }
    row.url = params.get('failure') === 'asset' && id === 'charms/lamp' ? '/assets/__asset-trial-missing-lamp.png' : new URL(entry.url, new URL('/assets/', location.href)).href;
    try {
      const response = await fetch(row.url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = await response.arrayBuffer(); row.actualHash = await hash(bytes); row.hashMatches = row.actualHash === row.ledgerHash;
      const blobUrl = URL.createObjectURL(new Blob([bytes], { type: response.headers.get('content-type') ?? 'application/octet-stream' }));
      row.status = 'queued'; queued.push({ entry, row, blobUrl });
    } catch (error) { row.status = 'fetch-error'; row.error = String(error); }
  }
  class AssetTrialScene extends Phaser.Scene {
    constructor() { super('AssetTrial'); }
    preload(): void {
      this.load.on('loaderror', (file: Phaser.Loader.File) => { report.loadErrors.push(file.key); const row = report.assets.find(e => e.id === file.key); if (row) { row.status = 'phaser-loaderror'; row.error = `Phaser could not decode ${row.url}`; } });
      for (const item of queued) this.load.image(item.entry.id, item.blobUrl);
    }
    create(): void {
      this.cameras.main.setScroll(0, report.cameraScrollY);
      for (const { entry, row, blobUrl } of queued) {
        if (this.textures.exists(entry.id)) {
          const source = this.textures.get(entry.id).getSourceImage() as HTMLImageElement;
          row.decoded = { w: source.width, h: source.height }; row.textureSource = source.src;
          row.status = row.hashMatches && source.width === entry.px?.w && source.height === entry.px?.h ? 'loaded-verified' : 'loaded-metadata-mismatch';
        }
        if (!this.textures.exists(entry.id) && row.status === 'queued') {
          row.status = 'phaser-decode-error'; row.error = 'Loader completed without a texture (image processing failed)'; report.decodeErrors.push(entry.id);
        }
        URL.revokeObjectURL(blobUrl);
      }
      if (this.textures.exists(room.background)) this.add.image(0, 0, room.background).setOrigin(0).setDepth(0);
      if (mode === 'fill') for (const slot of room.slots) {
        const charm = charms.types.find(c => c.sizeClass === slot.sizeClass && ids.includes(c.sprite));
        if (!charm || !this.textures.exists(charm.sprite)) { report.missingSlots.push(slot.id); continue; }
        const sprite = this.add.image(slot.x, slot.y, charm.sprite).setOrigin(0.5, 1).setDepth(slot.depthOverride ?? slot.y);
        report.placements.push({ slot: slot.id, id: charm.sprite, sizeClass: slot.sizeClass, x: slot.x, y: slot.y, depth: sprite.depth, w: sprite.width, h: sprite.height });
        if (bounds) this.add.graphics().lineStyle(2, 0xae3b91, 0.8).strokeRect(slot.x - sprite.width / 2, slot.y - sprite.height, sprite.width, sprite.height).setDepth(9999);
      }
      if (guides) drawGuides(this, room);
      overlapReport(); report.phase = 'ready';
      const good = report.assets.filter(a => a.status === 'loaded-verified').length;
      element('status').textContent = `${good}/${ids.length} selected files verified · ${report.loadErrors.length} Phaser load errors / ${report.decodeErrors.length} decode errors · ${report.placements.length}/${mode === 'fill' ? room.slots.length : 0} representative placements. Missing files are omitted; inspect the report.`;
      refreshReport();
    }
  }
  new Phaser.Game({ type: Phaser.WEBGL, parent: 'game', backgroundColor: '#eee9df', scale: { mode: Phaser.Scale.FIT, width: 1920, height, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true, roundPixels: false, pixelArt: false }, audio: { noAudio: true }, scene: [AssetTrialScene] });
}
void start().catch(error => { report.phase = 'failed'; report.fatal = String(error); element('status').textContent = `Inspection stopped: ${report.fatal}`; refreshReport(); });

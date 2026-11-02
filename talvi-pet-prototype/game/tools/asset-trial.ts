// Disposable TASK-064 / TASK-074 (WORK-013G) / TASK-081 (WORK-013H) / TASK-083 (WORK-013J) validation support. Tools normally exclude engine imports;
// this explicitly authorized, development-only entrypoint inspects Phaser textures.
// eslint-disable-next-line no-restricted-imports
import Phaser from 'phaser';
// Bounded diagnostic uses the maintained world-view component.
// eslint-disable-next-line no-restricted-imports
import { CharmSprite } from '../src/view/objects/CharmSprite';
// eslint-disable-next-line no-restricted-imports
import { registerClips, clipKey } from '../src/view/anims';
import { AssetManifest, type AssetEntry } from '../src/content/schema/assets';
import { RoomSchema, type Room } from '../src/content/schema/room';
import { CharmsSchema } from '../src/content/schema/charms';
import './asset-trial.css';

type LoadRow = { id: string; status: string; url?: string; source?: string; ledgerHash?: string; actualHash?: string; hashMatches?: boolean; declared?: { w: number; h: number }; decoded?: { w: number; h: number }; textureSource?: string; error?: string };
type FrameEvent = { t: number; frame: number; event: 'start' | 'update' | 'repeat' };
type OpaqueBox = { x: number; y: number; w: number; h: number };
type Placement = { slot: string; id: string; sizeClass: string; x: number; y: number; depth: number; w: number; h: number; textureKey: string; wallProjection?: CharmSprite['wallProjection'] };
const params = new URLSearchParams(location.search);
const height = params.get('height') === '823' ? 823 : 1080;
const mode = params.get('mode') === 'room' ? 'room' : 'fill';
const guides = params.get('guides') !== '0';
const bounds = params.get('bounds') === '1';
// CN-12 (WORK-013J): row 2 `use` became `use-sit`; rows 4 and 5 add `use-lie` and `use-look`.
// WORK-022-1 (gate fork Q-A): the Owl sheet adds `use-perch` in row 6; `?sheet=pets/owl-sheet` inspects it on the Dog room's petSpawn.
// WORK-026-1 (ASSET-016 + gate fork Q-A): `?sheet=player/avatar-sheet` plays the six avatar clips on the same spawn.
// WORK-034-1 (DEC-044, gate fork 10): `?sheet=pets/owl-mate-sheet` plays the Owl mate recolour (same clips as the Owl) on the same spawn.
const clips = ['idle', 'walk', 'use-sit', 'react', 'use-lie', 'use-look', 'use-perch', 'idle-down', 'idle-up', 'idle-side', 'walk-down', 'walk-up', 'walk-side'];
const clip = clips.includes(params.get('clip') ?? '') ? params.get('clip')! : 'idle';
const showPet = params.get('pet') !== '0';
const showBubble = params.get('bubble') === '1';
// ?at=<slotId> stands the Dog on that slot's pet anchor with the anchor's facing (authored room content) instead of room.petSpawn.
const atSlot = params.get('at') ?? '';
// TASK-080 (WORK-013H): the bubble anchor keeps the contract's margin above the measured idle head. The contract offset 236 was
// set against the pre-re-fit sheet (Git b753fa6), whose idle frame 0 opaque top was 222 px above the base: margin 236 − 222 = 14.
const SHEET = params.get('sheet') ?? 'pets/dog-sheet', CONTRACT_BUBBLE_OFFSET = 236, CONTRACT_IDLE_HEAD_TOP = 222, BUBBLE_MARGIN = CONTRACT_BUBBLE_OFFSET - CONTRACT_IDLE_HEAD_TOP;
let bubbleOffset = CONTRACT_BUBBLE_OFFSET;
// TASK-081 (WORK-013H, CN-10): flat, strokeless thought bubble with the panels-gallery geometry (tools/panels.css). Offsets are from
// the anchor: the 168×128 ellipse body sits above-right and the smallest tail circle's bottom touches the anchor. The 96 px tag
// texture is shown at the gallery's 72 px.
const BUBBLE = { icon: 'ui/tag-soft', iconSize: 72, fill: 0xfffdf8, shadow: 0x3a2a1f, depth: 9000, body: { w: 168, h: 128, dx: 52, dy: -107 }, tail: [{ dx: 18, dy: -30, r: 12 }, { dx: 0, dy: -7, r: 7 }] };
type BubbleReport = { shown: boolean; drawn?: boolean; anchor?: { x: number; y: number }; body?: { x: number; y: number; w: number; h: number; shape: string }; tail?: { x: number; y: number; r: number }[]; fill?: string; stroke?: string; shadow?: string; depth?: number; icon?: { id: string; x: number; y: number; w: number; h: number; native: [number, number]; offsetFromBodyCentre: [number, number] } | string };
const report = { scope: 'Selected asset import and authored alignment only; no full-content or gameplay validation', phase: 'loading', phaser: Phaser.VERSION, viewport: { w: 1920, h: height }, cameraScrollY: (1080 - height) / 2, mode, guides, bounds, manifestUrl: params.get('failure') === 'manifest' ? '/assets/__asset-trial-missing-manifest.json' : '/assets/manifest.json', inputHashes: {} as Record<string, string>, assets: [] as LoadRow[], loadErrors: [] as string[], decodeErrors: [] as string[], placements: [] as Placement[], pet: { shown: showPet, clip, at: atSlot || 'petSpawn', key: '', x: 0, y: 0, facing: '', flipX: false, origin: [0.5, 1], scale: 1, depth: 0, bubbleAnchor: { x: 0, y: 0 }, bubbleOffset: { idleHeadTop: 0, margin: BUBBLE_MARGIN, offset: 0 }, textureFrames: 0, keysRegistered: [] as string[], keysPresent: {} as Record<string, boolean>, declaredDurations: [] as number[], omitted: '' }, idleTiming: { events: [] as FrameEvent[], cycles: 0, measuredMs: [] as number[][], meanMs: [] as number[], displayFrameMs: 0 }, opaque: {} as Record<string, OpaqueBox | null>, bubble: { shown: showBubble } as BubbleReport, canvasOverlaps: [] as string[], missingSlots: [] as string[], fatal: '' };
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
  element<HTMLSelectElement>('clip').value = clip; element<HTMLSelectElement>('sheet').value = SHEET; element<HTMLInputElement>('pet').checked = showPet; element<HTMLInputElement>('bubble').checked = showBubble;
  element('controls').addEventListener('change', () => {
    const next = new URL(location.href);
    next.searchParams.set('height', element<HTMLSelectElement>('height').value);
    next.searchParams.set('mode', element<HTMLSelectElement>('mode').value);
    next.searchParams.set('guides', element<HTMLInputElement>('guides').checked ? '1' : '0');
    next.searchParams.set('bounds', element<HTMLInputElement>('bounds').checked ? '1' : '0');
    next.searchParams.set('clip', element<HTMLSelectElement>('clip').value);
    next.searchParams.set('sheet', element<HTMLSelectElement>('sheet').value);
    next.searchParams.set('pet', element<HTMLInputElement>('pet').checked ? '1' : '0');
    next.searchParams.set('bubble', element<HTMLInputElement>('bubble').checked ? '1' : '0');
    location.assign(next);
  });
  element('reload').onclick = () => { const next = new URL(location.href); next.searchParams.delete('failure'); location.assign(next); };
  element('stage').style.aspectRatio = `1920 / ${height}`;
  element('mapping').textContent = `World 1920 × 1080 → viewport 1920 × ${height}; camera scroll (0, ${report.cameraScrollY}). Viewport y = world y − ${report.cameraScrollY}. Background origin (0,0); charms origin (0.5,1), scale 1, depth = authored override or base y. Dog: ${atSlot ? `slot ${atSlot} pet anchor` : 'room.petSpawn'}, origin (0.5,1), scale 1, flipX when facing left (sheet faces right), depth = y, bubble anchor y − (measured idle head top + ${BUBBLE_MARGIN}).`;
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
  if (showPet) {
    const bx = standingSpot(room).x, by = standingSpot(room).y - bubbleOffset;
    g.lineStyle(3, 0xb5523f).strokeCircle(bx, by, 10).lineBetween(bx - 18, by, bx + 18, by).lineBetween(bx, by - 18, bx, by + 18);
    label(bx + 16, by - 30, `bubble anchor (${bx},${by}) = ${atSlot || 'spawn'} y − ${bubbleOffset} (idle head top ${bubbleOffset - BUBBLE_MARGIN} + ${BUBBLE_MARGIN})`, '#b5523f');
  }
}
/** Want bubble: fill only (no line style anywhere), tail bottom on the anchor, icon centred in the body, depth above the Dog. */
function drawBubble(scene: Phaser.Scene, ax: number, ay: number): void {
  const { body, tail } = BUBBLE, cx = ax + body.dx, cy = ay + body.dy, g = scene.add.graphics().setDepth(BUBBLE.depth);
  const shapes = (grow: number, dy: number) => { g.fillEllipse(cx, cy + dy, body.w + grow * 2, body.h + grow * 2); for (const t of tail) g.fillCircle(ax + t.dx, ay + t.dy + dy, t.r + grow); };
  // Soft drop shadow without a blur: three widening low-alpha layers 4 px below, matching the gallery's drop-shadow(0 4px 6px).
  for (const grow of [3, 1.5, 0]) { g.fillStyle(BUBBLE.shadow, 0.06); shapes(grow, 4); }
  g.fillStyle(BUBBLE.fill, 1); shapes(0, 0);
  const icon = scene.textures.exists(BUBBLE.icon) ? scene.add.image(cx, cy, BUBBLE.icon).setDisplaySize(BUBBLE.iconSize, BUBBLE.iconSize).setDepth(BUBBLE.depth + 1) : undefined;
  Object.assign(report.bubble, {
    drawn: true, anchor: { x: ax, y: ay }, body: { x: cx, y: cy, w: body.w, h: body.h, shape: 'ellipse' }, tail: tail.map(t => ({ x: ax + t.dx, y: ay + t.dy, r: t.r })),
    fill: '#fffdf8', stroke: 'none', shadow: '#3a2a1f, 3 layers × alpha 0.06, offset (0, 4), grow 3/1.5/0 px', depth: BUBBLE.depth,
    icon: icon ? { id: BUBBLE.icon, x: icon.x, y: icon.y, w: icon.displayWidth, h: icon.displayHeight, native: [icon.width, icon.height], offsetFromBodyCentre: [icon.x - cx, icon.y - cy] } : `${BUBBLE.icon} not loaded`,
  });
}
/** Opaque (alpha > 0) bounding box of one texture frame, in frame pixels; measured from the decoded source image. */
function opaqueBox(source: HTMLImageElement, fx = 0, fy = 0, fw = source.width, fh = source.height): OpaqueBox | null {
  const canvas = document.createElement('canvas'); canvas.width = fw; canvas.height = fh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(source, fx, fy, fw, fh, 0, 0, fw, fh);
  const data = ctx.getImageData(0, 0, fw, fh).data; let x0 = fw, y0 = fh, x1 = -1, y1 = -1;
  for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) if (data[(y * fw + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** Per-cycle on-screen frame durations from animation event timestamps (frame index 0..n-1 within the clip). */
function summariseIdleTiming(frameCount: number): void {
  const t = report.idleTiming, starts = t.events.filter((e, i, a) => i === 0 || e.frame !== a[i - 1].frame);
  const cycles: number[][] = [];
  for (let i = 0; i + frameCount < starts.length; i++) {
    if (starts[i].frame !== 0) continue;
    const seq = starts.slice(i, i + frameCount + 1);
    if (seq.every((e, k) => e.frame === k % frameCount)) cycles.push(seq.slice(0, frameCount).map((e, k) => Math.round((seq[k + 1].t - e.t) * 10) / 10));
  }
  t.measuredMs = cycles; t.cycles = cycles.length;
  t.meanMs = cycles.length ? Array.from({ length: frameCount }, (_, k) => Math.round(cycles.reduce((sum, c) => sum + c[k], 0) / cycles.length * 10) / 10) : [];
}
function overlapReport(): void {
  const a = report.placements;
  for (let i = 0; i < a.length; i++) for (let j = i + 1; j < a.length; j++) {
    const x = a[i], y = a[j];
    if (Math.abs(x.x - y.x) < (x.w + y.w) / 2 && Math.max(x.y - x.h, y.y - y.h) < Math.min(x.y, y.y)) report.canvasOverlaps.push(`${x.slot} / ${y.slot}`);
  }
}
/** Where the Dog stands: the ?at= slot's pet anchor (and facing), else room.petSpawn. */
function standingSpot(room: Room): { x: number; y: number; facing: string } {
  if (!atSlot) return room.petSpawn;
  const slot = room.slots.find(s => s.id === atSlot);
  if (!slot) throw new Error(`?at=${atSlot}: no slot with that id in ${room.id}`);
  return slot.anchor;
}
async function start(): Promise<void> {
  controls();
  if (!import.meta.env.DEV) throw new Error('Asset inspection is available only in the Vite development server.');
  const manifest = AssetManifest.parse(await inputJson(report.manifestUrl));
  const room = RoomSchema.parse(await inputJson('/src/content/rooms/dog-room.json'));
  const charms = CharmsSchema.parse(await inputJson('/src/content/charms.json'));
  const ids = [room.background, 'charms/dog-bed', 'charms/lamp', 'charms/painting', SHEET, ...(showBubble ? [BUBBLE.icon] : [])];
  const queued: { entry: AssetEntry; row: LoadRow; blobUrl: string }[] = [];
  for (const id of ids) {
    const entry = manifest.entries.find(e => e.id === id);
    const row: LoadRow = { id, status: entry ? 'fetching' : 'missing-manifest-entry' }; report.assets.push(row);
    if (!entry) continue;
    row.source = entry.source; row.ledgerHash = entry.hash; row.declared = entry.px;
    if ((entry.type !== 'image' && !(entry.type === 'spritesheet' && id === SHEET)) || entry.html || !entry.url) { row.status = 'unsupported-selected-entry'; continue; }
    const probe = (params.get('failure') === 'asset' && id === 'charms/lamp') || (params.get('failure') === 'sheet' && id === SHEET);
    row.url = probe ? `/assets/__asset-trial-missing-${id === SHEET ? 'dog-sheet' : 'lamp'}.png` : new URL(entry.url, new URL('/assets/', location.href)).href;
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
      for (const item of queued) {
        if (item.entry.type === 'spritesheet' && item.entry.frame) this.load.spritesheet(item.entry.id, item.blobUrl, { frameWidth: item.entry.frame.w, frameHeight: item.entry.frame.h });
        else this.load.image(item.entry.id, item.blobUrl);
      }
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
      // Room mode still draws the charm of the ?at= slot (e.g. the bed at large-1) so the Dog is seen using it.
      for (const slot of room.slots.filter(s => mode === 'fill' || s.id === atSlot)) {
        const charm = charms.types.find(c => c.sizeClass === slot.sizeClass && ids.includes(c.sprite));
        if (!charm || !this.textures.exists(charm.sprite)) { report.missingSlots.push(slot.id); continue; }
        const sourceHash = report.assets.find(a => a.id === charm.sprite)?.actualHash ?? '';
        const sprite = new CharmSprite(this, slot.x, slot.y, charm.sprite,
          slot.wall && charm.sprite === 'charms/painting' ? { side: slot.wall, sourceHash } : undefined).setDepth(slot.depthOverride ?? slot.y);
        report.placements.push({ slot: slot.id, id: charm.sprite, sizeClass: slot.sizeClass, x: slot.x, y: slot.y, depth: sprite.depth, w: sprite.width, h: sprite.height, textureKey: sprite.texture.key, wallProjection: sprite.wallProjection });
        if (bounds) this.add.graphics().lineStyle(2, 0xae3b91, 0.8).strokeRect(slot.x - sprite.width / 2, slot.y - sprite.height, sprite.width, sprite.height).setDepth(9999);
      }
      for (const id of ['charms/dog-bed', 'charms/lamp']) if (this.textures.exists(id)) report.opaque[id] = opaqueBox(this.textures.get(id).getSourceImage() as HTMLImageElement);
      this.placePet(room, manifest.entries.find(e => e.id === SHEET));
      if (showBubble) drawBubble(this, standingSpot(room).x, standingSpot(room).y - bubbleOffset);
      if (guides) drawGuides(this, room);
      overlapReport(); report.phase = 'ready';
      const good = report.assets.filter(a => a.status === 'loaded-verified').length;
      element('status').textContent = `${good}/${ids.length} selected files verified · ${report.loadErrors.length} Phaser load errors / ${report.decodeErrors.length} decode errors · ${report.placements.length}/${mode === 'fill' ? room.slots.length : 0} representative placements · Dog ${report.pet.key ? `${report.pet.key} at (${report.pet.x},${report.pet.y})` : `omitted (${report.pet.omitted})`}. Missing files are omitted; inspect the report.`;
      refreshReport();
    }
    placePet(room: Room, entry: AssetEntry | undefined): void {
      if (!entry || !this.textures.exists(SHEET)) { report.pet.omitted = entry ? 'sheet texture not loaded' : 'no manifest entry'; return; }
      const texture = this.textures.get(SHEET);
      report.pet.textureFrames = texture.frameTotal - 1;
      report.pet.keysRegistered = registerClips(this, entry);
      for (const name of clips) { const key = clipKey(SHEET, name)!; report.pet.keysPresent[key] = this.anims.exists(key); }
      const key = clipKey(SHEET, clip)!, frames = entry.clips?.[clip];
      const source = texture.getSourceImage() as HTMLImageElement, fw = entry.frame!.w, fh = entry.frame!.h, cols = source.width / fw;
      for (const name of clips) { const c = entry.clips?.[name]; if (c) report.opaque[`${SHEET}#${name}${c.start}`] = opaqueBox(source, (c.start % cols) * fw, Math.floor(c.start / cols) * fh, fw, fh); }
      const idleTop = entry.clips?.idle ? report.opaque[`${SHEET}#idle${entry.clips.idle.start}`] : null;
      if (idleTop) { bubbleOffset = fh - idleTop.y + BUBBLE_MARGIN; report.pet.bubbleOffset = { idleHeadTop: fh - idleTop.y, margin: BUBBLE_MARGIN, offset: bubbleOffset }; }
      report.pet.declaredDurations = (this.anims.get(key)?.frames ?? []).map(f => f.duration || 1000 / (frames?.frameRate ?? 1));
      if (!showPet) { report.pet.omitted = '?pet=0'; return; }
      const { x, y, facing } = standingSpot(room);
      const pet = this.add.sprite(x, y, SHEET, frames?.start ?? 0).setOrigin(0.5, 1).setScale(1).setFlipX(facing === 'left').setDepth(y);
      Object.assign(report.pet, { key, x, y, facing, flipX: pet.flipX, depth: pet.depth, bubbleAnchor: { x, y: y - bubbleOffset } });
      if (clip === 'idle') {
        const stamp = (event: FrameEvent['event']) => (_a: Phaser.Animations.Animation, f: Phaser.Animations.AnimationFrame) => { report.idleTiming.events.push({ t: performance.now(), frame: f.index - 1, event }); };
        pet.on(Phaser.Animations.Events.ANIMATION_START, stamp('start')).on(Phaser.Animations.Events.ANIMATION_UPDATE, stamp('update')).on(Phaser.Animations.Events.ANIMATION_REPEAT, stamp('repeat'));
        this.time.addEvent({ delay: 1000, loop: true, callback: () => { summariseIdleTiming(frames!.end - frames!.start + 1); report.idleTiming.displayFrameMs = Math.round(this.game.loop.delta * 10) / 10; refreshReport(); } });
      }
      pet.play(key);
    }
  }
  const game = new Phaser.Game({ type: Phaser.WEBGL, parent: 'game', backgroundColor: '#eee9df', scale: { mode: Phaser.Scale.FIT, width: 1920, height, autoCenter: Phaser.Scale.CENTER_BOTH }, render: { antialias: true, roundPixels: false, pixelArt: false }, audio: { noAudio: true }, scene: [AssetTrialScene] });
  Object.assign(window, { assetTrialGame: game });
}
void start().catch(error => { report.phase = 'failed'; report.fatal = String(error); element('status').textContent = `Inspection stopped: ${report.fatal}`; refreshReport(); });

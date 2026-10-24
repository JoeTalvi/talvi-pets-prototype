import type Phaser from 'phaser';
import type { Point } from '@content/schema/common';
import type { Room } from '@content/schema/room';
import { segmentInPolygon } from '@sim/geometry';
import { COLOURS, LABEL_STYLE, objectBag, PREVIEW_DEPTH, roomOf, type PreviewLayer } from './layer';

export type Segment = { a: Point; b: Point; inside: boolean };

/** CHK-007-07's set, enumerated exactly as `src/sim/checks/chk-007.ts`: every unordered pair of {petSpawn} ∪ anchors ∪ wanderPoints ∪ door spawns. */
export function segmentsOf(room: Room): Segment[] {
  const points: Point[] = [room.petSpawn, ...room.slots.map(s => s.anchor), ...room.wanderPoints, ...room.doors.map(d => d.spawn)];
  const out: Segment[] = [];
  points.forEach((a, i) => points.slice(i + 1).forEach(b => out.push({ a, b, inside: segmentInPolygon(a, b, room.walkArea) })));
  return out;
}

/** MEC-007 §8: the segments drawn, green inside `walkArea`, red (3 px) where `segmentInPolygon` fails, with a count label. */
export function createSegmentsLayer(): PreviewLayer & { segments: Segment[]; label(): string } {
  const bag = objectBag();
  const segments: Segment[] = [];
  let text = '';
  const hide = () => { bag.clear(); segments.splice(0); text = ''; };
  return {
    objects: bag.objects, segments, hide, destroy: hide, label: () => text,
    show(target) {
      const room = roomOf(target);
      segments.push(...segmentsOf(room));
      const g: Phaser.GameObjects.Graphics = bag.add(target.add.graphics().setDepth(PREVIEW_DEPTH));
      for (const s of segments) {
        if (s.inside) g.lineStyle(1, COLOURS.ok, 0.8); else g.lineStyle(3, COLOURS.bad, 1);
        g.lineBetween(s.a.x, s.a.y, s.b.x, s.b.y);
      }
      text = `${segments.length} segments · ${segments.filter(s => !s.inside).length} outside`;
      bag.add(target.add.text(24, 140, text, LABEL_STYLE).setDepth(PREVIEW_DEPTH + 1));
    },
  };
}

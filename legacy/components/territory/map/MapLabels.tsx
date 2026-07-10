'use client';

import { memo, useMemo } from 'react';
import { geoBounds, geoPath, type GeoProjection } from 'd3-geo';

interface LabelGeo {
  rsmKey: string;
  name: string;
  geometry: unknown;
}

interface Props {
  geographies: LabelGeo[];
  projection: GeoProjection;
  zoom: number;
}

interface Rect { x1: number; y1: number; x2: number; y2: number }

function rectsOverlap(a: Rect, b: Rect): boolean {
  return !(a.x2 < b.x1 || b.x2 < a.x1 || a.y2 < b.y1 || b.y2 < a.y1);
}

export default memo(function MapLabels({ geographies, projection, zoom }: Props) {
  const placed = useMemo(() => {
    const path = geoPath(projection);
    type Candidate = { name: string; cx: number; cy: number; w: number; h: number; bboxW: number };

    const candidates: Candidate[] = [];
    for (const g of geographies) {
      const centroid = path.centroid(g.geometry as Parameters<typeof path.centroid>[0]);
      if (!centroid || isNaN(centroid[0])) continue;
      const [b0, b1] = geoBounds(g.geometry as Parameters<typeof geoBounds>[0]);
      const tl = projection([b0[0], b1[1]]);
      const br = projection([b1[0], b0[1]]);
      if (!tl || !br) continue;
      const bboxW = Math.abs(br[0] - tl[0]) * zoom;
      const fontPx = 10;
      const w = g.name.length * fontPx * 0.55;
      const h = fontPx * 1.1;
      if (bboxW < w + 4) continue;
      candidates.push({ name: g.name, cx: centroid[0], cy: centroid[1], w, h, bboxW });
    }

    candidates.sort((a, b) => b.bboxW - a.bboxW);
    const accepted: Candidate[] = [];
    const rects: Rect[] = [];
    for (const c of candidates) {
      const r: Rect = {
        x1: c.cx - c.w / 2,
        y1: c.cy - c.h / 2,
        x2: c.cx + c.w / 2,
        y2: c.cy + c.h / 2,
      };
      if (rects.some((existing) => rectsOverlap(existing, r))) continue;
      accepted.push(c);
      rects.push(r);
    }
    return accepted;
  }, [geographies, projection, zoom]);

  return (
    <g style={{ pointerEvents: 'none' }}>
      {placed.map((p) => (
        <text
          key={p.name}
          x={p.cx}
          y={p.cy}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={10 / zoom}
          fontWeight={500}
          fill="rgb(51 65 85 / 0.85)"
        >
          {p.name}
        </text>
      ))}
    </g>
  );
});

'use client';

import { useShallow } from 'zustand/react/shallow';
import { useGeoChildren, useMapTheme, useTerritoryStore } from '@/hooks/useTerritoryStore';
import type { GeoNode } from '@/types/territory';

/**
 * Bare-list variant of the legend. The outer chrome is provided by the
 * caller; this component renders only the title and dot rows.
 */
export default function MapLegend() {
  const roots = useGeoChildren(null);
  const theme = useMapTheme();
  const colorByRootId = useTerritoryStore(
    useShallow((s) => {
      const out: Record<string, string | null> = {};
      for (const r of roots) {
        out[r.id] = resolveColor(s.geoNodes, r.id);
      }
      return out;
    }),
  );

  if (roots.length === 0) return null;

  return (
    <div>
      <p className={theme.legendTitleClass}>Geos</p>
      <div className="flex flex-col gap-1.5">
        {roots.map((g) => {
          const color = colorByRootId[g.id] ?? theme.unassignedFill;
          return (
            <div key={g.id} className={theme.legendTextClass}>
              <span
                className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
                style={{ backgroundColor: color }}
              />
              <span className="max-w-[160px] truncate">{g.name}</span>
            </div>
          );
        })}
        <div className={`${theme.legendTextClass} opacity-60`}>
          <span
            className="inline-block h-2.5 w-2.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: theme.unassignedFill }}
          />
          <span>Unassigned</span>
        </div>
      </div>
    </div>
  );
}

function resolveColor(nodes: Record<string, GeoNode>, startId: string): string | null {
  let cur: string | null = startId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n: GeoNode | undefined = nodes[cur];
    if (!n) return null;
    if (n.color) return n.color;
    cur = n.parentId;
  }
  return null;
}

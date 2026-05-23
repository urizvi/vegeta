'use client';

import { useMemo } from 'react';
import {
  useHoveredEntityCode, useHoveredEntityIso, useMapTheme,
  useEntityAccountStats, useMapAccountMetric, useTerritoryStore, useFieldDefs,
  useGeoNodes,
} from '@/hooks/useTerritoryStore';
import { formatFieldValue } from '@/lib/accountFields';
import { getEntityGeoIndex } from '@/lib/territoryIndex';
import type { GeoNode } from '@/types/territory';

interface MapTooltipProps {
  mousePos: { x: number; y: number };
}

export default function MapTooltip({ mousePos }: MapTooltipProps) {
  const hoveredCode  = useHoveredEntityCode();
  const hoveredIso   = useHoveredEntityIso();
  const theme        = useMapTheme();
  const metric       = useMapAccountMetric();
  const fieldDefs    = useFieldDefs();
  const accountStats = useEntityAccountStats(hoveredIso);

  // Resolve owning Geo via a primitive (string|null) selector — stable across renders
  // unless the index actually changes — then compute breadcrumb locally with useMemo.
  const owningGeoNodeId = useTerritoryStore((s): string | null => {
    if (!hoveredIso) return null;
    const idx = getEntityGeoIndex(s);
    if (idx[hoveredIso]) return idx[hoveredIso];
    if (hoveredIso.includes(':')) return idx[hoveredIso.split(':')[0]] ?? null;
    return null;
  });
  const geoNodes = useGeoNodes();
  const geoBreadcrumb = useMemo(() => {
    if (!owningGeoNodeId) return null;
    const node = geoNodes[owningGeoNodeId];
    if (!node) return null;
    const trail: string[] = [];
    let effectiveColor: string | null = null;
    let cur: string | null = owningGeoNodeId;
    const seen = new Set<string>();
    while (cur && !seen.has(cur)) {
      seen.add(cur);
      const n: GeoNode | undefined = geoNodes[cur];
      if (!n) break;
      trail.unshift(n.name);
      if (effectiveColor === null && n.color) effectiveColor = n.color;
      cur = n.parentId;
    }
    return { node, trail, effectiveColor };
  }, [owningGeoNodeId, geoNodes]);

  if (!hoveredCode) return null;

  const metricFieldDef = fieldDefs.find((f) => f.id === metric);
  const metricVal = metric !== 'count' && accountStats
    ? accountStats.byField[metric]
    : undefined;

  return (
    <div
      className={`${theme.tooltipClass} min-w-[180px]`}
      style={{ left: mousePos.x + 14, top: mousePos.y - 8 }}
    >
      <div className="text-[13px] font-semibold tracking-tight">{hoveredCode}</div>
      {geoBreadcrumb ? (
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] opacity-80">
          <span
            className="inline-block h-2 w-2 flex-shrink-0 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: geoBreadcrumb.effectiveColor ?? 'transparent' }}
          />
          <span className="truncate font-mono text-[11px]">
            {geoBreadcrumb.trail.map((seg, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1 text-indigo-500/80">›</span>}
                {seg}
              </span>
            ))}
          </span>
        </div>
      ) : (
        <div className="mt-0.5 text-[11px] uppercase tracking-[0.10em] opacity-50">Unassigned</div>
      )}
      {accountStats && (() => {
        const fallbackMetric = fieldDefs.find((f) => f.type === 'metric' && (accountStats.byField[f.id] ?? 0) > 0);
        const shownVal = metricVal !== undefined && metricVal > 0 && metricFieldDef
          ? formatFieldValue(metricVal, metricFieldDef)
          : fallbackMetric
            ? formatFieldValue(accountStats.byField[fallbackMetric.id], fallbackMetric)
            : null;
        return (
          <div className="mt-2 flex items-center gap-3 border-t border-current/10 pt-2 text-[11px] opacity-80">
            <span className="inline-flex items-center gap-1.5">
              <span className="font-mono font-semibold tabular-nums opacity-100">{accountStats.count}</span>
              <span className="opacity-70">account{accountStats.count !== 1 ? 's' : ''}</span>
            </span>
            {shownVal && (
              <span className="inline-flex items-center gap-1.5">
                <span className="text-amber-500" aria-hidden="true">•</span>
                <span className="font-mono font-semibold tabular-nums">{shownVal}</span>
              </span>
            )}
          </div>
        );
      })()}
    </div>
  );
}

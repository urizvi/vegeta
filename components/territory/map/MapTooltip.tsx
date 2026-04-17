'use client';

import {
  useHoveredEntityCode, useHoveredEntityIso, useMapTheme,
  useEntityAccountStats, useMapAccountMetric, useTerritoryStore, useFieldDefs,
} from '@/hooks/useTerritoryStore';
import { formatFieldValue } from '@/lib/accountFields';

interface MapTooltipProps {
  mousePos: { x: number; y: number };
}

export default function MapTooltip({ mousePos }: MapTooltipProps) {
  const hoveredCode  = useHoveredEntityCode();
  const hoveredIso   = useHoveredEntityIso();
  const theme        = useMapTheme();
  const metric       = useMapAccountMetric();
  const fieldDefs    = useFieldDefs();
  const assignedTeam = useTerritoryStore((s) => {
    if (!hoveredCode) return null;
    const a = s.assignments[hoveredCode];
    return a ? (s.teams[a.teamId] ?? null) : null;
  });
  const accountStats = useEntityAccountStats(hoveredIso);

  if (!hoveredCode) return null;

  const metricFieldDef = fieldDefs.find((f) => f.id === metric);
  const metricVal = metric !== 'count' && accountStats
    ? accountStats.byField[metric]
    : undefined;

  return (
    <div
      className={theme.tooltipClass}
      style={{ left: mousePos.x + 14, top: mousePos.y - 8 }}
    >
      <div className="font-medium">{hoveredCode}</div>
      {assignedTeam ? (
        <div className="flex items-center gap-1.5 text-xs opacity-75">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: assignedTeam.color }} />
          {assignedTeam.name}
        </div>
      ) : (
        <div className="text-xs opacity-50">Unassigned</div>
      )}
      {accountStats && (
        <div className="mt-1 border-t border-white/20 pt-1 text-xs opacity-80">
          {accountStats.count} account{accountStats.count !== 1 ? 's' : ''}
          {metricVal !== undefined && metricVal > 0 && metricFieldDef ? (
            <span className="ml-1 opacity-75">
              · {formatFieldValue(metricVal, metricFieldDef)}
            </span>
          ) : accountStats.byField && Object.values(accountStats.byField)[0] > 0 ? (
            (() => {
              const firstMetric = fieldDefs.find((f) => f.type === 'metric' && (accountStats.byField[f.id] ?? 0) > 0);
              return firstMetric ? (
                <span className="ml-1 opacity-75">
                  · {formatFieldValue(accountStats.byField[firstMetric.id], firstMetric)}
                </span>
              ) : null;
            })()
          ) : null}
        </div>
      )}
    </div>
  );
}

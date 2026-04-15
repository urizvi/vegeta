'use client';

import { useHoveredEntityCode, useHoveredEntityIso, useMapTheme, useEntityAccountStats, useTerritoryStore } from '@/hooks/useTerritoryStore';

interface MapTooltipProps {
  mousePos: { x: number; y: number };
}

function formatArr(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

export default function MapTooltip({ mousePos }: MapTooltipProps) {
  const hoveredCode = useHoveredEntityCode();
  const hoveredIso = useHoveredEntityIso();
  const theme = useMapTheme();
  const assignedTeam = useTerritoryStore((s) => {
    if (!hoveredCode) return null;
    const a = s.assignments[hoveredCode];
    return a ? (s.teams[a.teamId] ?? null) : null;
  });
  const accountStats = useEntityAccountStats(hoveredIso);

  if (!hoveredCode) return null;

  return (
    <div
      className={theme.tooltipClass}
      style={{ left: mousePos.x + 14, top: mousePos.y - 8 }}
    >
      <div className="font-medium">{hoveredCode}</div>
      {assignedTeam ? (
        <div className="flex items-center gap-1.5 text-xs opacity-75">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: assignedTeam.color }}
          />
          {assignedTeam.name}
        </div>
      ) : (
        <div className="text-xs opacity-50">Unassigned</div>
      )}
      {accountStats && (
        <div className="mt-1 border-t border-white/20 pt-1 text-xs opacity-80">
          {accountStats.count} account{accountStats.count !== 1 ? 's' : ''}
          {accountStats.arr > 0 && (
            <span className="ml-1 opacity-75">· {formatArr(accountStats.arr)}</span>
          )}
        </div>
      )}
    </div>
  );
}

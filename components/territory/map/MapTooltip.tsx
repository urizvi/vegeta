'use client';

import { useHoveredEntityCode, useTerritoryStore } from '@/hooks/useTerritoryStore';

interface MapTooltipProps {
  mousePos: { x: number; y: number };
}

export default function MapTooltip({ mousePos }: MapTooltipProps) {
  const hoveredCode = useHoveredEntityCode();
  const data = useTerritoryStore((s) => {
    if (!hoveredCode) return null;
    const a = s.assignments[hoveredCode];
    const team = a ? s.teams[a.teamId] : null;
    return { team };
  });

  if (!hoveredCode) return null;

  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg bg-zinc-900 px-3 py-2 text-sm text-white shadow-xl"
      style={{ left: mousePos.x + 14, top: mousePos.y - 8 }}
    >
      <div className="font-medium">{hoveredCode}</div>
      {data?.team ? (
        <div className="flex items-center gap-1.5 text-xs text-zinc-300">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: data.team.color }}
          />
          {data.team.name}
        </div>
      ) : (
        <div className="text-xs text-zinc-400">Unassigned</div>
      )}
    </div>
  );
}

'use client';

import { useTeams, useTeamOrder, useMapTheme } from '@/hooks/useTerritoryStore';

export default function MapLegend() {
  const teams = useTeams();
  const order = useTeamOrder();
  const theme = useMapTheme();

  const teamsWithAssignments = order.map((id) => teams[id]).filter(Boolean);
  if (teamsWithAssignments.length === 0) return null;

  return (
    <div className={theme.legendClass}>
      <p className={theme.legendTitleClass}>Teams</p>
      <div className="flex flex-col gap-1.5">
        {teamsWithAssignments.map((team) => (
          <div key={team.id} className={theme.legendTextClass}>
            <span
              className="inline-block h-3 w-3 rounded-full flex-shrink-0"
              style={{ backgroundColor: team.color }}
            />
            <span className="max-w-[140px] truncate">{team.name}</span>
          </div>
        ))}
        <div className={theme.legendTextClass}>
          <span
            className="inline-block h-3 w-3 rounded-full flex-shrink-0"
            style={{ backgroundColor: theme.unassignedFill }}
          />
          <span className="opacity-60">Unassigned</span>
        </div>
      </div>
    </div>
  );
}

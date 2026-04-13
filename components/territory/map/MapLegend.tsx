'use client';

import { useTeams, useTeamOrder } from '@/hooks/useTerritoryStore';

export default function MapLegend() {
  const teams = useTeams();
  const order = useTeamOrder();

  const teamsWithAssignments = order.map((id) => teams[id]).filter(Boolean);
  if (teamsWithAssignments.length === 0) return null;

  return (
    <div className="absolute bottom-4 left-4 z-10 rounded-xl border border-zinc-200 bg-white/90 p-3 shadow-lg backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900/90">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Teams
      </p>
      <div className="flex flex-col gap-1.5">
        {teamsWithAssignments.map((team) => (
          <div key={team.id} className="flex items-center gap-2 text-sm text-zinc-800 dark:text-zinc-200">
            <span
              className="inline-block h-3 w-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: team.color }}
            />
            <span className="max-w-[140px] truncate">{team.name}</span>
          </div>
        ))}
        <div className="flex items-center gap-2 text-sm text-zinc-400">
          <span className="inline-block h-3 w-3 rounded-sm flex-shrink-0 bg-zinc-300" />
          <span>Unassigned</span>
        </div>
      </div>
    </div>
  );
}

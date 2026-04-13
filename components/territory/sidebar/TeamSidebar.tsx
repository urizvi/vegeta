'use client';

import { useState } from 'react';
import { useTeams, useTeamOrder } from '@/hooks/useTerritoryStore';
import TeamCard from './TeamCard';
import AddTeamModal from './AddTeamModal';

export default function TeamSidebar() {
  const teams = useTeams();
  const order = useTeamOrder();
  const [showAddTeam, setShowAddTeam] = useState(false);

  return (
    <aside className="flex w-72 flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Sales Teams</h2>
        <button
          onClick={() => setShowAddTeam(true)}
          className="flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a.75.75 0 01.75.75v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5H.75a.75.75 0 010-1.5h6.5V.75A.75.75 0 018 0z" />
          </svg>
          New Team
        </button>
      </div>

      {/* Team list */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {order.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-zinc-400">No teams yet.</p>
            <p className="text-xs text-zinc-400">Click "New Team" to get started.</p>
          </div>
        ) : (
          order.map((id) => {
            const team = teams[id];
            if (!team) return null;
            return <TeamCard key={id} team={team} />;
          })
        )}
      </div>

      {showAddTeam && <AddTeamModal onClose={() => setShowAddTeam(false)} />}
    </aside>
  );
}

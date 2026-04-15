'use client';

import { useState } from 'react';
import { useTeams, useTeamOrder } from '@/hooks/useTerritoryStore';
import TeamCard from './TeamCard';
import AddTeamModal from './AddTeamModal';
import RegionsSidebarPanel from './RegionsSidebarPanel';

type Tab = 'teams' | 'regions';

export default function TeamSidebar() {
  const teams = useTeams();
  const order = useTeamOrder();
  const [tab, setTab] = useState<Tab>('teams');
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="flex w-10 flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-10 w-full items-center justify-center text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          aria-label="Expand sidebar"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4 4a.75.75 0 010 1.06l-4 4a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="flex w-72 flex-shrink-0 flex-col border-r border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950">
      {/* Tab bar */}
      <div className="flex items-center border-b border-zinc-200 dark:border-zinc-700">
        <button
          onClick={() => setTab('teams')}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
            tab === 'teams'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          Teams
        </button>
        <button
          onClick={() => setTab('regions')}
          className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
            tab === 'regions'
              ? 'border-b-2 border-blue-600 text-blue-600'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          Regions
        </button>
        {/* Collapse button */}
        <button
          onClick={() => setCollapsed(true)}
          className="mr-2 flex h-6 w-6 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
          aria-label="Collapse sidebar"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M9.78 3.22a.75.75 0 010 1.06L6.06 8l3.72 3.72a.75.75 0 11-1.06 1.06l-4-4a.75.75 0 010-1.06l4-4a.75.75 0 011.06 0z" />
          </svg>
        </button>
      </div>

      {tab === 'teams' ? (
        <>
          {/* New Team button */}
          <div className="border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <button
              onClick={() => setShowAddTeam(true)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
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
                <p className="text-xs text-zinc-400">Click &quot;New Team&quot; to get started.</p>
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
        </>
      ) : (
        <RegionsSidebarPanel />
      )}
    </aside>
  );
}

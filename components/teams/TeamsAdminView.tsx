'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTeams, useTeamOrder } from '@/hooks/useTerritoryStore';
import { logout } from '@/lib/auth';
import TeamCard from './TeamCard';
import TeamTreeView from './TeamTreeView';
import TeamsTableView from './TeamsTableView';
import AddTeamModal from './AddTeamModal';
import ManageLevelsModal from './ManageLevelsModal';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import { useEntityNoun } from '@/hooks/useEntityNoun';
import { useNavModules } from '@/hooks/useNavModules';

type ViewMode = 'nested' | 'list' | 'tree';

const VIEW_MODES: Array<{ id: ViewMode; label: string }> = [
  { id: 'nested', label: 'Nested' },
  { id: 'list', label: 'List' },
  { id: 'tree', label: 'Tree' },
];

export default function TeamsAdminView() {
  const teams = useTeams();
  const order = useTeamOrder();
  const [showAddTeam, setShowAddTeam] = useState(false);
  const [showManageLevels, setShowManageLevels] = useState(false);
  const [view, setView] = useState<ViewMode>('nested');
  const router = useRouter();
  const entityPlural = useEntityNoun('plural');
  const navModules = useNavModules();

  async function handleSignOut() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-950">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Sales Deployment</span>
        <WorkspaceSwitcher />
        <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
          {navModules.map((m) => (
            <Link
              key={m.key}
              href={m.navHref}
              className="rounded-md px-2.5 py-1 font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              {m.navLabel}
            </Link>
          ))}
          <Link
            href="/accounts"
            className="rounded-md px-2.5 py-1 font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            {entityPlural}
          </Link>
          <span className="rounded-md bg-slate-900 px-2.5 py-1 font-medium text-white dark:bg-slate-100 dark:text-slate-900">
            Teams
          </span>
        </div>

        <div className="flex-1" />

        {/* View mode toggle */}
        <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
          {VIEW_MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => setView(m.id)}
              className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                view === m.id
                  ? 'bg-brand text-white shadow-sm shadow-brand/30'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowManageLevels(true)}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
          title="Manage hierarchy levels (IC, Manager, …)"
        >
          Manage levels
        </button>
        <button
          onClick={() => setShowAddTeam(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a.75.75 0 01.75.75v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5H.75a.75.75 0 010-1.5h6.5V.75A.75.75 0 018 0z" />
          </svg>
          New Team
        </button>
        <button
          onClick={handleSignOut}
          className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:text-slate-100"
          title="Sign out"
        >
          Sign out
        </button>
      </header>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-6">
          {order.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 py-16 text-center dark:border-slate-700">
              <p className="text-sm text-slate-500 dark:text-slate-400">No teams yet.</p>
              <p className="text-xs text-slate-400">Click &quot;New Team&quot; to get started.</p>
            </div>
          ) : view === 'tree' ? (
            <TeamTreeView />
          ) : view === 'list' ? (
            <TeamsTableView />
          ) : (
            <div className="flex flex-col gap-3">
              {order
                .filter((id) => (teams[id]?.parentId ?? null) === null)
                .map((id) => {
                  const team = teams[id];
                  if (!team) return null;
                  return <TeamCard key={id} team={team} />;
                })}
            </div>
          )}
        </div>
      </main>

      {showAddTeam && <AddTeamModal onClose={() => setShowAddTeam(false)} />}
      {showManageLevels && <ManageLevelsModal onClose={() => setShowManageLevels(false)} />}
    </div>
  );
}

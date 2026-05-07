'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore } from '@/store/territoryStore';
import { useEntityNoun } from '@/hooks/useEntityNoun';
import { useModuleEnabled } from '@/hooks/useModuleEnabled';
import { useContactsForAccount } from '@/store/slices/contactsSelectors';
import { useActivitiesForAccount } from '@/store/slices/activitiesSelectors';
import { useTasksForAccount } from '@/store/slices/tasksSelectors';
import AddEditAccountModal from '../AddEditAccountModal';
import OverviewTab from './OverviewTab';
import ContactsTab from './ContactsTab';
import ActivityTab from './ActivityTab';
import TasksTab from './TasksTab';

type TabId = 'overview' | 'contacts' | 'activity' | 'tasks';

export default function AccountDetail({ accountId }: { accountId: string }) {
  const account = useTerritoryStore((s) => s.accounts[accountId]);
  const { fieldDefs, members, stages } = useTerritoryStore(
    useShallow((s) => ({
      fieldDefs: s.fieldDefs,
      members:   s.members,
      stages:    s.pipelineStages,
    })),
  );
  const contactsOn   = useModuleEnabled('contacts');
  const activitiesOn = useModuleEnabled('activities');
  const tasksOn      = useModuleEnabled('tasks');
  const entityPlural = useEntityNoun('plural');

  const contacts   = useContactsForAccount(accountId);
  const activities = useActivitiesForAccount(accountId);
  const tasks      = useTasksForAccount(accountId);

  const [tab, setTab] = useState<TabId>('overview');
  const [editing, setEditing] = useState(false);

  const tabs = useMemo(() => {
    const out: { id: TabId; label: string; count?: number }[] = [
      { id: 'overview', label: 'Overview' },
    ];
    if (contactsOn)   out.push({ id: 'contacts', label: 'Contacts', count: contacts.length });
    if (activitiesOn) out.push({ id: 'activity', label: 'Activity', count: activities.length });
    if (tasksOn)      out.push({ id: 'tasks',    label: 'Tasks',    count: tasks.length });
    return out;
  }, [contactsOn, activitiesOn, tasksOn, contacts.length, activities.length, tasks.length]);

  if (!account) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-white text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        <p className="text-sm">Account not found.</p>
        <Link href="/accounts" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
          ← Back to {entityPlural}
        </Link>
      </div>
    );
  }

  const stage = account.stageId ? stages[account.stageId] : null;
  const rep = account.repId ? members[account.repId] : null;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-slate-950">
      {/* Header */}
      <header className="border-b border-slate-100 px-6 py-4 dark:border-slate-800">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Link
              href="/accounts"
              className="text-xs text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
            >
              ← {entityPlural}
            </Link>
            <h1 className="mt-1 truncate text-lg font-semibold text-slate-800 dark:text-slate-100">
              {account.name}
            </h1>
            <div className="mt-1 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              {stage && (
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                  style={{ backgroundColor: stage.color ?? '#e5e7eb' }}
                >
                  {stage.label}
                </span>
              )}
              {rep && <span>{rep.name}</span>}
              {account.country && <span>{account.country}</span>}
            </div>
          </div>
          <button
            onClick={() => setEditing(true)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Edit
          </button>
        </div>

        {/* Tabs */}
        <nav className="-mb-4 mt-4 flex gap-1">
          {tabs.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`relative px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? 'text-brand'
                    : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
                {typeof t.count === 'number' && (
                  <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {t.count}
                  </span>
                )}
                {active && (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 overflow-y-auto px-6 py-6">
        {tab === 'overview' && <OverviewTab account={account} fieldDefs={fieldDefs} />}
        {tab === 'contacts' && contactsOn && (
          <ContactsTab accountId={accountId} fieldDefs={fieldDefs} />
        )}
        {tab === 'activity' && activitiesOn && <ActivityTab accountId={accountId} />}
        {tab === 'tasks' && tasksOn && <TasksTab accountId={accountId} />}
      </main>

      {editing && (
        <AddEditAccountModal account={account} onClose={() => setEditing(false)} />
      )}
    </div>
  );
}

'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useShallow } from 'zustand/react/shallow';
import { logout } from '@/lib/auth';
import { useTerritoryStore } from '@/store/territoryStore';
import { useAllTasks } from '@/store/slices/tasksSelectors';
import { useActions } from '@/store/selectors';
import { useEntityNoun } from '@/hooks/useEntityNoun';
import { useModuleEnabled } from '@/hooks/useModuleEnabled';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';

type Filter = 'open' | 'overdue' | 'completed' | 'all';

export default function TasksApp() {
  const tasks = useAllTasks();
  const { accounts, members } = useTerritoryStore(
    useShallow((s) => ({ accounts: s.accounts, members: s.members })),
  );
  const { addTask, toggleTaskComplete, removeTask, updateTask } = useActions();
  const router = useRouter();
  const entityPlural = useEntityNoun('plural');
  const territoryEnabled = useModuleEnabled('territory');
  const tasksEnabled = useModuleEnabled('tasks');

  const [filter, setFilter] = useState<Filter>('open');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle]       = useState('');
  const [dueAt, setDueAt]       = useState('');
  const [accountId, setAccountId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  // Snapshot now for overdue check (react-hooks/purity).
  const [now] = useState(() => Date.now());

  const orderedMembers = useMemo(
    () => Object.values(members).sort((a, b) => a.name.localeCompare(b.name)),
    [members],
  );

  const filtered = useMemo(() => {
    return tasks.filter((t) => {
      if (assigneeFilter && t.assigneeId !== assigneeFilter) return false;
      if (filter === 'completed') return Boolean(t.completedAt);
      if (filter === 'all') return true;
      if (t.completedAt) return false;
      if (filter === 'overdue') return t.dueAt && Date.parse(t.dueAt) < now;
      return true; // 'open'
    });
  }, [tasks, filter, assigneeFilter, now]);

  function reset() {
    setTitle(''); setDueAt(''); setAccountId(''); setAssigneeId('');
    setShowForm(false);
  }

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({
      accountId: accountId || null,
      title: trimmed,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      assigneeId: assigneeId || null,
    });
    reset();
  }

  async function handleSignOut() {
    await logout();
    router.replace('/login');
  }

  // Module gate: if tasks turned off mid-session, kick the user back.
  if (!tasksEnabled) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-white text-slate-500 dark:bg-slate-950 dark:text-slate-400">
        <p className="text-sm">Tasks are disabled in this workspace.</p>
        <Link href="/accounts" className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
          ← Back to {entityPlural}
        </Link>
      </div>
    );
  }

  const orderedAccounts = Object.values(accounts).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-white dark:bg-slate-950">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2.5 dark:border-slate-700 dark:bg-slate-950">
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">Sales Deployment</span>
        <WorkspaceSwitcher />
        <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
          {territoryEnabled && (
            <Link
              href="/territory"
              className="rounded-md px-2.5 py-1 font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Territory
            </Link>
          )}
          <Link
            href="/accounts"
            className="rounded-md px-2.5 py-1 font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            {entityPlural}
          </Link>
          <Link
            href="/teams"
            className="rounded-md px-2.5 py-1 font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            Teams
          </Link>
          <span className="rounded-md bg-slate-900 px-2.5 py-1 font-medium text-white dark:bg-slate-100 dark:text-slate-900">
            Tasks
          </span>
        </div>

        <div className="flex-1" />

        <button
          onClick={handleSignOut}
          className="text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
        >
          Sign out
        </button>
      </header>

      <div className="flex items-center gap-3 border-b border-slate-100 bg-white px-6 py-3 dark:border-slate-800 dark:bg-slate-950">
        <h1 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Tasks</h1>

        <div className="flex items-center rounded-lg border border-slate-200 p-0.5 text-xs dark:border-slate-700">
          {(['open', 'overdue', 'completed', 'all'] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-2.5 py-1 font-medium capitalize transition-colors ${
                filter === f
                  ? 'bg-brand text-white shadow-sm shadow-brand/30'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              {f}
            </button>
          ))}
        </div>

        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-600 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="">Anyone</option>
          {orderedMembers.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
        </select>

        <span className="text-xs text-slate-400 dark:text-slate-500">
          {filtered.length} of {tasks.length}
        </span>

        <div className="flex-1" />

        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            + Add task
          </button>
        )}
      </div>

      <main className="flex-1 overflow-y-auto px-6 py-4">
        <div className="mx-auto max-w-3xl space-y-3">
          {showForm && (
            <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                autoFocus
                className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="datetime-local"
                  value={dueAt}
                  onChange={(e) => setDueAt(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                />
                <select
                  value={accountId}
                  onChange={(e) => setAccountId(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">Standalone</option>
                  {orderedAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  <option value="">Unassigned</option>
                  {orderedMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={reset}
                  className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  onClick={submit}
                  disabled={!title.trim()}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            </div>
          )}

          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-400 dark:text-slate-500">
              {tasks.length === 0 ? 'No tasks yet.' : 'No tasks match this filter.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {filtered.map((t) => {
                const account = t.accountId ? accounts[t.accountId] : null;
                const assignee = t.assigneeId ? members[t.assigneeId] : null;
                const overdue = !t.completedAt && t.dueAt && Date.parse(t.dueAt) < now;
                return (
                  <li key={t.id} className="flex items-start gap-3 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={Boolean(t.completedAt)}
                      onChange={() => toggleTaskComplete(t.id)}
                      className="mt-0.5 h-4 w-4 rounded accent-indigo-600"
                    />
                    <div className="min-w-0 flex-1">
                      <div className={`text-sm ${t.completedAt ? 'text-slate-400 line-through dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}>
                        {t.title}
                      </div>
                      <div className="mt-0.5 flex flex-wrap gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                        {account ? (
                          <Link
                            href={`/accounts/${encodeURIComponent(account.id)}`}
                            className="text-indigo-600 hover:underline dark:text-indigo-400"
                          >
                            {account.name}
                          </Link>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-600">No account</span>
                        )}
                        {t.dueAt && (
                          <span className={overdue ? 'text-rose-600 dark:text-rose-400' : ''}>
                            Due {new Date(t.dueAt).toLocaleDateString()}
                          </span>
                        )}
                        <select
                          value={t.assigneeId ?? ''}
                          onChange={(e) => updateTask(t.id, { assigneeId: e.target.value || null })}
                          className="rounded border-0 bg-transparent text-[11px] text-slate-500 outline-none dark:text-slate-400"
                        >
                          <option value="">Unassigned</option>
                          {orderedMembers.map((m) => (
                            <option key={m.id} value={m.id}>{m.name}</option>
                          ))}
                        </select>
                        {assignee && t.assigneeId === assignee.id && null}
                      </div>
                    </div>
                    <button
                      onClick={() => removeTask(t.id)}
                      className="rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/40"
                      title="Remove"
                    >
                      Remove
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>
    </div>
  );
}

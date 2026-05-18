'use client';

import { useState } from 'react';
import { useTerritoryStore } from '@/store/territoryStore';
import { useTasksForAccount } from '@/store/slices/tasksSelectors';
import { useActions } from '@/store/selectors';

export default function AccountTasksTab({ accountId }: { accountId: string }) {
  // Snapshot "now" at mount so the overdue check is pure across re-renders.
  // Refreshes when the user navigates away and back — good enough for visual cue.
  const [now] = useState(() => Date.now());
  const tasks = useTasksForAccount(accountId);
  const members = useTerritoryStore((s) => s.members);
  const { addTask, toggleTaskComplete, removeTask, updateTask } = useActions();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle]       = useState('');
  const [dueAt, setDueAt]       = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  function reset() {
    setTitle(''); setDueAt(''); setAssigneeId('');
    setShowForm(false);
  }

  function submit() {
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask({
      accountId,
      title: trimmed,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
      assigneeId: assigneeId || null,
    });
    reset();
  }

  const orderedMembers = Object.values(members).sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
        </h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            + Add task
          </button>
        )}
      </div>

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
          <div className="grid grid-cols-2 gap-2">
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
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

      {tasks.length === 0 && !showForm ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No tasks yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {tasks.map((t) => {
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
                    {t.dueAt && (
                      <span className={overdue ? 'text-rose-600 dark:text-rose-400' : ''}>
                        Due {new Date(t.dueAt).toLocaleDateString()}
                      </span>
                    )}
                    {assignee && <span>Assigned to {assignee.name}</span>}
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
  );
}

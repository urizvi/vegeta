'use client';

import { useState } from 'react';
import { useActivitiesForAccount } from '@/store/slices/activitiesSelectors';
import { useContactsForAccount } from '@/store/slices/contactsSelectors';
import { useActions } from '@/store/selectors';
import type { ActivityKind } from '@/types/crm';

const KIND_LABELS: Record<ActivityKind, string> = {
  note: 'Note',
  call: 'Call',
  email: 'Email',
  meeting: 'Meeting',
};

export default function ActivityTab({ accountId }: { accountId: string }) {
  const activities = useActivitiesForAccount(accountId);
  const contacts = useContactsForAccount(accountId);
  const { addActivity, removeActivity } = useActions();

  const [kind, setKind]           = useState<ActivityKind>('note');
  const [body, setBody]           = useState('');
  const [contactId, setContactId] = useState<string>('');

  function submit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    addActivity({
      accountId,
      contactId: contactId || null,
      kind,
      body: trimmed,
      occurredAt: new Date().toISOString(),
      createdBy: null,
    });
    setBody('');
    setContactId('');
    setKind('note');
  }

  return (
    <div className="max-w-3xl space-y-4">
      {/* Inline composer */}
      <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as ActivityKind)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {(['note', 'call', 'email', 'meeting'] as ActivityKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
          {contacts.length > 0 && (
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="">No contact</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={`Log a ${KIND_LABELS[kind].toLowerCase()}…`}
          rows={3}
          className="w-full resize-y rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
        <div className="flex justify-end">
          <button
            onClick={submit}
            disabled={!body.trim()}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Log
          </button>
        </div>
      </div>

      {/* Timeline */}
      {activities.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No activity yet.</p>
      ) : (
        <ul className="space-y-2">
          {activities.map((a) => {
            const contact = a.contactId ? contacts.find((c) => c.id === a.contactId) : null;
            return (
              <li
                key={a.id}
                className="rounded-xl border border-slate-100 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {KIND_LABELS[a.kind]}
                      </span>
                      {contact && (
                        <span className="text-slate-500 dark:text-slate-400">with {contact.name}</span>
                      )}
                      <span className="text-slate-400 dark:text-slate-500">
                        {a.occurredAt ? new Date(a.occurredAt).toLocaleString() : '—'}
                      </span>
                    </div>
                    {a.body && (
                      <p className="mt-1.5 whitespace-pre-wrap text-xs text-slate-700 dark:text-slate-200">
                        {a.body}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => removeActivity(a.id)}
                    className="rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/40"
                    title="Remove"
                  >
                    Remove
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

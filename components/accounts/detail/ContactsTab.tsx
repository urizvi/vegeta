'use client';

import { useState } from 'react';
import { useContactsForAccount } from '@/store/slices/contactsSelectors';
import { useActions } from '@/store/selectors';
import type { FieldDefinition } from '@/lib/accountFields';
import { formatFieldValue } from '@/lib/accountFields';

export default function ContactsTab({
  accountId,
  fieldDefs,
}: {
  accountId: string;
  fieldDefs: FieldDefinition[];
}) {
  const contacts = useContactsForAccount(accountId);
  const { addContact, updateContact, removeContact } = useActions();
  const contactDefs = fieldDefs.filter((d) => d.entity === 'contact');

  const [showForm, setShowForm] = useState(false);
  const [name, setName]     = useState('');
  const [email, setEmail]   = useState('');
  const [phone, setPhone]   = useState('');
  const [title, setTitle]   = useState('');
  const [primary, setPrimary] = useState(false);

  function reset() {
    setName(''); setEmail(''); setPhone(''); setTitle(''); setPrimary(false);
    setShowForm(false);
  }

  function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    addContact({
      accountId,
      name: trimmed,
      email: email.trim() || null,
      phone: phone.trim() || null,
      title: title.trim() || null,
      isPrimary: primary,
    });
    reset();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
        </h2>
        {!showForm && (
          <button
            onClick={() => setShowForm(true)}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500"
          >
            + Add contact
          </button>
        )}
      </div>

      {showForm && (
        <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900/50">
          <Input value={name}  onChange={setName}  placeholder="Name" autoFocus />
          <div className="grid grid-cols-2 gap-2">
            <Input value={email} onChange={setEmail} placeholder="Email" type="email" />
            <Input value={phone} onChange={setPhone} placeholder="Phone" />
          </div>
          <Input value={title} onChange={setTitle} placeholder="Title / role" />
          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
            <input
              type="checkbox"
              checked={primary}
              onChange={(e) => setPrimary(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-indigo-600"
            />
            Primary contact
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={reset}
              className="rounded-lg px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              onClick={submit}
              disabled={!name.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {contacts.length === 0 && !showForm ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No contacts yet.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
          {contacts.map((c) => (
            <li key={c.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{c.name}</span>
                    {c.isPrimary && (
                      <span className="rounded-full bg-indigo-100 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                        Primary
                      </span>
                    )}
                  </div>
                  {c.title && <div className="text-xs text-slate-500 dark:text-slate-400">{c.title}</div>}
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                    {c.email && <a href={`mailto:${c.email}`} className="hover:underline">{c.email}</a>}
                    {c.phone && <a href={`tel:${c.phone}`} className="hover:underline">{c.phone}</a>}
                  </div>
                  {contactDefs.length > 0 && (
                    <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {contactDefs.map((def) => (
                        <div key={def.id} className="flex gap-2">
                          <dt className="text-slate-400 dark:text-slate-500">{def.label}:</dt>
                          <dd className="text-slate-700 dark:text-slate-200">{formatFieldValue(c.fields[def.id], def)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {!c.isPrimary && (
                    <button
                      onClick={() => updateContact(c.id, { isPrimary: true })}
                      className="rounded px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      title="Make primary"
                    >
                      Make primary
                    </button>
                  )}
                  <button
                    onClick={() => removeContact(c.id)}
                    className="rounded px-2 py-1 text-[10px] text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:text-slate-500 dark:hover:bg-rose-950/40"
                    title="Remove contact"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 outline-none placeholder:text-slate-400 focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
    />
  );
}

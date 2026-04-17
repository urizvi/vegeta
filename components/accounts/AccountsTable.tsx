'use client';

import { memo, useState, useCallback } from 'react';
import { useActions, useFieldDefs } from '@/hooks/useTerritoryStore';
import { optionColor, formatFieldValue } from '@/lib/accountFields';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';
import type { Member, SalesTeam } from '@/types/territory';

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = string; // 'name' | 'country' | 'state' | 'repId' | fieldId

function getAccountValue(account: Account, key: SortKey): string | number {
  if (key === 'name')    return account.name;
  if (key === 'country') return account.country;
  if (key === 'state')   return account.state ?? '';
  if (key === 'repId')   return account.repId ?? '';
  return account.fields[key] ?? '';
}

// ── Sort header ───────────────────────────────────────────────────────────────

function SortHeader({ label, sortKey, activeSortKey, sortDir, onSort, right }: {
  label: string; sortKey: SortKey; activeSortKey: SortKey | null;
  sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void; right?: boolean;
}) {
  const active = activeSortKey === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 ${right ? 'text-right' : 'text-left'}`}
    >
      <span className={`inline-flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {label}
        <span className={active ? 'text-zinc-500' : 'text-zinc-300 dark:text-zinc-600'}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  );
}

// ── Inline-editable metric cell ───────────────────────────────────────────────

const MetricCell = memo(function MetricCell({ accountId, fieldDef, value }: {
  accountId: string; fieldDef: FieldDefinition; value: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const { setAccountField } = useActions();

  const commit = useCallback(() => {
    const n = parseFloat(draft.replace(/[$,KMk\s]/g, '')) || 0;
    setAccountField(accountId, fieldDef.id, n);
    setEditing(false);
  }, [draft, accountId, fieldDef.id, setAccountField]);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        className="w-full bg-transparent text-right text-xs outline-none"
      />
    );
  }
  return (
    <button
      onClick={() => { setDraft(String(value || '')); setEditing(true); }}
      className="w-full text-right text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      title="Click to edit"
    >
      {formatFieldValue(value, fieldDef)}
    </button>
  );
});

// ── Account row ───────────────────────────────────────────────────────────────

const AccountRow = memo(function AccountRow({ account, fieldDefs, selected, members, teams, teamOrder, onToggleSelect, onEdit }: {
  account: Account;
  fieldDefs: FieldDefinition[];
  selected: boolean;
  members: Record<string, Member>;
  teams: Record<string, SalesTeam>;
  teamOrder: string[];
  onToggleSelect: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const { updateAccount, setAccountField, deleteAccount } = useActions();

  const allReps = teamOrder.flatMap((tid) => {
    const team = teams[tid];
    if (!team) return [];
    return team.memberIds.map((mid) => {
      const m = members[mid];
      return m ? { id: m.id, label: `${m.name} (${team.name})` } : null;
    }).filter(Boolean) as { id: string; label: string }[];
  });

  const stateCode = account.state ? account.state.split(':')[1] : null;
  const selectCls = 'w-full rounded border-0 bg-transparent py-0 pl-0 pr-4 text-xs text-zinc-600 outline-none focus:ring-0 dark:text-zinc-400 cursor-pointer';

  return (
    <tr className={`group border-b border-zinc-50 hover:bg-zinc-50/60 dark:border-zinc-800 dark:hover:bg-zinc-800/40 ${selected ? 'bg-blue-50/40 dark:bg-blue-950/20' : ''}`}>
      {/* Checkbox */}
      <td className="w-9 px-3 py-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(account.id)}
          className="h-3.5 w-3.5 rounded accent-blue-600"
        />
      </td>

      {/* Name */}
      <td className="min-w-[160px] max-w-[220px] px-3 py-2">
        <button
          onClick={() => onEdit(account.id)}
          className="truncate text-xs font-medium text-zinc-700 hover:text-blue-600 dark:text-zinc-200 dark:hover:text-blue-400"
          title={account.name}
        >
          {account.name}
        </button>
      </td>

      {/* Country */}
      <td className="w-16 px-3 py-2 text-xs text-zinc-500">{account.country}</td>

      {/* State */}
      <td className="w-20 px-3 py-2 text-xs text-zinc-400">{stateCode ?? '—'}</td>

      {/* Dynamic field cells */}
      {fieldDefs.map((def, defIdx) => {
        const rawVal = account.fields[def.id];

        if (def.type === 'categorical') {
          const opts = def.options ?? [];
          const currentVal = String(rawVal ?? opts[0] ?? '');
          const colorIdx = opts.indexOf(currentVal);
          const isFirst = defIdx === 0;
          return (
            <td key={def.id} className="w-28 px-3 py-2">
              <div className="flex items-center gap-1.5">
                {isFirst && (
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: optionColor(colorIdx >= 0 ? colorIdx : 0) }}
                  />
                )}
                <select
                  value={currentVal}
                  onChange={(e) => setAccountField(account.id, def.id, e.target.value)}
                  className={selectCls}
                >
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </td>
          );
        }

        if (def.type === 'metric') {
          return (
            <td key={def.id} className="w-24 px-3 py-2">
              <MetricCell
                accountId={account.id}
                fieldDef={def}
                value={Number(rawVal) || 0}
              />
            </td>
          );
        }

        // text
        return (
          <td key={def.id} className="max-w-[120px] px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            <input
              defaultValue={String(rawVal ?? '')}
              onBlur={(e) => setAccountField(account.id, def.id, e.target.value)}
              className="w-full bg-transparent outline-none"
            />
          </td>
        );
      })}

      {/* Rep */}
      <td className="w-36 px-3 py-2">
        <select
          value={account.repId ?? ''}
          onChange={(e) => updateAccount(account.id, { repId: e.target.value || null })}
          className={selectCls}
        >
          <option value="">— unassigned —</option>
          {allReps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </td>

      {/* Delete */}
      <td className="w-10 px-2 py-2">
        <button
          onClick={() => { if (confirm(`Delete "${account.name}"?`)) deleteAccount(account.id); }}
          className="invisible flex h-6 w-6 items-center justify-center rounded text-zinc-300 hover:bg-red-50 hover:text-red-500 group-hover:visible dark:hover:bg-red-950"
          aria-label="Delete account"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </td>
    </tr>
  );
});

// ── Table ─────────────────────────────────────────────────────────────────────

interface AccountsTableProps {
  accounts: Account[];
  members: Record<string, Member>;
  teams: Record<string, SalesTeam>;
  teamOrder: string[];
  onEdit: (id: string) => void;
}

export default function AccountsTable({ accounts, members, teams, teamOrder, onEdit }: AccountsTableProps) {
  const fieldDefs = useFieldDefs();
  const [sortKey,  setSortKey]  = useState<SortKey | null>('name');
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('asc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { deleteAccounts } = useActions();

  function handleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = [...accounts].sort((a, b) => {
    if (!sortKey) return 0;
    const av = getAccountValue(a, sortKey);
    const bv = getAccountValue(b, sortKey);
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const allSelected = sorted.length > 0 && sorted.every((a) => selected.has(a.id));

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(sorted.map((a) => a.id)));
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    const ids = Array.from(selected);
    if (!confirm(`Delete ${ids.length} account${ids.length !== 1 ? 's' : ''}?`)) return;
    deleteAccounts(ids);
    setSelected(new Set());
  }

  const sortHeaderProps = { activeSortKey: sortKey, sortDir, onSort: handleSort };

  // Metric totals for status bar
  const displayAccounts = selected.size > 0 ? sorted.filter((a) => selected.has(a.id)) : sorted;
  const metricTotals = fieldDefs
    .filter((f) => f.type === 'metric')
    .map((f) => ({ def: f, total: displayAccounts.reduce((n, a) => n + (Number(a.fields[f.id]) || 0), 0) }))
    .filter(({ total }) => total > 0)
    .slice(0, 2);

  if (accounts.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
        <svg className="h-10 w-10 text-zinc-200 dark:text-zinc-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
        <p className="text-sm text-zinc-400">No accounts found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-zinc-50 dark:bg-zinc-900">
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="w-9 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className="h-3.5 w-3.5 rounded accent-blue-600"
                />
              </th>
              <SortHeader label="Name"    sortKey="name"    {...sortHeaderProps} />
              <SortHeader label="Country" sortKey="country" {...sortHeaderProps} />
              <SortHeader label="State"   sortKey="state"   {...sortHeaderProps} />
              {fieldDefs.map((def) => (
                <SortHeader
                  key={def.id}
                  label={def.label}
                  sortKey={def.id}
                  right={def.type === 'metric'}
                  {...sortHeaderProps}
                />
              ))}
              <SortHeader label="Rep" sortKey="repId" {...sortHeaderProps} />
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
                fieldDefs={fieldDefs}
                selected={selected.has(account.id)}
                members={members}
                teams={teams}
                teamOrder={teamOrder}
                onToggleSelect={toggleSelect}
                onEdit={onEdit}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 border-t border-zinc-200 bg-zinc-50 px-4 py-2 text-xs text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900">
        <span>{sorted.length} account{sorted.length !== 1 ? 's' : ''}</span>
        {metricTotals.map(({ def, total }) => (
          <span key={def.id}>
            {def.label}:{' '}
            <span className="font-medium text-zinc-700 dark:text-zinc-300">
              {formatFieldValue(total, def)}
            </span>
          </span>
        ))}
        <div className="flex-1" />
        {selected.size > 0 && (
          <div className="flex items-center gap-3">
            <span className="font-medium text-blue-600 dark:text-blue-400">{selected.size} selected</span>
            <button
              onClick={handleBulkDelete}
              className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
            >
              Delete selected
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="text-xs text-zinc-400 hover:text-zinc-600"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { memo, useState, useCallback } from 'react';
import { useActions } from '@/hooks/useTerritoryStore';
import {
  STAGE_OPTIONS, SEGMENT_OPTIONS, TIER_OPTIONS, INDUSTRY_OPTIONS,
  STAGE_COLORS, formatMetric,
} from '@/lib/accountFields';
import type { Account } from '@/types/account';
import type { Member, SalesTeam } from '@/types/territory';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtCurrency(n: number) {
  if (n <= 0) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

type SortField = keyof Account;

function SortHeader({ label, field, sortField, sortDir, onSort, right }: {
  label: string; field: SortField; sortField: SortField | null;
  sortDir: 'asc' | 'desc'; onSort: (f: SortField) => void; right?: boolean;
}) {
  const active = sortField === field;
  return (
    <th
      onClick={() => onSort(field)}
      className={`cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-xs font-semibold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 ${right ? 'text-right' : 'text-left'}`}
    >
      <span className={`inline-flex items-center gap-1 ${right ? 'justify-end' : ''}`}>
        {label}
        <span className={`${active ? 'text-zinc-500' : 'text-zinc-300 dark:text-zinc-600'}`}>
          {active ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </span>
    </th>
  );
}

// Inline-editable number cell
const NumericCell = memo(function NumericCell({ id, field, value }: {
  id: string; field: 'arr' | 'mrr' | 'headcount'; value: number;
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const { updateAccount } = useActions();

  const commit = useCallback(() => {
    const n = field === 'headcount'
      ? parseInt(draft.replace(/[^0-9]/g, '')) || 0
      : parseFloat(draft.replace(/[$,KMk]/g, '')) || 0;
    updateAccount(id, { [field]: n });
    setEditing(false);
  }, [draft, field, id, updateAccount]);

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
      onClick={() => { setDraft(String(value)); setEditing(true); }}
      className="w-full text-right text-xs text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      title="Click to edit"
    >
      {field === 'headcount' ? formatMetric('headcount', value) : fmtCurrency(value)}
    </button>
  );
});

// Single account row
const AccountRow = memo(function AccountRow({ account, selected, members, teams, teamOrder, onToggleSelect, onEdit }: {
  account: Account;
  selected: boolean;
  members: Record<string, Member>;
  teams: Record<string, SalesTeam>;
  teamOrder: string[];
  onToggleSelect: (id: string) => void;
  onEdit: (id: string) => void;
}) {
  const { updateAccount, deleteAccount } = useActions();

  const allReps = teamOrder.flatMap((tid) => {
    const team = teams[tid];
    if (!team) return [];
    return team.memberIds.map((mid) => {
      const m = members[mid];
      return m ? { id: m.id, label: `${m.name} (${team.name})` } : null;
    }).filter(Boolean) as { id: string; label: string }[];
  });

  const stateCode = account.state ? account.state.split(':')[1] : null;
  const stageColor = STAGE_COLORS[account.stage];

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

      {/* Stage */}
      <td className="w-28 px-3 py-2">
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ backgroundColor: stageColor }} />
          <select
            value={account.stage}
            onChange={(e) => updateAccount(account.id, { stage: e.target.value as typeof account.stage })}
            className={selectCls}
          >
            {STAGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      </td>

      {/* Segment */}
      <td className="w-28 px-3 py-2">
        <select
          value={account.segment}
          onChange={(e) => updateAccount(account.id, { segment: e.target.value as typeof account.segment })}
          className={selectCls}
        >
          {SEGMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>

      {/* Industry */}
      <td className="w-32 px-3 py-2">
        <select
          value={account.industry}
          onChange={(e) => updateAccount(account.id, { industry: e.target.value as typeof account.industry })}
          className={selectCls}
        >
          {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>

      {/* Tier */}
      <td className="w-24 px-3 py-2">
        <select
          value={account.tier}
          onChange={(e) => updateAccount(account.id, { tier: e.target.value as typeof account.tier })}
          className={selectCls}
        >
          {TIER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      </td>

      {/* ARR */}
      <td className="w-24 px-3 py-2">
        <NumericCell id={account.id} field="arr" value={account.arr} />
      </td>

      {/* MRR */}
      <td className="w-24 px-3 py-2">
        <NumericCell id={account.id} field="mrr" value={account.mrr} />
      </td>

      {/* Headcount */}
      <td className="w-16 px-3 py-2">
        <NumericCell id={account.id} field="headcount" value={account.headcount} />
      </td>

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
  const [sortField,  setSortField]  = useState<SortField | null>('name');
  const [sortDir,    setSortDir]    = useState<'asc' | 'desc'>('asc');
  const [selected,   setSelected]   = useState<Set<string>>(new Set());
  const { deleteAccounts } = useActions();

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  }

  const sorted = [...accounts].sort((a, b) => {
    if (!sortField) return 0;
    const av = a[sortField] ?? '';
    const bv = b[sortField] ?? '';
    if (typeof av === 'number' && typeof bv === 'number') {
      return sortDir === 'asc' ? av - bv : bv - av;
    }
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const allSelected = sorted.length > 0 && sorted.every((a) => selected.has(a.id));

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sorted.map((a) => a.id)));
    }
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

  const sortHeaderProps = { sortField, sortDir, onSort: handleSort };

  // Summary totals for selected / visible accounts
  const visibleAccounts = sorted;
  const displayAccounts = selected.size > 0 ? visibleAccounts.filter((a) => selected.has(a.id)) : visibleAccounts;
  const totalArr = displayAccounts.reduce((n, a) => n + a.arr, 0);

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
        <table className="w-full min-w-[1100px] border-collapse text-sm">
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
              <SortHeader label="Name"      field="name"      {...sortHeaderProps} />
              <SortHeader label="Country"   field="country"   {...sortHeaderProps} />
              <SortHeader label="State"     field="state"     {...sortHeaderProps} />
              <SortHeader label="Stage"     field="stage"     {...sortHeaderProps} />
              <SortHeader label="Segment"   field="segment"   {...sortHeaderProps} />
              <SortHeader label="Industry"  field="industry"  {...sortHeaderProps} />
              <SortHeader label="Tier"      field="tier"      {...sortHeaderProps} />
              <SortHeader label="ARR"       field="arr"       {...sortHeaderProps} right />
              <SortHeader label="MRR"       field="mrr"       {...sortHeaderProps} right />
              <SortHeader label="HC"        field="headcount" {...sortHeaderProps} right />
              <SortHeader label="Rep"       field="repId"     {...sortHeaderProps} />
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((account) => (
              <AccountRow
                key={account.id}
                account={account}
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
        {totalArr > 0 && <span>Total ARR: <span className="font-medium text-zinc-700 dark:text-zinc-300">{fmtCurrency(totalArr)}</span></span>}
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

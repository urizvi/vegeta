'use client';

import React, { memo, useState, useCallback, useMemo } from 'react';
import { useActions, useFieldDefs, useGeoNodes, useGeoNodeOrder } from '@/hooks/useTerritoryStore';
import { useEntityNoun } from '@/hooks/useEntityNoun';
import { useOwnerNoun } from '@/hooks/useOwnerNoun';
import { flattenGeoTree } from './GeoPicker';
import { optionColor, formatFieldValue } from '@/lib/accountFields';
import type { FieldDefinition } from '@/lib/accountFields';
import { prettyPrint } from '@/lib/formula/parse';
import type { Account } from '@/types/account';
import type { Member, SalesTeam } from '@/types/territory';

// ── Sort helpers ──────────────────────────────────────────────────────────────

type SortKey = string; // 'name' | 'country' | 'state' | 'geo' | 'repId' | 'ownerChain' | fieldId

function ownerChainNames(
  repId: string | null | undefined,
  members: Record<string, Member>,
  teams: Record<string, SalesTeam>,
): string[] {
  if (!repId) return [];
  const rep = members[repId];
  if (!rep) return [];
  const out = [rep.name];
  let teamId: string | null = null;
  for (const t of Object.values(teams)) {
    if (t.memberIds.includes(repId)) { teamId = t.id; break; }
  }
  const seenTeams = new Set<string>();
  let lastEmitted = repId;
  while (teamId && !seenTeams.has(teamId)) {
    seenTeams.add(teamId);
    const team = teams[teamId];
    if (!team) break;
    if (team.leadMemberId && team.leadMemberId !== lastEmitted) {
      const lead = members[team.leadMemberId];
      if (lead) {
        out.push(lead.name);
        lastEmitted = lead.id;
      }
    }
    teamId = team.parentId;
  }
  return out;
}

function getAccountValue(
  account: Account,
  key: SortKey,
  geoLabelById: Record<string, string>,
  members: Record<string, Member>,
  teams: Record<string, SalesTeam>,
): string | number {
  if (key === 'name')       return account.name;
  if (key === 'country')    return account.country ?? '';
  if (key === 'state')      return account.state ?? '';
  if (key === 'geo')        return account.geoNodeId ? (geoLabelById[account.geoNodeId] ?? '') : '';
  if (key === 'repId')      return account.repId ?? '';
  if (key === 'ownerChain') return ownerChainNames(account.repId, members, teams).join(' › ');
  const v = account.fields[key];
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v ?? '';
}

// ── Shared focus ring ─────────────────────────────────────────────────────────

const focusRing = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-1 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950';

// ── Sort header ───────────────────────────────────────────────────────────────

function SortChevron({ active, dir }: { active: boolean; dir: 'asc' | 'desc' }) {
  const upActive = active && dir === 'asc';
  const downActive = active && dir === 'desc';
  return (
    <svg
      viewBox="0 0 8 12"
      className="ml-0.5 h-3 w-2 flex-shrink-0"
      aria-hidden="true"
    >
      <path
        d="M4 0.5 L7.5 4 L0.5 4 Z"
        className={upActive ? 'fill-indigo-600 dark:fill-indigo-400' : 'fill-slate-300 dark:fill-slate-600'}
      />
      <path
        d="M4 11.5 L0.5 8 L7.5 8 Z"
        className={downActive ? 'fill-indigo-600 dark:fill-indigo-400' : 'fill-slate-300 dark:fill-slate-600'}
      />
    </svg>
  );
}

function SortHeader({ label, sortKey, activeSortKey, sortDir, onSort, right }: {
  label: React.ReactNode; sortKey: SortKey; activeSortKey: SortKey | null;
  sortDir: 'asc' | 'desc'; onSort: (k: SortKey) => void; right?: boolean;
}) {
  const active = activeSortKey === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`whitespace-nowrap px-3 py-2.5 ${right ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex w-full cursor-pointer select-none items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] transition-colors hover:bg-slate-100/70 dark:hover:bg-slate-800/60 ${active ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'} ${right ? 'justify-end' : ''} ${focusRing}`}
      >
        {label}
        <SortChevron active={active} dir={sortDir} />
      </button>
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
        className={`w-full rounded-md bg-white px-1.5 py-0.5 text-right text-xs tabular-nums tracking-tight ring-1 ring-indigo-500/40 outline-none focus:ring-2 focus:ring-indigo-500/60 dark:bg-slate-900 dark:text-slate-100 ${focusRing}`}
      />
    );
  }
  return (
    <button
      onClick={() => { setDraft(String(value || '')); setEditing(true); }}
      className={`w-full rounded-sm text-right text-xs font-medium tabular-nums tracking-tight text-slate-700 underline-offset-4 transition-colors hover:text-slate-900 hover:underline hover:decoration-amber-500/80 hover:decoration-dotted dark:text-slate-200 dark:hover:text-white ${focusRing}`}
      title="Click to edit"
    >
      {formatFieldValue(value, fieldDef)}
    </button>
  );
});

// ── Account row ───────────────────────────────────────────────────────────────

const AccountRow = memo(function AccountRow({ account, fieldDefs, selected, members, teams, teamOrder, geoLabelById, onToggleSelect, onEdit }: {
  account: Account;
  fieldDefs: FieldDefinition[];
  selected: boolean;
  members: Record<string, Member>;
  teams: Record<string, SalesTeam>;
  teamOrder: string[];
  geoLabelById: Record<string, string>;
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
  const selectCls = `w-full appearance-none cursor-pointer rounded-sm border-0 bg-transparent py-0.5 pl-0 pr-4 text-xs text-slate-600 outline-none transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-white ${focusRing}`;

  const rowBase = 'group border-b border-slate-100 transition-colors duration-100 dark:border-slate-800/60';
  const rowZebra = selected ? '' : 'even:bg-slate-50/40 dark:even:bg-slate-900/30';
  const rowHover = selected
    ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
    : 'hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20';

  return (
    <tr className={`${rowBase} ${rowZebra} ${rowHover}`}>
      {/* Checkbox + selected accent bar */}
      <td
        className="w-9 px-3 py-2.5"
        style={selected ? { boxShadow: 'inset 2px 0 0 rgb(79 70 229)' } : undefined}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelect(account.id)}
          className={`h-3.5 w-3.5 rounded accent-indigo-600 ${focusRing}`}
        />
      </td>

      {/* Name */}
      <td className="min-w-[160px] max-w-[220px] px-3 py-2.5">
        <button
          onClick={() => onEdit(account.id)}
          className={`truncate rounded-sm text-xs font-medium text-slate-800 underline-offset-2 transition-colors hover:text-indigo-600 hover:underline dark:text-slate-100 dark:hover:text-indigo-400 ${focusRing}`}
          title={account.name}
        >
          {account.name}
        </button>
      </td>

      {/* Country */}
      <td className="w-16 px-3 py-2.5 text-xs font-medium text-slate-500 dark:text-slate-400">{account.country}</td>

      {/* State */}
      <td className="w-20 px-3 py-2.5 text-xs text-slate-400 dark:text-slate-500">{stateCode ?? '—'}</td>

      {/* Geo */}
      <td className="max-w-[180px] px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
        {account.geoNodeId
          ? <span className="truncate" title={geoLabelById[account.geoNodeId]}>{geoLabelById[account.geoNodeId] ?? '—'}</span>
          : <span className="text-slate-300 dark:text-slate-600">—</span>}
      </td>

      {/* Dynamic field cells */}
      {fieldDefs.map((def, defIdx) => {
        const rawVal = account.fields[def.id];

        if (def.type === 'categorical') {
          const opts = def.options ?? [];
          const currentVal = String(rawVal ?? opts[0] ?? '');
          const colorIdx = opts.indexOf(currentVal);
          const isFirst = defIdx === 0;

          if (isFirst) {
            return (
              <td key={def.id} className="w-32 px-3 py-2.5">
                <div className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-slate-100/80 px-2 py-0.5 ring-1 ring-inset ring-slate-200/60 dark:bg-slate-800/60 dark:ring-slate-700/60">
                  <span
                    className="h-2 w-2 flex-shrink-0 rounded-full"
                    style={{ backgroundColor: optionColor(colorIdx >= 0 ? colorIdx : 0) }}
                  />
                  <select
                    value={currentVal}
                    onChange={(e) => setAccountField(account.id, def.id, e.target.value)}
                    className={`min-w-0 cursor-pointer appearance-none border-0 bg-transparent py-0 pl-0 pr-3 text-[11px] font-medium text-slate-700 outline-none dark:text-slate-200 ${focusRing}`}
                  >
                    {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </td>
            );
          }
          return (
            <td key={def.id} className="w-28 px-3 py-2.5">
              <select
                value={currentVal}
                onChange={(e) => setAccountField(account.id, def.id, e.target.value)}
                className={selectCls}
              >
                {opts.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </td>
          );
        }

        if (def.type === 'metric') {
          return (
            <td key={def.id} className="w-24 px-3 py-2.5">
              <MetricCell
                accountId={account.id}
                fieldDef={def}
                value={Number(rawVal) || 0}
              />
            </td>
          );
        }

        if (def.type === 'computed') {
          if (def.outputType === 'number') {
            return (
              <td key={def.id} className="w-24 px-3 py-2.5 text-right text-xs font-medium tabular-nums text-slate-700 dark:text-slate-200">
                {formatFieldValue(rawVal, def)}
              </td>
            );
          }
          // boolean or text
          return (
            <td key={def.id} className="max-w-[140px] px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
              {formatFieldValue(rawVal, def)}
            </td>
          );
        }

        // text
        return (
          <td key={def.id} className="max-w-[140px] px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400">
            <input
              defaultValue={String(rawVal ?? '')}
              onBlur={(e) => setAccountField(account.id, def.id, e.target.value)}
              className={`w-full rounded-md bg-transparent px-1.5 py-0.5 outline-none transition-colors hover:bg-slate-100/70 focus:bg-white focus:ring-1 focus:ring-indigo-500/40 dark:hover:bg-slate-800/50 dark:focus:bg-slate-900 ${focusRing}`}
            />
          </td>
        );
      })}

      {/* Rep */}
      <td className="w-36 px-3 py-2.5">
        <select
          value={account.repId ?? ''}
          onChange={(e) => updateAccount(account.id, { repId: e.target.value || null })}
          className={selectCls}
        >
          <option value="">— unassigned —</option>
          {allReps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </td>

      {/* Owner chain */}
      <td className="max-w-[260px] px-3 py-2.5">
        {(() => {
          const chain = ownerChainNames(account.repId, members, teams);
          if (chain.length === 0) {
            return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>;
          }
          return (
            <span
              className="block truncate font-mono text-[11px] text-slate-500 dark:text-slate-400"
              title={chain.join(' › ')}
            >
              {chain.map((name, i) => (
                <span key={i}>
                  {i > 0 && <span className="mx-1 text-indigo-400/80 dark:text-indigo-500/70">›</span>}
                  {name}
                </span>
              ))}
            </span>
          );
        })()}
      </td>

      {/* Delete */}
      <td className="w-10 px-2 py-2.5">
        <button
          onClick={() => { if (confirm(`Delete "${account.name}"?`)) deleteAccount(account.id); }}
          className={`invisible flex h-6 w-6 items-center justify-center rounded-md text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-500 group-hover:visible dark:text-slate-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400 ${focusRing}`}
          aria-label="Delete account"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 4h11M6.5 4V2.75A.75.75 0 017.25 2h1.5a.75.75 0 01.75.75V4M4 4l.6 8.4a1.5 1.5 0 001.5 1.35h3.8a1.5 1.5 0 001.5-1.35L12 4M6.75 7v4M9.25 7v4" />
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
  const entitySingular = useEntityNoun('singular');
  const entityPlural = useEntityNoun('plural');
  const ownerNoun = useOwnerNoun();
  const geoNodes = useGeoNodes();
  const geoNodeOrder = useGeoNodeOrder();
  const geoLabelById = useMemo(() => {
    const flat = flattenGeoTree(geoNodes, geoNodeOrder);
    const out: Record<string, string> = {};
    flat.forEach((row) => { out[row.id] = row.label; });
    return out;
  }, [geoNodes, geoNodeOrder]);
  const idMap = useMemo(() => Object.fromEntries(fieldDefs.map((d) => [d.id, d.label])), [fieldDefs]);
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
    const av = getAccountValue(a, sortKey, geoLabelById, members, teams);
    const bv = getAccountValue(b, sortKey, geoLabelById, members, teams);
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

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  function handleBulkDelete() {
    const ids = Array.from(selected);
    const noun = ids.length === 1 ? entitySingular.toLowerCase() : entityPlural.toLowerCase();
    if (!confirm(`Delete ${ids.length} ${noun}?`)) return;
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
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
        <svg className="h-12 w-12 text-slate-300 dark:text-slate-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.4}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
        </svg>
        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No {entityPlural.toLowerCase()} found</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">Add your first {entitySingular.toLowerCase()} to get started.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm shadow-slate-900/[0.03] dark:border-slate-800 dark:bg-slate-950">
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-gradient-to-b from-slate-50 to-slate-100/70 backdrop-blur-sm dark:from-slate-900 dark:to-slate-900/70">
            <tr className="border-b border-slate-200 shadow-[0_1px_0_0_rgb(15_23_42/0.04)] dark:border-slate-800">
              <th className="w-9 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  className={`h-3.5 w-3.5 rounded accent-indigo-600 ${focusRing}`}
                />
              </th>
              <SortHeader label="Name"    sortKey="name"    {...sortHeaderProps} />
              <SortHeader label="Country" sortKey="country" {...sortHeaderProps} />
              <SortHeader label="State"   sortKey="state"   {...sortHeaderProps} />
              <SortHeader label="Geo"     sortKey="geo"     {...sortHeaderProps} />
              {fieldDefs.map((def) => (
                <SortHeader
                  key={def.id}
                  label={
                    <span className="inline-flex items-center gap-1">
                      {def.label}
                      {def.type === 'computed' && (
                        <span
                          title={def.formula ? prettyPrint(def.formula, { idToName: idMap }) : 'Computed field'}
                          className="inline-flex h-3.5 w-3.5 items-center justify-center rounded bg-emerald-100 text-[10px] font-bold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                        >
                          ƒ
                        </span>
                      )}
                    </span>
                  }
                  sortKey={def.id}
                  right={def.type === 'metric' || (def.type === 'computed' && def.outputType === 'number')}
                  {...sortHeaderProps}
                />
              ))}
              <SortHeader label={ownerNoun} sortKey="repId" {...sortHeaderProps} />
              <SortHeader label="Owner Chain" sortKey="ownerChain" {...sortHeaderProps} />
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
                geoLabelById={geoLabelById}
                onToggleSelect={toggleSelect}
                onEdit={onEdit}
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div className="flex items-center gap-4 border-t border-slate-200 bg-gradient-to-t from-slate-100/80 to-slate-50 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:from-slate-900 dark:to-slate-900/60 dark:text-slate-400">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" aria-hidden="true" />
          <span className="font-medium text-slate-700 dark:text-slate-200 tabular-nums">{sorted.length}</span>
          <span>{sorted.length !== 1 ? 'accounts' : 'account'}</span>
        </span>
        {metricTotals.map(({ def, total }) => (
          <span key={def.id} className="inline-flex items-center gap-1.5">
            <span className="text-amber-500" aria-hidden="true">•</span>
            <span className="text-slate-500 dark:text-slate-400">{def.label}</span>
            <span className="font-mono font-semibold tabular-nums text-slate-800 dark:text-slate-100">
              {formatFieldValue(total, def)}
            </span>
          </span>
        ))}
        <div className="flex-1" />
        {selected.size > 0 && (
          <div className="flex items-center gap-2.5">
            <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[11px] font-medium text-white tabular-nums shadow-sm shadow-indigo-600/20">
              {selected.size} selected
            </span>
            <button
              onClick={handleBulkDelete}
              className={`rounded-md border border-rose-200 bg-rose-50 px-2.5 py-1 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-100 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-950/70 ${focusRing}`}
            >
              Delete selected
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className={`rounded-sm text-xs text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 ${focusRing}`}
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

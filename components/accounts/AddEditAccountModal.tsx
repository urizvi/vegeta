'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useActions, useTeams, useTeamOrder, useMembers } from '@/hooks/useTerritoryStore';
import { useGeoData } from '@/hooks/useGeoData';
import { useCountryStates } from '@/hooks/useCountryStates';
import {
  STAGE_OPTIONS, SEGMENT_OPTIONS, TIER_OPTIONS, INDUSTRY_OPTIONS, ACCOUNT_DEFAULTS,
} from '@/lib/accountFields';
import type { Account } from '@/types/account';

type FormState = Omit<Account, 'id'>;

const EMPTY_FORM: FormState = {
  name: '',
  country: '',
  ...ACCOUNT_DEFAULTS,
};

interface Props {
  account?: Account;  // provided when editing; omit when creating
  onClose: () => void;
}

export default function AddEditAccountModal({ account, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState<FormState>(() =>
    account ? { ...account } : { ...EMPTY_FORM },
  );
  const { addAccount, updateAccount } = useActions();
  const teams     = useTeams();
  const teamOrder = useTeamOrder();
  const members   = useMembers();

  const countries = useGeoData().filter((c) => c.iso2).sort((a, b) => a.name.localeCompare(b.name));
  const { features: stateFeatures, loading: statesLoading } = useCountryStates(form.country || null);
  const stateOptions = useMemo(
    () => [...stateFeatures].sort((a, b) => a.name.localeCompare(b.name)),
    [stateFeatures],
  );

  // All reps across all teams for the dropdown
  const allReps = useMemo(() =>
    teamOrder.flatMap((tid) => {
      const team = teams[tid];
      if (!team) return [];
      return team.memberIds.map((mid) => {
        const m = members[mid];
        return m ? { id: m.id, label: `${m.name} (${team.name})` } : null;
      }).filter(Boolean) as { id: string; label: string }[];
    }),
    [members, teams, teamOrder],
  );

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleCountryChange(iso2: string) {
    setForm((f) => ({ ...f, country: iso2, state: undefined }));
  }

  function handleStateChange(stateId: string) {
    setForm((f) => ({ ...f, state: stateId ? `${f.country}:${stateId}` : undefined }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.country) return;
    const cleaned = { ...form, name: form.name.trim() };
    if (account) {
      updateAccount(account.id, cleaned);
    } else {
      addAccount(cleaned);
    }
    onClose();
  }

  const currentStateId = form.state ? form.state.split(':')[1] : '';

  const inputCls = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100';
  const selectCls = inputCls;
  const labelCls = 'mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400';

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-black/30 dark:border-zinc-700 dark:bg-zinc-900"
      onClose={onClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
        <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {account ? 'Edit Account' : 'Add Account'}
        </h2>
        <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="max-h-[calc(100vh-12rem)] overflow-y-auto">
        <div className="space-y-5 p-5">

          {/* Basic info */}
          <div>
            <label className={labelCls}>Account Name *</label>
            <input
              autoFocus
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="e.g. Acme Corp"
              className={inputCls}
            />
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Country *</label>
              <select
                required
                value={form.country}
                onChange={(e) => handleCountryChange(e.target.value)}
                className={selectCls}
              >
                <option value="">Select country…</option>
                {countries.map((c) => (
                  <option key={c.iso2} value={c.iso2}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>State / Province</label>
              {!form.country ? (
                <select disabled className={`${selectCls} opacity-50`}>
                  <option>Select country first</option>
                </select>
              ) : statesLoading ? (
                <select disabled className={`${selectCls} opacity-50`}>
                  <option>Loading…</option>
                </select>
              ) : stateOptions.length === 0 ? (
                <select disabled className={`${selectCls} opacity-50`}>
                  <option>No state data</option>
                </select>
              ) : (
                <select
                  value={currentStateId}
                  onChange={(e) => handleStateChange(e.target.value)}
                  className={selectCls}
                >
                  <option value="">— none —</option>
                  {stateOptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Classification */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Classification</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Stage</label>
                <select value={form.stage} onChange={(e) => set('stage', e.target.value as typeof form.stage)} className={selectCls}>
                  {STAGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Segment</label>
                <select value={form.segment} onChange={(e) => set('segment', e.target.value as typeof form.segment)} className={selectCls}>
                  {SEGMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Industry</label>
                <select value={form.industry} onChange={(e) => set('industry', e.target.value as typeof form.industry)} className={selectCls}>
                  {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Tier</label>
                <select value={form.tier} onChange={(e) => set('tier', e.target.value as typeof form.tier)} className={selectCls}>
                  {TIER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            </div>
          </div>

          {/* Metrics */}
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Metrics</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>ARR ($)</label>
                <input
                  type="number" min={0} value={form.arr || ''}
                  onChange={(e) => set('arr', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>MRR ($)</label>
                <input
                  type="number" min={0} value={form.mrr || ''}
                  onChange={(e) => set('mrr', parseFloat(e.target.value) || 0)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Headcount</label>
                <input
                  type="number" min={0} step={1} value={form.headcount || ''}
                  onChange={(e) => set('headcount', parseInt(e.target.value) || 0)}
                  placeholder="0"
                  className={inputCls}
                />
              </div>
            </div>
          </div>

          {/* Assignment */}
          <div>
            <label className={labelCls}>Sales Rep</label>
            <select
              value={form.repId ?? ''}
              onChange={(e) => set('repId', e.target.value || null)}
              className={selectCls}
            >
              <option value="">— unassigned —</option>
              {allReps.map((r) => (
                <option key={r.id} value={r.id}>{r.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <button type="button" onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!form.name.trim() || !form.country}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {account ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

'use client';

import { useRef, useEffect, useState, useMemo, useId } from 'react';
import { useActions, useTeams, useTeamOrder, useMembers, useFieldDefs } from '@/hooks/useTerritoryStore';
import { useGeoData } from '@/hooks/useGeoData';
import { useCountryStates } from '@/hooks/useCountryStates';
import type { Account } from '@/types/account';

interface FormState {
  name: string;
  country: string;
  state?: string;
  repId: string | null;
  fields: Record<string, string | number>;
}

interface Props {
  account?: Account;
  onClose: () => void;
}

export default function AddEditAccountModal({ account, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const fieldDefs = useFieldDefs();
  const { addAccount, updateAccount } = useActions();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const teams     = useTeams();
  const teamOrder = useTeamOrder();
  const members   = useMembers();

  const countries = useGeoData().filter((c) => c.iso2).sort((a, b) => a.name.localeCompare(b.name));
  const [form, setForm] = useState<FormState>(() => {
    if (account) {
      return {
        name: account.name,
        country: account.country,
        state: account.state,
        repId: account.repId,
        fields: { ...account.fields },
      };
    }
    // Build defaults from fieldDefs
    const fields: Record<string, string | number> = {};
    fieldDefs.forEach((def) => {
      if (def.type === 'metric') fields[def.id] = 0;
      else if (def.type === 'categorical' && def.options?.length) fields[def.id] = def.options[0];
      else fields[def.id] = '';
    });
    return { name: '', country: '', repId: null, fields };
  });

  const { features: stateFeatures, loading: statesLoading } = useCountryStates(form.country || null);
  const stateOptions = useMemo(
    () => [...stateFeatures].sort((a, b) => a.name.localeCompare(b.name)),
    [stateFeatures],
  );

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

  function setField(fieldId: string, value: string | number) {
    setForm((f) => ({ ...f, fields: { ...f.fields, [fieldId]: value } }));
  }

  function handleCountryChange(iso2: string) {
    setForm((f) => ({ ...f, country: iso2, state: undefined }));
  }

  function handleStateChange(stateId: string) {
    setForm((f) => ({ ...f, state: stateId ? `${f.country}:${stateId}` : undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim() || !form.country) return;
    const data = { ...form, name: form.name.trim() };
    setSubmitting(true);
    setError(null);
    try {
      if (account) {
        await updateAccount(account.id, data);
      } else {
        await addAccount(data);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  }

  const currentStateId = form.state ? form.state.split(':')[1] : '';

  const inputCls = 'w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100';
  const selectCls = inputCls;
  const labelCls = 'mb-1 block text-xs font-medium text-zinc-500 dark:text-zinc-400';

  const categoricalFields = fieldDefs.filter((f) => f.type === 'categorical');
  const metricFields      = fieldDefs.filter((f) => f.type === 'metric');
  const textFields        = fieldDefs.filter((f) => f.type === 'text');

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="add-edit-account-title"
      className="m-auto w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-black/30 dark:border-zinc-700 dark:bg-zinc-900"
      onClose={onClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
        <h2 id="add-edit-account-title" className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
          {account ? 'Edit Account' : 'Add Account'}
        </h2>
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="max-h-[calc(100vh-12rem)] overflow-y-auto">
        <div className="space-y-5 p-5">

          {/* Name */}
          <div>
            <label htmlFor={`${uid}-name`} className={labelCls}>Account Name *</label>
            <input
              id={`${uid}-name`}
              autoFocus
              required
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Acme Corp"
              className={inputCls}
            />
          </div>

          {/* Location */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor={`${uid}-country`} className={labelCls}>Country *</label>
              <select
                id={`${uid}-country`}
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
              <label htmlFor={`${uid}-state`} className={labelCls}>State / Province</label>
              {!form.country ? (
                <select id={`${uid}-state`} disabled className={`${selectCls} opacity-50`}>
                  <option>Select country first</option>
                </select>
              ) : statesLoading ? (
                <select id={`${uid}-state`} disabled className={`${selectCls} opacity-50`}>
                  <option>Loading…</option>
                </select>
              ) : stateOptions.length === 0 ? (
                <select id={`${uid}-state`} disabled className={`${selectCls} opacity-50`}>
                  <option>No state data</option>
                </select>
              ) : (
                <select
                  id={`${uid}-state`}
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

          {/* Categorical fields */}
          {categoricalFields.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Classification</p>
              <div className="grid grid-cols-2 gap-3">
                {categoricalFields.map((def) => (
                  <div key={def.id}>
                    <label htmlFor={`${uid}-f-${def.id}`} className={labelCls}>{def.label}</label>
                    <select
                      id={`${uid}-f-${def.id}`}
                      value={String(form.fields[def.id] ?? def.options?.[0] ?? '')}
                      onChange={(e) => setField(def.id, e.target.value)}
                      className={selectCls}
                    >
                      {(def.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metric fields */}
          {metricFields.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Metrics</p>
              <div className="grid grid-cols-3 gap-3">
                {metricFields.map((def) => (
                  <div key={def.id}>
                    <label htmlFor={`${uid}-f-${def.id}`} className={labelCls}>
                      {def.label}{def.isCurrency ? ' ($)' : ''}
                    </label>
                    <input
                      id={`${uid}-f-${def.id}`}
                      type="number"
                      min={0}
                      step={def.isCurrency ? 'any' : '1'}
                      value={Number(form.fields[def.id]) || ''}
                      onChange={(e) => setField(def.id, parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Text fields */}
          {textFields.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Details</p>
              <div className="space-y-3">
                {textFields.map((def) => (
                  <div key={def.id}>
                    <label htmlFor={`${uid}-f-${def.id}`} className={labelCls}>{def.label}</label>
                    <input
                      id={`${uid}-f-${def.id}`}
                      type="text"
                      value={String(form.fields[def.id] ?? '')}
                      onChange={(e) => setField(def.id, e.target.value)}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assignment */}
          <div>
            <label htmlFor={`${uid}-rep`} className={labelCls}>Sales Rep</label>
            <select
              id={`${uid}-rep`}
              value={form.repId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, repId: e.target.value || null }))}
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
          {error && (
            <p role="alert" className="mr-auto text-xs text-red-600 dark:text-red-400">{error}</p>
          )}
          <button type="button" onClick={onClose} disabled={submitting} className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-50 disabled:opacity-50 dark:hover:bg-zinc-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={!form.name.trim() || !form.country || submitting}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {submitting ? 'Saving…' : account ? 'Save Changes' : 'Add Account'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

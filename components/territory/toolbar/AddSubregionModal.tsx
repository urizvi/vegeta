'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useActions, useTeams, useTeamOrder } from '@/hooks/useTerritoryStore';
import { useRegionStates } from '@/hooks/useRegionStates';
import type { Region } from '@/types/territory';

interface AddSubregionModalProps {
  parentRegion: Region;
  onClose: () => void;
}

export default function AddSubregionModal({ parentRegion, onClose }: AddSubregionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [teamId, setTeamId] = useState<string>('');
  const { addSubregion } = useActions();
  const teams = useTeams();
  const teamOrder = useTeamOrder();

  const { features, loading } = useRegionStates(parentRegion.countryCodes);

  // Group states by country ISO2, sorted by country then state name.
  // Codes use the "ISO2:iso_3166_2" format (e.g. "US:US-CA") consistent with entityCodes everywhere.
  const byCountry = useMemo(() => {
    const map = new Map<string, { code: string; name: string }[]>();
    features.forEach((f) => {
      if (!map.has(f.iso2)) map.set(f.iso2, []);
      map.get(f.iso2)!.push({ code: `${f.iso2}:${f.id}`, name: f.name });
    });
    map.forEach((states) => states.sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [features]);

  const allStateCodes = useMemo(() => features.map((f) => `${f.iso2}:${f.id}`), [features]);

  const filtered = useMemo(() => {
    if (!search.trim()) return byCountry;
    const q = search.toLowerCase();
    const result = new Map<string, { code: string; name: string }[]>();
    byCountry.forEach((states, iso2) => {
      const matching = states.filter(
        (s) => s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q),
      );
      if (matching.length > 0) result.set(iso2, matching);
    });
    return result;
  }, [byCountry, search]);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  function toggleCountry(iso2: string) {
    const states = byCountry.get(iso2) ?? [];
    const codes = states.map((s) => s.code);
    const allChecked = codes.every((c) => selected.has(c));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) {
        codes.forEach((c) => next.delete(c));
      } else {
        codes.forEach((c) => next.add(c));
      }
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === allStateCodes.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(allStateCodes));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || selected.size === 0) return;
    addSubregion(name.trim(), parentRegion.id, Array.from(selected), teamId || null);
    onClose();
  }

  const allSelected = allStateCodes.length > 0 && selected.size === allStateCodes.length;

  return (
    <dialog
      ref={dialogRef}
      className="m-auto w-full max-w-lg rounded-2xl border border-zinc-200 bg-white p-6 shadow-2xl backdrop:bg-black/30 dark:border-zinc-700 dark:bg-zinc-900"
      onClose={onClose}
    >
      <h2 className="mb-0.5 text-lg font-semibold text-zinc-800 dark:text-zinc-100">
        New Subregion
      </h2>
      <p className="mb-4 text-sm text-zinc-400">Within {parentRegion.name}</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Name */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Subregion Name
          </label>
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. UK & Ireland"
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />
        </div>

        {/* Assign to team */}
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Assign to Team <span className="font-normal text-zinc-400">(optional)</span>
          </label>
          <select
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          >
            <option value="">Unassigned</option>
            {teamOrder.map((tid) => {
              const team = teams[tid];
              if (!team) return null;
              return (
                <option key={tid} value={tid}>
                  {team.name}
                </option>
              );
            })}
          </select>
        </div>

        {/* State / province picker */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-600 dark:text-zinc-400">
              States / Provinces
              {!loading && (
                <span className="ml-1.5 font-normal text-zinc-400">
                  ({selected.size} of {allStateCodes.length} selected)
                </span>
              )}
            </label>
            {!loading && (
              <button type="button" onClick={toggleAll} className="text-xs text-blue-500 hover:underline">
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            )}
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search states / provinces…"
            className="mb-2 w-full rounded-lg border border-zinc-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
          />

          <div className="max-h-60 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-sm text-zinc-400">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading states…
              </div>
            ) : filtered.size === 0 ? (
              <p className="py-4 text-center text-sm text-zinc-400">No states found.</p>
            ) : (
              Array.from(filtered.entries()).map(([iso2, states]) => {
                const allCountryChecked = states.every((s) => selected.has(s.code));
                const someCountryChecked = !allCountryChecked && states.some((s) => selected.has(s.code));
                return (
                  <div key={iso2}>
                    {/* Country header row */}
                    <label className="flex cursor-pointer items-center gap-2.5 border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-800/60 dark:hover:bg-zinc-800">
                      <input
                        type="checkbox"
                        checked={allCountryChecked}
                        ref={(el) => { if (el) el.indeterminate = someCountryChecked; }}
                        onChange={() => toggleCountry(iso2)}
                        className="h-3.5 w-3.5 rounded accent-blue-600"
                      />
                      {iso2} ({states.length})
                    </label>
                    {/* State rows */}
                    {states.map((s) => (
                      <label
                        key={s.code}
                        className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <input
                          type="checkbox"
                          checked={selected.has(s.code)}
                          onChange={() => toggle(s.code)}
                          className="h-3.5 w-3.5 rounded accent-blue-600"
                        />
                        <span className="flex-1 text-zinc-700 dark:text-zinc-200">{s.name}</span>
                        <span className="text-xs text-zinc-400">{s.code}</span>
                      </label>
                    ))}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={!name.trim() || selected.size === 0}
            className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create Subregion
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-zinc-200 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

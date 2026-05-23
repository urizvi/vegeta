'use client';

import { useRef, useEffect, useState, useMemo } from 'react';
import { useActions } from '@/hooks/useTerritoryStore';
import { useGeoData } from '@/hooks/useGeoData';
import { flagEmoji } from '@/lib/geoUtils';
import type { Region } from '@/types/territory';

interface EditRegionModalProps {
  region: Region;
  onClose: () => void;
}

export default function EditRegionModal({ region, onClose }: EditRegionModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set(region.countryCodes));
  const { updateRegionCountries } = useActions();
  const countries = useGeoData();

  const sorted = useMemo(
    () => countries.filter((c) => c.iso2).sort((a, b) => a.name.localeCompare(b.name)),
    [countries],
  );

  const filtered = useMemo(
    () =>
      search.trim()
        ? sorted.filter(
            (c) =>
              c.name.toLowerCase().includes(search.toLowerCase()) ||
              c.iso2.toLowerCase().includes(search.toLowerCase()),
          )
        : sorted,
    [sorted, search],
  );

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  function toggle(iso2: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(iso2)) next.delete(iso2); else next.add(iso2);
      return next;
    });
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    updateRegionCountries(region.id, Array.from(selected));
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="edit-region-title"
      className="m-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl backdrop:bg-black/30 dark:border-slate-700 dark:bg-slate-900"
      onClose={onClose}
    >
      <h2 id="edit-region-title" className="mb-0.5 text-lg font-semibold text-slate-800 dark:text-slate-100">
        Edit Countries
      </h2>
      <p className="mb-4 text-sm text-slate-400">
        {region.name} — {selected.size} selected
      </p>

      <form onSubmit={handleSave} className="flex flex-col gap-3">
        <input
          autoFocus
          aria-label="Search countries"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search countries…"
          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />

        <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
          {filtered.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-400">No countries found.</p>
          ) : (
            filtered.map((c) => (
              <label
                key={c.iso2}
                className="flex cursor-pointer items-center gap-2.5 border-b border-slate-50 px-3 py-2 text-sm last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800"
              >
                <input
                  type="checkbox"
                  checked={selected.has(c.iso2)}
                  onChange={() => toggle(c.iso2)}
                  className="h-3.5 w-3.5 rounded accent-indigo-600"
                />
                <span className="text-base leading-none">{flagEmoji(c.iso2)}</span>
                <span className="flex-1 text-slate-700 dark:text-slate-200">{c.name}</span>
                <span className="text-xs text-slate-400">{c.iso2}</span>
              </label>
            ))
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}

'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  useActions,
  usePipelineStages,
  usePipelineStageOrder,
  useAccountOrder,
  useTerritoryStore,
} from '@/hooks/useTerritoryStore';
import { useEntityNoun } from '@/hooks/useEntityNoun';

interface Props {
  onClose: () => void;
}

export default function ManageStagesModal({ onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const uid = useId();
  const stages = usePipelineStages();
  const order = usePipelineStageOrder();
  const accountOrder = useAccountOrder();
  const accounts = useTerritoryStore((s) => s.accounts);
  const { addStage, updateStage, removeStage, reorderStages } = useActions();
  const entityPlural = useEntityNoun('plural');

  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#e5e7eb');
  const [labelDrafts, setLabelDrafts] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    fallbackId: string | null;
    count: number;
  } | null>(null);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  const accountCountByStage = useMemo(() => {
    const out: Record<string, number> = {};
    for (const aid of accountOrder) {
      const sid = accounts[aid]?.stageId;
      if (!sid) continue;
      out[sid] = (out[sid] ?? 0) + 1;
    }
    return out;
  }, [accounts, accountOrder]);

  function handleMove(id: string, dir: -1 | 1) {
    const idx = order.indexOf(id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= order.length) return;
    const nextOrder = [...order];
    [nextOrder[idx], nextOrder[next]] = [nextOrder[next], nextOrder[idx]];
    reorderStages(nextOrder);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newLabel.trim()) return;
    addStage(newLabel.trim(), newColor);
    setNewLabel('');
    setNewColor('#e5e7eb');
  }

  function startDelete(id: string) {
    const count = accountCountByStage[id] ?? 0;
    const fallback = order.find((sid) => sid !== id) ?? null;
    setConfirmDelete({ id, fallbackId: fallback, count });
  }

  function confirmRemoval() {
    if (!confirmDelete) return;
    removeStage(confirmDelete.id, confirmDelete.fallbackId);
    setConfirmDelete(null);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="manage-stages-title"
      className="m-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-black/30 dark:border-slate-700 dark:bg-slate-900"
      onClose={onClose}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <h2 id="manage-stages-title" className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Manage Pipeline Stages
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-5">
        {order.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No stages defined yet. Add one below.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {order.map((id, idx) => {
              const stg = stages[id];
              if (!stg) return null;
              const draft = labelDrafts[id] ?? stg.label;
              const accountCount = accountCountByStage[id] ?? 0;
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-800/50"
                >
                  <div className="flex flex-shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => handleMove(id, -1)}
                      disabled={idx === 0}
                      aria-label="Move up"
                      className="flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-slate-700"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 4l4 5H4l4-5z" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMove(id, 1)}
                      disabled={idx === order.length - 1}
                      aria-label="Move down"
                      className="flex h-4 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-200 disabled:opacity-30 dark:hover:bg-slate-700"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                        <path d="M8 12L4 7h8l-4 5z" />
                      </svg>
                    </button>
                  </div>
                  <label className="flex-shrink-0 cursor-pointer">
                    <span className="sr-only">Color for {stg.label}</span>
                    <input
                      type="color"
                      value={stg.color}
                      onChange={(e) => updateStage(id, { color: e.target.value })}
                      className="h-0 w-0 opacity-0"
                    />
                    <span
                      className="inline-block h-5 w-5 rounded-full border-2 border-white/60 shadow"
                      style={{ backgroundColor: stg.color }}
                    />
                  </label>
                  <input
                    value={draft}
                    onChange={(e) => setLabelDrafts((d) => ({ ...d, [id]: e.target.value }))}
                    onBlur={() => {
                      const trimmed = draft.trim();
                      if (trimmed && trimmed !== stg.label) updateStage(id, { label: trimmed });
                      setLabelDrafts((d) => {
                        const next = { ...d };
                        delete next[id];
                        return next;
                      });
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                  />
                  <label
                    className="flex flex-shrink-0 cursor-pointer items-center gap-1 text-[10px] text-slate-500"
                    title="Successful completion — e.g. Won, Sold, Active"
                  >
                    <input
                      type="checkbox"
                      checked={stg.isWon}
                      onChange={(e) => updateStage(id, { isWon: e.target.checked, isLost: e.target.checked ? false : stg.isLost })}
                      className="h-3 w-3 rounded accent-emerald-500"
                    />
                    Complete
                  </label>
                  <label
                    className="flex flex-shrink-0 cursor-pointer items-center gap-1 text-[10px] text-slate-500"
                    title="Dropped / abandoned — e.g. Lost, Churned, Withdrawn"
                  >
                    <input
                      type="checkbox"
                      checked={stg.isLost}
                      onChange={(e) => updateStage(id, { isLost: e.target.checked, isWon: e.target.checked ? false : stg.isWon })}
                      className="h-3 w-3 rounded accent-rose-500"
                    />
                    Dropped
                  </label>
                  <span
                    className="flex-shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                    title="Stable slug — human-readable identifier"
                  >
                    {stg.slug}
                  </span>
                  <span
                    className="flex-shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300"
                    title={`${entityPlural} at this stage`}
                  >
                    {accountCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => startDelete(id)}
                    aria-label={`Delete ${stg.label}`}
                    className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded text-slate-400 hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-900/30"
                  >
                    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                      <path d="M6.5 1.75a.25.25 0 01.25-.25h2.5a.25.25 0 01.25.25V3h-3V1.75zm4.5 0V3h2.25a.75.75 0 010 1.5H.75a.75.75 0 010-1.5H3V1.75C3 .784 3.784 0 4.75 0h6.5C12.216 0 13 .784 13 1.75zM4.496 6.675a.75.75 0 10-1.492.15l.66 6.6A1.75 1.75 0 005.405 15h5.19a1.75 1.75 0 001.741-1.575l.66-6.6a.75.75 0 00-1.492-.15l-.66 6.6a.25.25 0 01-.249.225h-5.19a.25.25 0 01-.249-.225l-.66-6.6z" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <form
        onSubmit={handleAdd}
        className="flex items-center gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700"
      >
        <label htmlFor={`${uid}-new-color`} className="cursor-pointer">
          <span className="sr-only">Color</span>
          <input
            id={`${uid}-new-color`}
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            className="h-0 w-0 opacity-0"
          />
          <span
            className="inline-block h-5 w-5 rounded-full border-2 border-white/60 shadow"
            style={{ backgroundColor: newColor }}
          />
        </label>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="New stage (e.g. Negotiation)"
          className="flex-1 rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
        />
        <button
          type="submit"
          disabled={!newLabel.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add stage
        </button>
      </form>

      {confirmDelete && (
        <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/60 p-5">
          <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl dark:bg-slate-800">
            <h3 className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
              Delete &quot;{stages[confirmDelete.id]?.label}&quot;?
            </h3>
            {confirmDelete.count > 0 ? (
              <>
                <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                  {confirmDelete.count} account{confirmDelete.count !== 1 ? 's are' : ' is'} at this stage. Reassign to:
                </p>
                <select
                  value={confirmDelete.fallbackId ?? ''}
                  onChange={(e) =>
                    setConfirmDelete((c) => (c ? { ...c, fallbackId: e.target.value || null } : c))
                  }
                  className="mb-3 w-full rounded border border-slate-200 px-2 py-1.5 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100"
                >
                  <option value="">— no stage —</option>
                  {order.filter((sid) => sid !== confirmDelete.id).map((sid) => (
                    <option key={sid} value={sid}>{stages[sid]?.label ?? sid}</option>
                  ))}
                </select>
              </>
            ) : (
              <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
                No accounts are at this stage — safe to delete.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded px-3 py-1.5 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmRemoval}
                className="rounded bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </dialog>
  );
}

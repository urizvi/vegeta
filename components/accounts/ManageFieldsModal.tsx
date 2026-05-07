'use client';

import { useRef, useEffect, useState, memo } from 'react';
import { useFieldDefs, useActions } from '@/hooks/useTerritoryStore';
import type { FieldDefinition, FieldType } from '@/lib/accountFields';

// ── Individual field row ──────────────────────────────────────────────────────

const FieldRow = memo(function FieldRow({
  def,
  isDragging,
  isDropTarget,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  def: FieldDefinition;
  isDragging: boolean;
  isDropTarget: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const [optInput, setOptInput] = useState('');
  const [label, setLabel] = useState(def.label);
  const [lastSeenLabel, setLastSeenLabel] = useState(def.label);
  const { updateFieldDef, removeFieldDef } = useActions();

  // Re-seed local edit state if the store-side label changes externally.
  if (def.label !== lastSeenLabel) {
    setLastSeenLabel(def.label);
    setLabel(def.label);
  }

  function commitLabel() {
    const v = label.trim();
    if (!v) { setLabel(def.label); return; }
    if (v !== def.label) updateFieldDef(def.id, { label: v });
  }

  function addOption() {
    const val = optInput.trim();
    if (!val || def.options?.includes(val)) return;
    updateFieldDef(def.id, { options: [...(def.options ?? []), val] });
    setOptInput('');
  }

  function removeOption(opt: string) {
    updateFieldDef(def.id, { options: (def.options ?? []).filter((o) => o !== opt) });
  }

  const typeBadge: Record<FieldType, string> = {
    categorical: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    metric:      'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    text:        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  };

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(e); }}
      onDragLeave={onDragLeave}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}
      onDragEnd={onDragEnd}
      className={`rounded-lg border p-3 transition-all ${
        isDragging ? 'opacity-40' : ''
      } ${
        isDropTarget
          ? 'border-indigo-400 bg-indigo-50/50 dark:border-indigo-600 dark:bg-indigo-950/20'
          : 'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900'
      }`}
    >
      <div className="flex items-center gap-2">
        {/* Drag handle (visual) + keyboard reorder buttons */}
        <span aria-hidden="true" className="cursor-grab select-none text-slate-300 dark:text-slate-600 active:cursor-grabbing">
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5 3a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zM5 7a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2zm-6 4a1 1 0 110 2 1 1 0 010-2zm6 0a1 1 0 110 2 1 1 0 010-2z" />
          </svg>
        </span>
        <div className="flex shrink-0 flex-col">
          <button
            type="button"
            onClick={onMoveUp}
            disabled={!canMoveUp}
            aria-label={`Move ${def.label} up`}
            className="flex h-3 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 2l4 5H1z" /></svg>
          </button>
          <button
            type="button"
            onClick={onMoveDown}
            disabled={!canMoveDown}
            aria-label={`Move ${def.label} down`}
            className="flex h-3 w-4 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <svg className="h-2.5 w-2.5" viewBox="0 0 10 10" fill="currentColor" aria-hidden="true"><path d="M5 8L1 3h8z" /></svg>
          </button>
        </div>

        {/* Label */}
        <input
          aria-label="Field label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={commitLabel}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); }
            else if (e.key === 'Escape') { setLabel(def.label); e.currentTarget.blur(); }
          }}
          className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-medium text-slate-800 outline-none focus:border-slate-200 focus:bg-slate-50 dark:text-slate-100 dark:focus:border-slate-700 dark:focus:bg-slate-800"
        />

        {/* Type badge */}
        <span className={`shrink-0 rounded px-2 py-0.5 text-[11px] font-medium ${typeBadge[def.type]}`}>
          {def.type}
        </span>

        {/* Currency toggle for metrics */}
        {def.type === 'metric' && (
          <label className="flex shrink-0 cursor-pointer items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={!!def.isCurrency}
              onChange={(e) => updateFieldDef(def.id, { isCurrency: e.target.checked })}
              className="h-3 w-3 accent-indigo-600"
            />
            $
          </label>
        )}

        {/* Delete */}
        <button
          onClick={() => {
            if (confirm(`Remove field "${def.label}"? Existing account data for this field will be retained but hidden.`)) {
              removeFieldDef(def.id);
            }
          }}
          className="shrink-0 flex h-6 w-6 items-center justify-center rounded text-slate-300 hover:bg-rose-50 hover:text-rose-500 dark:text-slate-600 dark:hover:bg-rose-950 dark:hover:text-rose-400"
          aria-label={`Remove ${def.label}`}
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      {/* Options editor for categorical */}
      {def.type === 'categorical' && (
        <div className="mt-2 flex flex-wrap items-center gap-1 pl-6">
          {(def.options ?? []).map((opt) => (
            <span
              key={opt}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {opt}
              <button
                onClick={() => removeOption(opt)}
                className="ml-0.5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400"
                aria-label={`Remove option ${opt}`}
              >
                ×
              </button>
            </span>
          ))}
          <input
            value={optInput}
            onChange={(e) => setOptInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addOption(); }
            }}
            placeholder="+ add option"
            className="rounded border border-dashed border-slate-200 bg-transparent px-2 py-0.5 text-xs text-slate-500 outline-none placeholder:text-slate-300 focus:border-slate-400 dark:border-slate-700 dark:placeholder:text-slate-600"
          />
        </div>
      )}
    </div>
  );
});

// ── Add Field form ────────────────────────────────────────────────────────────

function AddFieldForm() {
  const [label,       setLabel]       = useState('');
  const [type,        setType]        = useState<FieldType>('categorical');
  const [isCurrency,  setIsCurrency]  = useState(false);
  const [optInput,    setOptInput]    = useState('');
  const [options,     setOptions]     = useState<string[]>([]);
  const { addFieldDef } = useActions();

  function addOption() {
    const v = optInput.trim();
    if (!v || options.includes(v)) return;
    setOptions((o) => [...o, v]);
    setOptInput('');
  }

  function removeOption(opt: string) {
    setOptions((o) => o.filter((x) => x !== opt));
  }

  function handleSubmit() {
    const trimmed = label.trim();
    if (!trimmed) return;
    addFieldDef({
      label: trimmed,
      type,
      entity: 'account',
      ...(type === 'categorical' ? { options } : {}),
      ...(type === 'metric' ? { isCurrency } : {}),
    });
    setLabel('');
    setType('categorical');
    setIsCurrency(false);
    setOptions([]);
    setOptInput('');
  }

  const selectCls = 'rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-6 text-xs text-slate-600 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300';

  return (
    <div className="rounded-lg border border-dashed border-slate-200 p-3 dark:border-slate-700">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Add Field</p>
      <div className="flex items-center gap-2">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="Field name…"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <select value={type} onChange={(e) => setType(e.target.value as FieldType)} className={selectCls}>
          <option value="categorical">Categorical</option>
          <option value="metric">Metric</option>
          <option value="text">Text</option>
        </select>
        {type === 'metric' && (
          <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={isCurrency}
              onChange={(e) => setIsCurrency(e.target.checked)}
              className="h-3 w-3 accent-indigo-600"
            />
            Currency ($)
          </label>
        )}
        <button
          onClick={handleSubmit}
          disabled={!label.trim()}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {type === 'categorical' && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {options.map((opt) => (
            <span
              key={opt}
              className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {opt}
              <button onClick={() => removeOption(opt)} className="text-slate-400 hover:text-rose-500">×</button>
            </span>
          ))}
          <input
            value={optInput}
            onChange={(e) => setOptInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOption(); } }}
            placeholder="+ add option (Enter)"
            className="rounded border border-dashed border-slate-200 bg-transparent px-2 py-0.5 text-xs text-slate-500 outline-none placeholder:text-slate-300 focus:border-slate-400 dark:border-slate-700 dark:placeholder:text-slate-600"
          />
        </div>
      )}
    </div>
  );
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props { onClose: () => void }

export default function ManageFieldsModal({ onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fieldDefs = useFieldDefs();
  const { reorderFieldDefs } = useActions();

  const [draggingId,   setDraggingId]   = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);

  useEffect(() => { dialogRef.current?.showModal(); }, []);

  function handleDrop(targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    const ids = fieldDefs.map((f) => f.id);
    const fromIdx = ids.indexOf(draggingId);
    const toIdx   = ids.indexOf(targetId);
    const next = [...ids];
    next.splice(fromIdx, 1);
    next.splice(toIdx, 0, draggingId);
    reorderFieldDefs(next);
  }

  function moveBy(id: string, delta: -1 | 1) {
    const ids = fieldDefs.map((f) => f.id);
    const from = ids.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to], next[from]];
    reorderFieldDefs(next);
  }

  function handleDragEnd() {
    setDraggingId(null);
    setDropTargetId(null);
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="manage-fields-title"
      className="m-auto w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-black/30 dark:border-slate-700 dark:bg-slate-900"
      onClose={onClose}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div>
          <h2 id="manage-fields-title" className="text-sm font-semibold text-slate-800 dark:text-slate-100">Manage Fields</h2>
          <p className="mt-0.5 text-xs text-slate-400">Define the fields available on every account.</p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      <div className="max-h-[calc(100vh-14rem)] space-y-2 overflow-y-auto p-5">
        {fieldDefs.length === 0 && (
          <p className="py-4 text-center text-sm text-slate-400">No fields yet. Add one below.</p>
        )}
        {fieldDefs.map((def, idx) => (
          <FieldRow
            key={def.id}
            def={def}
            isDragging={draggingId === def.id}
            isDropTarget={dropTargetId === def.id && draggingId !== def.id}
            canMoveUp={idx > 0}
            canMoveDown={idx < fieldDefs.length - 1}
            onMoveUp={() => moveBy(def.id, -1)}
            onMoveDown={() => moveBy(def.id, 1)}
            onDragStart={() => setDraggingId(def.id)}
            onDragOver={() => setDropTargetId(def.id)}
            onDragLeave={() => { if (dropTargetId === def.id) setDropTargetId(null); }}
            onDrop={() => handleDrop(def.id)}
            onDragEnd={handleDragEnd}
          />
        ))}

        <AddFieldForm />
      </div>

      <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        <button
          onClick={onClose}
          className="rounded-lg bg-slate-900 px-4 py-1.5 text-sm font-medium text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-300"
        >
          Done
        </button>
      </div>
    </dialog>
  );
}

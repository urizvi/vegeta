'use client';

import { useEffect, useRef, useState } from 'react';
import type { ComputedOutput } from '@/lib/accountFields';

interface Props {
  fieldLabel: string;
  currentType: ComputedOutput;
  onCancel: () => void;
  onConfirm: (next: ComputedOutput) => void;
}

export default function ConvertOutputDialog({ fieldLabel, currentType, onCancel, onConfirm }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [next, setNext] = useState<ComputedOutput>(currentType === 'number' ? 'text' : 'number');
  useEffect(() => { dialogRef.current?.showModal(); }, []);

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      className="m-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-black/30 dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Convert output type</h2>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm text-slate-600 dark:text-slate-300">
        <p>
          This will <strong>clear the formula</strong> for <em>{fieldLabel}</em> and recompute it as the new type
          for every account. Existing materialized values for this field will be overwritten.
        </p>
        <label className="flex items-center gap-2">
          New type:
          <select
            value={next}
            onChange={(e) => setNext(e.target.value as ComputedOutput)}
            className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
          >
            {(['number', 'text', 'boolean'] as ComputedOutput[])
              .filter((t) => t !== currentType)
              .map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        <button onClick={onCancel}
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button onClick={() => onConfirm(next)}
          className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700">
          Convert
        </button>
      </div>
    </dialog>
  );
}

'use client';

import type { FieldDefinition, FieldType } from '@/lib/accountFields';

const TYPE_LABEL: Record<FieldType, string> = {
  categorical: 'Dropdown',
  metric:      'Number',
  text:        'Text',
};

const TYPE_BADGE: Record<FieldType, string> = {
  categorical: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  metric:      'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  text:        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

interface Props {
  orphans: FieldDefinition[];
  fieldsToRemove: Set<string>;
  onToggleRemove: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}

export default function ReconcileStep({ orphans, fieldsToRemove, onToggleRemove, onConfirm, onBack }: Props) {
  const removeCount = fieldsToRemove.size;

  return (
    <div className="space-y-4">
      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575zm1.763.707a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zM9.75 11a1.75 1.75 0 11-3.5 0 1.75 1.75 0 013.5 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z" />
        </svg>
        <div className="text-xs text-amber-800 dark:text-amber-200">
          <p className="font-semibold">Some existing fields aren&apos;t in this file.</p>
          <p className="mt-0.5 opacity-80">
            Check any you&apos;d like to remove. Unchecked fields are kept.
            {removeCount > 0 && ` ${removeCount} marked for removal.`}
          </p>
        </div>
      </div>

      <div className="max-h-64 space-y-1 overflow-y-auto pr-1">
        {orphans.map((def) => {
          const willRemove = fieldsToRemove.has(def.id);
          return (
            <label
              key={def.id}
              className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                willRemove
                  ? 'border-rose-200 bg-rose-50/60 dark:border-rose-800/50 dark:bg-rose-950/20'
                  : 'border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900'
              }`}
            >
              <input
                type="checkbox"
                checked={willRemove}
                onChange={() => onToggleRemove(def.id)}
                className="h-3.5 w-3.5 accent-rose-500"
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-medium ${willRemove ? 'text-rose-600 line-through dark:text-rose-400' : 'text-slate-700 dark:text-slate-200'}`}>
                  {def.label}
                </p>
              </div>
              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[def.type]}`}>
                {TYPE_LABEL[def.type]}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
        <button
          onClick={onBack}
          className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
        >
          ← Back
        </button>
        <button
          onClick={onConfirm}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

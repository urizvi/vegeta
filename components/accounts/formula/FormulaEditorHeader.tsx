'use client';

import type { ComputedOutput, FieldDefinition } from '@/lib/accountFields';

interface Props {
  label: string;
  onLabelChange: (v: string) => void;
  outputType: ComputedOutput;
  outputTypeLocked: boolean;
  onOutputTypeChange: (v: ComputedOutput) => void;
  onRequestConvert: () => void;
  isCurrency: boolean;
  onIsCurrencyChange: (v: boolean) => void;
  mode: 'simple' | 'advanced';
  onModeChange: (m: 'simple' | 'advanced') => void;
  previewAccountId: string | null;
  previewOptions: Array<{ id: string; name: string }>;
  onPreviewAccountChange: (id: string) => void;
  previewLabel: string;
}

export default function FormulaEditorHeader(props: Props) {
  return (
    <div className="space-y-3 border-b border-slate-200 px-5 py-4 dark:border-slate-700">
      <div className="flex items-center gap-2">
        <input
          aria-label="Field name"
          value={props.label}
          onChange={(e) => props.onLabelChange(e.target.value)}
          placeholder="Field name…"
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <select
          aria-label="Output type"
          value={props.outputType}
          disabled={props.outputTypeLocked}
          onChange={(e) => props.onOutputTypeChange(e.target.value as ComputedOutput)}
          className="rounded-lg border border-slate-200 bg-white py-1.5 pl-2.5 pr-6 text-xs text-slate-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
        >
          <option value="number">Number</option>
          <option value="text">Text</option>
          <option value="boolean">Boolean</option>
        </select>
        {props.outputTypeLocked && (
          <button
            type="button"
            onClick={props.onRequestConvert}
            className="rounded-lg border border-rose-300 px-2.5 py-1.5 text-xs text-rose-600 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400 dark:hover:bg-rose-950"
          >
            Convert output type…
          </button>
        )}
        {props.outputType === 'number' && (
          <label className="flex cursor-pointer items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <input
              type="checkbox"
              checked={props.isCurrency}
              onChange={(e) => props.onIsCurrencyChange(e.target.checked)}
              className="h-3 w-3 accent-indigo-600"
            />
            $
          </label>
        )}
      </div>

      <div className="flex items-center gap-4">
        <div role="tablist" aria-label="Mode" className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
          {(['simple', 'advanced'] as const).map((m) => (
            <button
              key={m}
              role="tab"
              aria-selected={props.mode === m}
              onClick={() => props.onModeChange(m)}
              className={`rounded-md px-2.5 py-1 text-xs ${
                props.mode === m
                  ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              {m === 'simple' ? 'Simple' : 'Advanced'}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          Preview against
          <select
            value={props.previewAccountId ?? ''}
            onChange={(e) => props.onPreviewAccountChange(e.target.value)}
            className="rounded border border-slate-200 bg-white py-1 pl-1.5 pr-5 text-xs dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            <option value="">— pick an account —</option>
            {props.previewOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </label>

        <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
          Result: <strong className="text-slate-800 dark:text-slate-100">{props.previewLabel}</strong>
        </span>
      </div>
    </div>
  );
}

export type { Props as FormulaEditorHeaderProps };
export function isFieldDefinitionComputed(def: FieldDefinition): boolean {
  return def.type === 'computed';
}

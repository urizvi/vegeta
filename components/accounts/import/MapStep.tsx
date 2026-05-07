'use client';

import type { FieldDefinition } from '@/lib/accountFields';
import type { PreviewRow } from './importHelpers';
import { useOwnerNoun } from '@/hooks/useOwnerNoun';

interface Props {
  fieldDefs: FieldDefinition[];
  preview: PreviewRow[] | null;
  onBack: () => void;
}

export default function MapStep({ fieldDefs, preview, onBack }: Props) {
  const validCount = preview?.filter((r) => r.valid).length ?? 0;
  const skipCount  = (preview?.length ?? 0) - validCount;
  const firstDef   = fieldDefs[0];
  const ownerNoun = useOwnerNoun();

  return (
    <>
      {preview && preview.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Preview
            <span className="ml-2 font-normal normal-case text-slate-500">
              {validCount} valid
              {skipCount > 0 && <span className="text-rose-400"> · {skipCount} skipped</span>}
            </span>
          </p>
          <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-100 dark:border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  {['Name', 'Country', firstDef?.label ?? '—', ownerNoun].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-medium text-slate-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(0, 8).map((row, i) => (
                  <tr key={i} className={`border-t border-slate-50 dark:border-slate-800 ${!row.valid ? 'opacity-40' : ''}`}>
                    <td className="max-w-[120px] truncate px-3 py-1.5 text-slate-700 dark:text-slate-300">{row.name || <span className="text-rose-400">—</span>}</td>
                    <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{row.countryIso2 ?? <span className="text-rose-400">{row.country || '—'}</span>}</td>
                    <td className="px-3 py-1.5 text-slate-500">{row.firstFieldVal || '—'}</td>
                    <td className="px-3 py-1.5 text-slate-500">—</td>
                  </tr>
                ))}
                {preview.length > 8 && (
                  <tr className="border-t border-slate-50 dark:border-slate-800">
                    <td colSpan={4} className="px-3 py-1.5 text-center text-slate-400">
                      … and {preview.length - 8} more rows
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <button onClick={onBack} className="text-xs text-indigo-500 hover:underline">
        ← Back to column setup
      </button>
    </>
  );
}

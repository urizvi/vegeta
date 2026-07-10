'use client';

import type { Column, ColumnType, ParsedSheet } from '@/ingestion/types';

interface Props {
  sheet: ParsedSheet;
  columns: Column[];
  onChange: (key: string, patch: Partial<Column>) => void;
}

const TYPES: ColumnType[] = ['text', 'number', 'date', 'boolean'];
const SAMPLE_COUNT = 3;

export default function ColumnMappingTable({ sheet, columns, onChange }: Props) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)]">
      <table className="w-full text-sm">
        <thead className="bg-[var(--surface-sunken)] text-left">
          <tr className="text-[color:var(--ink-muted)]">
            <th className="p-3 font-medium">Source header</th>
            <th className="p-3 font-medium">Key</th>
            <th className="p-3 font-medium">Label</th>
            <th className="p-3 font-medium">Type</th>
            <th className="p-3 font-medium">Required</th>
            <th className="p-3 font-medium">Sample</th>
            <th className="p-3 font-medium text-right">Discard</th>
          </tr>
        </thead>
        <tbody>
          {columns.map((col) => {
            const sourceIndex = sheet.headers.indexOf(col.sourceHeader);
            const samples = sheet.rows
              .slice(0, SAMPLE_COUNT)
              .map((r) => r[sourceIndex])
              .filter((v) => v !== null && v !== '');
            return (
              <tr
                key={col.key}
                className={`border-t border-[var(--hairline)] ${col.discarded ? 'opacity-40' : ''}`}
              >
                <td className="p-3 font-mono text-xs text-[color:var(--ink-muted)]">
                  {col.sourceHeader}
                </td>
                <td className="p-3">
                  <input
                    className="w-32 rounded border border-[var(--field-border)] bg-white px-2 py-1 font-mono text-xs"
                    value={col.key}
                    onChange={(e) => onChange(col.key, { key: e.target.value })}
                    disabled={col.discarded}
                  />
                </td>
                <td className="p-3">
                  <input
                    className="w-40 rounded border border-[var(--field-border)] bg-white px-2 py-1"
                    value={col.label}
                    onChange={(e) => onChange(col.key, { label: e.target.value })}
                    disabled={col.discarded}
                  />
                </td>
                <td className="p-3">
                  <select
                    className="rounded border border-[var(--field-border)] bg-white px-2 py-1"
                    value={col.type}
                    onChange={(e) => onChange(col.key, { type: e.target.value as ColumnType })}
                    disabled={col.discarded}
                  >
                    {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                </td>
                <td className="p-3">
                  <input
                    type="checkbox"
                    checked={col.required}
                    onChange={(e) => onChange(col.key, { required: e.target.checked })}
                    disabled={col.discarded}
                  />
                </td>
                <td className="p-3 font-mono text-xs text-[color:var(--ink-muted)]">
                  {samples.map((s) => String(s)).join(', ') || '—'}
                </td>
                <td className="p-3 text-right">
                  <button
                    type="button"
                    className="text-xs text-[color:var(--ink-muted)] hover:text-[color:var(--brand)]"
                    onClick={() => onChange(col.key, { discarded: !col.discarded })}
                  >
                    {col.discarded ? 'restore' : 'discard'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

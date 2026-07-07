'use client';

import type { Dataset } from '@/ingestion/types';

interface Props {
  datasets: Dataset[];
  onDelete: (id: string) => void;
}

export default function DatasetList({ datasets, onDelete }: Props) {
  if (datasets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--hairline-strong)] p-6 text-center text-sm text-[color:var(--ink-muted)]">
        No datasets yet. Drop a file above to get started.
      </div>
    );
  }
  return (
    <ul className="space-y-2">
      {datasets.map((d) => (
        <li
          key={d.id}
          className="flex items-center justify-between rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4"
        >
          <div>
            <div className="font-medium text-[color:var(--ink-strong)]">{d.name}</div>
            <div className="text-xs text-[color:var(--ink-muted)]">
              {d.rows.length} rows · {d.columns.filter((c) => !c.discarded).length} columns
              {d.issues.length > 0 && (
                <> · <span className="text-amber-700">{d.issues.length} issues</span></>
              )}
              {' · '}from {d.source.fileName}
            </div>
          </div>
          <button
            type="button"
            className="text-xs text-[color:var(--ink-muted)] hover:text-rose-600"
            onClick={() => onDelete(d.id)}
          >
            delete
          </button>
        </li>
      ))}
    </ul>
  );
}

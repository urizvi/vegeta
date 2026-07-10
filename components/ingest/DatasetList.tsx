'use client';

import { useState } from 'react';
import type { Dataset } from '@/ingestion/types';
import { useWaferiqStore } from '@/store/waferiqStore';
import EntityMappingPanel from './EntityMappingPanel';

interface Props {
  datasets: Dataset[];
  onDelete: (id: string) => void;
}

export default function DatasetList({ datasets, onDelete }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const posRecords = useWaferiqStore((s) => s.posRecords);
  const claims = useWaferiqStore((s) => s.claims);
  const deletePOSRecordsForDataset = useWaferiqStore((s) => s.deletePOSRecordsForDataset);
  const deleteClaimsForDataset = useWaferiqStore((s) => s.deleteClaimsForDataset);

  if (datasets.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-[var(--hairline-strong)] p-6 text-center text-sm text-[color:var(--ink-muted)]">
        No datasets yet. Drop a file above to get started.
      </div>
    );
  }

  function handleDelete(id: string) {
    // Cascade: parked entities for this dataset go too, else they orphan.
    deletePOSRecordsForDataset(id);
    deleteClaimsForDataset(id);
    onDelete(id);
    if (expanded === id) setExpanded(null);
  }

  return (
    <ul className="space-y-2">
      {datasets.map((d) => {
        const posCount = posRecords.filter((r) => r.datasetId === d.id).length;
        const sdCount = claims.filter((c) => c.datasetId === d.id && c.type === 'ship_and_debit').length;
        const ppCount = claims.filter((c) => c.datasetId === d.id && c.type === 'price_protection').length;
        const isOpen = expanded === d.id;
        return (
          <li
            key={d.id}
            className="overflow-hidden rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)]"
          >
            <div className="flex items-center justify-between p-4">
              <div>
                <div className="font-medium text-[color:var(--ink-strong)]">{d.name}</div>
                <div className="text-xs text-[color:var(--ink-muted)]">
                  {d.rows.length} rows · {d.columns.filter((c) => !c.discarded).length} columns
                  {d.issues.length > 0 && (
                    <> · <span className="text-amber-700">{d.issues.length} issues</span></>
                  )}
                  {' · '}from {d.source.fileName}
                </div>
                {(posCount + sdCount + ppCount) > 0 && (
                  <div className="mt-1 text-xs text-[color:var(--ink-muted)]">
                    {posCount > 0 && <span className="mr-2">{posCount} POS records</span>}
                    {sdCount > 0 && <span className="mr-2">{sdCount} S&amp;D claims</span>}
                    {ppCount > 0 && <span className="mr-2">{ppCount} PP claims</span>}
                  </div>
                )}
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  className="rounded border border-[var(--field-border)] px-2 py-1 text-[color:var(--ink-strong)] hover:bg-[var(--surface-sunken)]"
                  onClick={() => setExpanded(isOpen ? null : d.id)}
                  aria-expanded={isOpen}
                >
                  {isOpen ? 'Close mapping' : 'Map to POS-recon'}
                </button>
                <button
                  type="button"
                  className="text-[color:var(--ink-muted)] hover:text-rose-600"
                  onClick={() => handleDelete(d.id)}
                >
                  delete
                </button>
              </div>
            </div>
            {isOpen && <EntityMappingPanel dataset={d} />}
          </li>
        );
      })}
    </ul>
  );
}

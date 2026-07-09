'use client';

import type { Claim, POSRecord, ReconciliationResult } from '@/domain/pos-recon/entities';
import { downloadWorkbook, reconResultsToRows, rowsToWorkbook } from '@/lib/reconExport';

interface Props {
  results: readonly ReconciliationResult[];
  posById: ReadonlyMap<string, POSRecord>;
  claimsById: ReadonlyMap<string, Claim>;
}

export default function ExportButtons({ results, posById, claimsById }: Props) {
  const disabled = results.length === 0;

  function handleExport(format: 'csv' | 'xlsx') {
    const rows = reconResultsToRows(results, posById, claimsById);
    const wb = rowsToWorkbook(rows);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadWorkbook(wb, `waferiq-recon-${timestamp}.${format}`, format);
  }

  const base = 'rounded border border-[var(--hairline-strong)] bg-white px-3 py-1.5 text-sm text-[color:var(--ink-body)] hover:bg-[var(--surface-sunken)]';
  const off = 'cursor-not-allowed opacity-50';

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={() => handleExport('csv')}
        disabled={disabled}
        className={`${base} ${disabled ? off : ''}`}
      >
        Export CSV
      </button>
      <button
        type="button"
        onClick={() => handleExport('xlsx')}
        disabled={disabled}
        className={`${base} ${disabled ? off : ''}`}
      >
        Export XLSX
      </button>
    </div>
  );
}

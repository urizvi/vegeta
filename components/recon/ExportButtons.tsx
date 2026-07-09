'use client';

import type { Claim, POSRecord, ReconciliationResult } from '@/domain/pos-recon/entities';
import { downloadWorkbook, reconResultsToRows, rowsToWorkbook } from '@/lib/reconExport';
import { useGate, type Gate } from '@/lib/waferiqGates';
import { useWaferiqStore } from '@/store/waferiqStore';

interface Props {
  results: readonly ReconciliationResult[];
  posById: ReadonlyMap<string, POSRecord>;
  claimsById: ReadonlyMap<string, Claim>;
}

export default function ExportButtons({ results, posById, claimsById }: Props) {
  const empty = results.length === 0;
  const recordExport = useWaferiqStore((s) => s.recordExport);
  const csvGate = useGate('export_csv');
  const xlsxGate = useGate('export_xlsx');

  function handleExport(format: 'csv' | 'xlsx') {
    const rows = reconResultsToRows(results, posById, claimsById);
    const wb = rowsToWorkbook(rows);
    const timestamp = new Date().toISOString().slice(0, 10);
    downloadWorkbook(wb, `waferiq-recon-${timestamp}.${format}`, format);
    recordExport(format);
  }

  return (
    <div className="flex gap-2">
      <ExportButton
        label="Export CSV"
        onClick={() => handleExport('csv')}
        empty={empty}
        gate="export_csv"
        allowed={csvGate.allowed}
        reason={csvGate.reason}
      />
      <ExportButton
        label="Export XLSX"
        onClick={() => handleExport('xlsx')}
        empty={empty}
        gate="export_xlsx"
        allowed={xlsxGate.allowed}
        reason={xlsxGate.reason}
      />
    </div>
  );
}

function ExportButton({
  label, onClick, empty, allowed, reason,
}: {
  label: string;
  onClick: () => void;
  empty: boolean;
  gate: Gate;
  allowed: boolean;
  reason?: string;
}) {
  const disabled = empty || !allowed;
  const base = 'rounded border border-[var(--hairline-strong)] bg-white px-3 py-1.5 text-sm text-[color:var(--ink-body)] hover:bg-[var(--surface-sunken)]';
  const off = 'cursor-not-allowed opacity-50';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={!allowed ? reason : undefined}
      className={`${base} ${disabled ? off : ''}`}
    >
      {label}
      {!allowed && <span aria-hidden="true"> 🔒</span>}
    </button>
  );
}

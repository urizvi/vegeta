'use client';

import { useWaferiqStore } from '@/store/waferiqStore';
import { getStorageState } from '@/store/persistedStorage';

/**
 * Small usage-stats panel — visible so the WaferIQ retention thesis
 * ("do partners come back?") is measurable in-app. Not for admin
 * gating, not for billing; just visibility.
 */
export default function HealthPanel() {
  const firstSeenAt = useWaferiqStore((s) => s.firstSeenAt);
  const lastSeenAt = useWaferiqStore((s) => s.lastSeenAt);
  const visitDays = useWaferiqStore((s) => s.visitDays);
  const reconRuns = useWaferiqStore((s) => s.reconRuns);
  const exportsCsv = useWaferiqStore((s) => s.exportsCsv);
  const exportsXlsx = useWaferiqStore((s) => s.exportsXlsx);
  const datasetImports = useWaferiqStore((s) => s.datasetImports);
  const storage = getStorageState();

  const spanDays = firstSeenAt ? daysBetween(firstSeenAt, lastSeenAt ?? firstSeenAt) + 1 : 0;
  const returnRate = spanDays > 0 ? Math.round((visitDays.length / spanDays) * 100) : 0;

  return (
    <section className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4 text-sm">
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
        Usage
      </h3>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3 lg:grid-cols-4">
        <Row label="First seen" value={formatDate(firstSeenAt)} />
        <Row label="Last seen" value={formatDate(lastSeenAt)} />
        <Row label="Visit days" value={`${visitDays.length}${spanDays > 0 ? ` of ${spanDays}` : ''}`} />
        <Row label="Return rate" value={spanDays > 0 ? `${returnRate}%` : '—'} />
        <Row label="Recon runs" value={String(reconRuns)} />
        <Row label="CSV exports" value={String(exportsCsv)} />
        <Row label="XLSX exports" value={String(exportsXlsx)} />
        <Row label="Dataset imports" value={String(datasetImports)} />
      </dl>
      <div className="mt-3 text-xs text-[color:var(--ink-muted)]">
        Storage: {storage.status === 'ok' ? 'local (persistent)' : `in-memory (${storage.status})`}
      </div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-[color:var(--ink-muted)]">{label}</dt>
      <dd className="font-mono text-[color:var(--ink-body)]">{value}</dd>
    </>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString();
}

function daysBetween(a: string, b: string): number {
  const dA = Date.parse(a);
  const dB = Date.parse(b);
  if (Number.isNaN(dA) || Number.isNaN(dB)) return 0;
  return Math.max(0, Math.floor(Math.abs(dB - dA) / 86_400_000));
}

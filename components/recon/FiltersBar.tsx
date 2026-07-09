'use client';

import type { ReconFilters, ResultStatus } from '@/lib/reconView';
import { STATUS_LABEL, FLAG_LABEL } from '@/lib/reconView';
import type { DiscrepancyFlagKind } from '@/domain/pos-recon/entities';

interface Props {
  filters: ReconFilters;
  onChange: (next: ReconFilters) => void;
}

const STATUSES: ResultStatus[] = ['matched', 'flagged', 'missing_claim', 'orphan_claim'];
const FLAG_KINDS: DiscrepancyFlagKind[] = [
  'missing_claim', 'orphan_claim', 'quantity_mismatch',
  'price_mismatch', 'date_out_of_window', 'duplicate_claim',
];

export default function FiltersBar({ filters, onChange }: Props) {
  function toggleStatus(s: ResultStatus) {
    const next = new Set(filters.statuses);
    if (next.has(s)) next.delete(s); else next.add(s);
    onChange({ ...filters, statuses: next });
  }
  function toggleFlag(k: DiscrepancyFlagKind) {
    const next = new Set(filters.flagKinds);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange({ ...filters, flagKinds: next });
  }
  function reset() {
    onChange({ statuses: new Set(), flagKinds: new Set(), search: '' });
  }

  const anyActive = filters.statuses.size > 0 || filters.flagKinds.size > 0 || filters.search.length > 0;

  return (
    <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4 text-sm">
      <div className="mb-3 flex items-center gap-3">
        <input
          type="search"
          placeholder="Search part, customer, or distributor…"
          value={filters.search}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          className="w-72 max-w-full rounded border border-[var(--hairline-strong)] bg-white px-2 py-1"
        />
        {anyActive && (
          <button
            type="button"
            onClick={reset}
            className="ml-auto text-xs text-[color:var(--ink-muted)] hover:text-[color:var(--ink-strong)]"
          >
            Reset filters
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-4">
        <FilterGroup title="Status">
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={STATUS_LABEL[s]}
              active={filters.statuses.has(s)}
              onClick={() => toggleStatus(s)}
            />
          ))}
        </FilterGroup>
        <FilterGroup title="Flag kind">
          {FLAG_KINDS.map((k) => (
            <Chip
              key={k}
              label={FLAG_LABEL[k]}
              active={filters.flagKinds.has(k)}
              onClick={() => toggleFlag(k)}
            />
          ))}
        </FilterGroup>
      </div>
    </div>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-xs uppercase tracking-wide text-[color:var(--ink-muted)]">{title}</div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 text-xs ${
        active
          ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[color:var(--brand-ink)]'
          : 'border-[var(--hairline-strong)] bg-white text-[color:var(--ink-body)] hover:bg-[var(--surface-sunken)]'
      }`}
    >
      {label}
    </button>
  );
}

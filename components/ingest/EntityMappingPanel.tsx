'use client';

import { useMemo, useState } from 'react';
import type { Column, Dataset } from '@/ingestion/types';
import type { ClaimType } from '@/domain/pos-recon/entities';
import {
  mapPOSRecords,
  mapShipAndDebitClaims,
  mapPriceProtectionClaims,
  type POSRecordMapping,
  type ShipAndDebitMapping,
  type PriceProtectionMapping,
  type MappingIssue,
} from '@/domain/pos-recon/import';
import {
  suggestPOSRecordMapping,
  suggestShipAndDebitMapping,
  suggestPriceProtectionMapping,
} from '@/domain/pos-recon/suggest';
import { useWaferiqStore } from '@/store/waferiqStore';

type EntityKind = 'pos_records' | ClaimType;

interface Props {
  dataset: Dataset;
}

const KIND_LABELS: Record<EntityKind, string> = {
  pos_records: 'POS records',
  ship_and_debit: 'Ship-and-debit claims',
  price_protection: 'Price-protection claims',
};

const POS_FIELDS: readonly string[] = [
  'distributor', 'period', 'partNumber', 'endCustomer',
  'shipDate', 'sellDate', 'quantity', 'resalePrice', 'extendedAmount',
  'currency', 'externalId',
];
const SD_FIELDS: readonly string[] = [
  'distributor', 'period', 'partNumber', 'endCustomer', 'quantity',
  'costPrice', 'authorizedPrice', 'authorizationRef', 'currency', 'externalId',
];
const PP_FIELDS: readonly string[] = [
  'distributor', 'period', 'partNumber', 'endCustomer', 'quantity',
  'originalPrice', 'newPrice', 'effectiveDate', 'currency', 'externalId',
];

const OPTIONAL_FIELDS = new Set(['currency', 'externalId', 'authorizationRef']);

interface RunOutcome {
  count: number;
  issues: MappingIssue[];
}

export default function EntityMappingPanel({ dataset }: Props) {
  const [kind, setKind] = useState<EntityKind>('pos_records');

  return (
    <div className="border-t border-[var(--hairline)] bg-[var(--surface-sunken)] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="text-[color:var(--ink-strong)]">
          Import as
          <select
            className="ml-2 rounded border border-[var(--hairline-strong)] bg-white px-2 py-1"
            value={kind}
            onChange={(e) => setKind(e.target.value as EntityKind)}
          >
            {(Object.keys(KIND_LABELS) as EntityKind[]).map((k) => (
              <option key={k} value={k}>{KIND_LABELS[k]}</option>
            ))}
          </select>
        </label>
      </div>
      {/* Remount on kind change so the per-kind mapping suggestion seeds
          state cleanly without a setState-in-effect dance. */}
      <MappingForm key={kind} dataset={dataset} kind={kind} />
    </div>
  );
}

function MappingForm({ dataset, kind }: { dataset: Dataset; kind: EntityKind }) {
  const activeColumns = dataset.columns.filter((c) => !c.discarded);

  const suggestion = useMemo(() => {
    if (kind === 'pos_records') return suggestPOSRecordMapping(dataset.columns);
    if (kind === 'ship_and_debit') return suggestShipAndDebitMapping(dataset.columns);
    return suggestPriceProtectionMapping(dataset.columns);
  }, [kind, dataset.columns]);

  const [mapping, setMapping] = useState<Record<string, string>>(suggestion as Record<string, string>);
  const [outcome, setOutcome] = useState<RunOutcome | null>(null);

  const replacePOSRecordsForDataset = useWaferiqStore((s) => s.replacePOSRecordsForDataset);
  const replaceClaimsForDataset = useWaferiqStore((s) => s.replaceClaimsForDataset);

  const fields = kind === 'pos_records' ? POS_FIELDS : kind === 'ship_and_debit' ? SD_FIELDS : PP_FIELDS;

  function run() {
    if (kind === 'pos_records') {
      const result = mapPOSRecords(dataset, mapping as unknown as POSRecordMapping);
      replacePOSRecordsForDataset(dataset.id, result.entities);
      setOutcome({ count: result.entities.length, issues: result.issues });
      return;
    }
    // Claims: replace only this-dataset claims OF THIS TYPE. Keep this-dataset
    // claims of the other type (a dataset may legitimately produce both
    // S&D and PP claims from separate mapping passes).
    const result = kind === 'ship_and_debit'
      ? mapShipAndDebitClaims(dataset, mapping as unknown as ShipAndDebitMapping)
      : mapPriceProtectionClaims(dataset, mapping as unknown as PriceProtectionMapping);
    const existingOtherType = useWaferiqStore.getState().claims
      .filter((c) => c.datasetId === dataset.id && c.type !== kind);
    replaceClaimsForDataset(dataset.id, [...existingOtherType, ...result.entities]);
    setOutcome({ count: result.entities.length, issues: result.issues });
  }

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={run}
          className="rounded bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
        >
          Run mapping
        </button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map((f) => (
          <FieldSelect
            key={f}
            field={f}
            required={!OPTIONAL_FIELDS.has(f)}
            value={mapping[f] ?? ''}
            columns={activeColumns}
            onChange={(v) => setMapping({ ...mapping, [f]: v })}
          />
        ))}
      </div>

      {outcome && <OutcomeSummary kind={kind} outcome={outcome} />}
    </>
  );
}

function FieldSelect({
  field, required, value, columns, onChange,
}: {
  field: string;
  required: boolean;
  value: string;
  columns: Column[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="text-xs text-[color:var(--ink-muted)]">
      <span className="mb-1 block font-mono">
        {field}{required ? ' *' : ''}
      </span>
      <select
        className="w-full rounded border border-[var(--hairline)] bg-white px-2 py-1 text-sm text-[color:var(--ink-body)]"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— none —</option>
        {columns.map((c) => (
          <option key={c.key} value={c.key}>{c.label} ({c.type})</option>
        ))}
      </select>
    </label>
  );
}

function OutcomeSummary({ kind, outcome }: { kind: EntityKind; outcome: RunOutcome }) {
  const label = KIND_LABELS[kind].toLowerCase();
  if (outcome.issues.length === 0) {
    return (
      <div className="mt-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        Imported {outcome.count} {label}. No issues.
      </div>
    );
  }
  return (
    <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
      <div className="font-medium">
        Imported {outcome.count} {label} · {outcome.issues.length} issue{outcome.issues.length === 1 ? '' : 's'}
      </div>
      <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto font-mono text-xs">
        {outcome.issues.slice(0, 30).map((i, k) => (
          <li key={k}>
            {i.rowIndex >= 0 ? `row ${i.rowIndex + 2}: ` : ''}{i.message}
          </li>
        ))}
        {outcome.issues.length > 30 && (
          <li className="italic">…and {outcome.issues.length - 30} more</li>
        )}
      </ul>
    </div>
  );
}

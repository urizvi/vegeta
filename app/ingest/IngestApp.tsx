'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseFile, ParseError } from '@/ingestion/parse';
import { initialColumns } from '@/ingestion/columns';
import { buildDataset } from '@/ingestion/validate';
import type { Column, Dataset, ParsedSheet } from '@/ingestion/types';
import { useWaferiqStore } from '@/store/waferiqStore';
import { getStorageState, subscribeStorageState, type StorageStatus } from '@/store/persistedStorage';
import { loadSampleData } from '@/lib/loadSampleData';
import DropZone from '@/components/ingest/DropZone';
import ColumnMappingTable from '@/components/ingest/ColumnMappingTable';
import ValidationSummary from '@/components/ingest/ValidationSummary';
import DatasetList from '@/components/ingest/DatasetList';
import ReconRunner from '@/components/ingest/ReconRunner';
import OnboardingCard from '@/components/ingest/OnboardingCard';

interface Staged {
  sheet: ParsedSheet;
  columns: Column[];
  fileName: string;
  fileSize: number;
}

const LARGE_FILE_BYTES = 10 * 1024 * 1024;

export default function IngestClient() {
  const datasets = useWaferiqStore((s) => s.datasets);
  const commitDataset = useWaferiqStore((s) => s.commitDataset);
  const deleteDataset = useWaferiqStore((s) => s.deleteDataset);
  const recordVisit = useWaferiqStore((s) => s.recordVisit);
  const recordDatasetImport = useWaferiqStore((s) => s.recordDatasetImport);

  const [staged, setStaged] = useState<Staged | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('ok');
  const [storageReason, setStorageReason] = useState<string | undefined>(undefined);

  useEffect(() => {
    recordVisit();
    const snap = getStorageState();
    setStorageStatus(snap.status);
    setStorageReason(snap.reason);
    return subscribeStorageState((s) => {
      setStorageStatus(s.status);
      setStorageReason(s.reason);
    });
  }, [recordVisit]);

  const preview = useMemo(() => {
    if (!staged) return null;
    return buildDataset(staged.sheet, staged.columns);
  }, [staged]);

  async function handleFile(file: File) {
    setError(null);
    setWarning(file.size > LARGE_FILE_BYTES
      ? `${file.name} is ${formatBytes(file.size)}. Parsing may take a moment.`
      : null);
    setBusy(true);
    try {
      const sheet = await parseFile(file);
      const columns = initialColumns(sheet);
      setStaged({ sheet, columns, fileName: file.name, fileSize: file.size });
      const suggested = file.name.replace(/\.[^.]+$/, '');
      setName(suggested);
    } catch (e) {
      setError(e instanceof ParseError ? e.message : 'Unexpected error reading file.');
    } finally {
      setBusy(false);
    }
  }

  function updateColumn(key: string, patch: Partial<Column>) {
    setStaged((s) => {
      if (!s) return s;
      return { ...s, columns: s.columns.map((c) => (c.key === key ? { ...c, ...patch } : c)) };
    });
  }

  function cancel() {
    setStaged(null);
    setName('');
    setError(null);
    setWarning(null);
  }

  function commit() {
    if (!staged || !preview) return;
    const dataset: Dataset = {
      id: `ds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: name.trim() || staged.fileName,
      source: {
        fileName: staged.fileName,
        fileSize: staged.fileSize,
        sheetName: staged.sheet.sheetName,
        importedAt: new Date().toISOString(),
      },
      columns: staged.columns,
      rows: preview.rows,
      issues: preview.issues,
    };
    commitDataset(dataset);
    recordDatasetImport();
    setStaged(null);
    setName('');
    setWarning(null);
  }

  async function loadSample() {
    await loadSampleData({ commitDataset, recordDatasetImport });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-medium text-[color:var(--ink-strong)]">Data ingestion</h1>
        <p className="text-sm text-[color:var(--ink-body)]">
          Upload your raw distributor files here — a POS report plus your
          ship-and-debit and price-protection claims. For each file, WaferIQ
          parses it, lets you review the inferred columns, and turns it into a
          saved dataset. Once saved, you map that dataset to a WaferIQ entity
          (POS records, S&amp;D claims, or PP claims), and then head to{' '}
          <a href="/recon" className="text-[color:var(--brand)] underline">
            /recon
          </a>{' '}
          to run reconciliation.
        </p>
        <details className="text-xs text-[color:var(--ink-muted)]">
          <summary className="cursor-pointer select-none hover:text-[color:var(--ink-body)]">
            What files should I upload?
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>POS / sell-through report</strong> — one row per unit the
              distributor sold to an end customer, with distributor name, part
              number, customer, ship date, quantity, and resale price.
            </li>
            <li>
              <strong>Ship-and-debit (S&amp;D) claims</strong> — credits the
              distributor is asking for, tied to a POS transaction, with a
              cost price and an authorized price.
            </li>
            <li>
              <strong>Price-protection (PP) claims</strong> — credits on stock
              held when the manufacturer cut a price, with an original and
              new price and an effective date.
            </li>
          </ul>
          <p className="mt-2">
            No claims file yet? You can still upload POS records and see the
            &ldquo;missing claim&rdquo; picture on <code>/recon</code>.
          </p>
        </details>
      </header>

      {storageStatus !== 'ok' && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <span className="font-medium">Persistent storage disabled.</span>{' '}
          Datasets and results won&apos;t survive a refresh in this session.
          {storageReason && <div className="mt-1 text-xs opacity-80">{storageReason}</div>}
        </div>
      )}

      {datasets.length === 0 && !staged && <OnboardingCard onLoadSample={loadSample} />}

      {!staged && (
        <>
          <DropZone onFile={handleFile} disabled={busy} />
          {warning && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              {warning}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
              <div className="font-medium">Couldn&apos;t read that file.</div>
              <div className="mt-1 text-xs">{error}</div>
            </div>
          )}
        </>
      )}

      {staged && preview && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4 text-sm text-[color:var(--ink-body)]">
            <p className="font-medium text-[color:var(--ink-strong)]">Review the parsed file</p>
            <p className="mt-1 text-xs text-[color:var(--ink-muted)]">
              WaferIQ inferred a type for each column from the sample values.
              Rename columns if the source headers are cryptic, override the
              type if the guess is wrong, mark required columns, or discard
              anything you don&apos;t need. This is still a &ldquo;raw&rdquo;
              dataset — the WaferIQ-specific mapping (POS records vs claims)
              comes on the next screen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm font-medium text-[color:var(--ink-strong)]">
              Name
              <input
                className="ml-2 w-64 rounded border border-[var(--hairline-strong)] bg-white px-2 py-1"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <span className="text-xs text-[color:var(--ink-muted)]">
              from {staged.fileName}
              {staged.sheet.sheetName && ` · sheet "${staged.sheet.sheetName}"`}
              {staged.sheet.otherSheets.length > 0 && ` · skipped ${staged.sheet.otherSheets.length} other sheet(s)`}
            </span>
            <div className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={cancel}
                className="rounded px-3 py-1.5 text-sm text-[color:var(--ink-muted)] hover:text-[color:var(--ink-strong)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commit}
                className="rounded bg-[var(--brand)] px-3 py-1.5 text-sm font-medium text-white hover:bg-[var(--brand-hover)]"
              >
                Save dataset
              </button>
            </div>
          </div>

          <ColumnMappingTable
            sheet={staged.sheet}
            columns={staged.columns}
            onChange={updateColumn}
          />

          <ValidationSummary issues={preview.issues} rowCount={preview.rows.length} />
        </section>
      )}

      <ReconRunner />

      <section>
        <h2 className="text-sm font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
          Saved datasets
        </h2>
        <p className="mb-3 mt-1 text-xs text-[color:var(--ink-muted)]">
          Each saved dataset is a parsed file that WaferIQ has read but not yet
          categorized. Expand a dataset and click &ldquo;Map to POS-recon&rdquo;
          to tell WaferIQ what kind of entity these rows represent and which
          columns go where.
        </p>
        <DatasetList datasets={datasets} onDelete={deleteDataset} />
      </section>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

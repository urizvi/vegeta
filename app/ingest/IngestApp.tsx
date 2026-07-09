'use client';

import { useEffect, useMemo, useState } from 'react';
import { parseArrayBuffer, parseFile, ParseError } from '@/ingestion/parse';
import { initialColumns } from '@/ingestion/columns';
import { buildDataset } from '@/ingestion/validate';
import type { Column, Dataset, ParsedSheet } from '@/ingestion/types';
import { useWaferiqStore } from '@/store/waferiqStore';
import { getStorageState, subscribeStorageState, type StorageStatus } from '@/store/persistedStorage';
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

const SAMPLE_FILES: { path: string; name: string }[] = [
  { path: '/sample/pos.csv', name: 'Sample POS report (June 2026)' },
  { path: '/sample/sd_claims.csv', name: 'Sample S&D claims (June 2026)' },
  { path: '/sample/pp_claims.csv', name: 'Sample PP claims (June 2026)' },
];

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
    for (const f of SAMPLE_FILES) {
      const res = await fetch(f.path);
      if (!res.ok) throw new Error(`Failed to fetch ${f.path} (${res.status}).`);
      const buf = await res.arrayBuffer();
      const sheet = parseArrayBuffer(buf, f.path);
      const columns = initialColumns(sheet);
      const built = buildDataset(sheet, columns);
      const dataset: Dataset = {
        id: `ds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name: f.name,
        source: {
          fileName: f.path.split('/').pop() ?? f.path,
          fileSize: buf.byteLength,
          importedAt: new Date().toISOString(),
        },
        columns,
        rows: built.rows,
        issues: built.issues,
      };
      commitDataset(dataset);
      recordDatasetImport();
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-medium text-[color:var(--ink-strong)]">Data ingestion</h1>
        <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
          Drop a CSV or XLSX. Review the inferred columns, fix anything that&apos;s wrong, save.
        </p>
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
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[color:var(--ink-muted)]">
          Saved datasets
        </h2>
        <DatasetList datasets={datasets} onDelete={deleteDataset} />
      </section>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

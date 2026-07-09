'use client';

import { useMemo, useState } from 'react';
import { parseFile, ParseError } from '@/ingestion/parse';
import { initialColumns } from '@/ingestion/columns';
import { buildDataset } from '@/ingestion/validate';
import type { Column, Dataset, ParsedSheet } from '@/ingestion/types';
import { useWaferiqStore } from '@/store/waferiqStore';
import DropZone from '@/components/ingest/DropZone';
import ColumnMappingTable from '@/components/ingest/ColumnMappingTable';
import ValidationSummary from '@/components/ingest/ValidationSummary';
import DatasetList from '@/components/ingest/DatasetList';
import ReconRunner from '@/components/ingest/ReconRunner';

interface Staged {
  sheet: ParsedSheet;
  columns: Column[];
  fileName: string;
  fileSize: number;
}

export default function IngestClient() {
  const datasets = useWaferiqStore((s) => s.datasets);
  const commitDataset = useWaferiqStore((s) => s.commitDataset);
  const deleteDataset = useWaferiqStore((s) => s.deleteDataset);

  const [staged, setStaged] = useState<Staged | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const preview = useMemo(() => {
    if (!staged) return null;
    return buildDataset(staged.sheet, staged.columns);
  }, [staged]);

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const sheet = await parseFile(file);
      const columns = initialColumns(sheet);
      setStaged({ sheet, columns, fileName: file.name, fileSize: file.size });
      // Default the dataset name to the filename sans extension.
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
    setStaged(null);
    setName('');
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-8">
      <header>
        <h1 className="text-2xl font-medium text-[color:var(--ink-strong)]">Data ingestion</h1>
        <p className="mt-1 text-sm text-[color:var(--ink-muted)]">
          Drop a CSV or XLSX. Review the inferred columns, fix anything that&apos;s wrong, save.
        </p>
      </header>

      {!staged && (
        <>
          <DropZone onFile={handleFile} disabled={busy} />
          {error && (
            <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 text-sm text-rose-900">
              {error}
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

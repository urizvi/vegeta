'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { useActions } from '@/hooks/useTerritoryStore';
import { detectColumns, parseNumber } from '@/lib/csvParser';
import { parseTextFile, parseExcel } from '@/lib/fileParser';
import { resolveCountryIso2 } from '@/lib/countryNameToIso2';

interface ImportAccountsModalProps {
  onClose: () => void;
}

interface PreviewRow {
  name: string;
  country: string;    // raw value
  countryIso2: string | null;
  state: string;
  arr: number;
  valid: boolean;
}

const COLUMN_ALIASES = {
  name:    ['name', 'account', 'company', 'account name', 'company name', 'account_name'],
  country: ['country', 'country code', 'country_code', 'iso2', 'iso'],
  state:   ['state', 'province', 'state/province', 'state_province', 'territory'],
  arr:     ['arr', 'revenue', 'amount', 'annual revenue', 'annual_revenue', 'mrr', 'acv'],
};

export default function ImportAccountsModal({ onClose }: ImportAccountsModalProps) {
  const { importAccounts } = useActions();
  const fileRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [colMap, setColMap] = useState<{ name?: string; country?: string; state?: string; arr?: string }>({});
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildPreview = useCallback((
    rows: Record<string, string>[],
    map: { name?: string; country?: string; state?: string; arr?: string },
  ) => {
    const built: PreviewRow[] = rows.slice(0, 200).map((row) => {
      const name = map.name ? (row[map.name] ?? '') : '';
      const rawCountry = map.country ? (row[map.country] ?? '') : '';
      const countryIso2 = resolveCountryIso2(rawCountry);
      const state = map.state ? (row[map.state] ?? '') : '';
      const arr = map.arr ? parseNumber(row[map.arr] ?? '') : 0;
      return { name, country: rawCountry, countryIso2, state, arr, valid: !!name && !!countryIso2 };
    });
    setPreview(built);
  }, []);

  const processRows = useCallback((rows: Record<string, string>[]) => {
    setError(null);
    if (rows.length === 0) { setError('No data rows found in the file.'); return; }

    const headers = Object.keys(rows[0]);
    const detected = detectColumns(headers);

    const resolvedMap = {
      name:    detected.name    ?? headers.find(h => COLUMN_ALIASES.name.includes(h.toLowerCase())),
      country: detected.country ?? headers.find(h => COLUMN_ALIASES.country.includes(h.toLowerCase())),
      state:   detected.state   ?? headers.find(h => COLUMN_ALIASES.state.includes(h.toLowerCase())),
      arr:     detected.arr     ?? headers.find(h => COLUMN_ALIASES.arr.includes(h.toLowerCase())),
    };

    setRawHeaders(headers);
    setRawRows(rows);
    setColMap(resolvedMap);
    buildPreview(rows, resolvedMap);
  }, [buildPreview]);

  const handleColChange = (field: keyof typeof colMap, header: string) => {
    const next = { ...colMap, [field]: header || undefined };
    setColMap(next);
    buildPreview(rawRows, next);
  };

  const handleFile = (file: File) => {
    if (!file) return;
    setError(null);
    const isExcel = /\.(xlsx?|ods)$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => setError("Couldn't read file. It may be corrupt or locked by another program.");
    if (isExcel) {
      reader.onload = (e) => {
        const result = e.target?.result;
        if (!(result instanceof ArrayBuffer)) { setError('Unexpected file format.'); return; }
        try {
          processRows(parseExcel(result));
        } catch (err) {
          console.error('[import] Excel parse failed', err);
          setError(err instanceof Error ? `Couldn't read spreadsheet: ${err.message}` : "Couldn't read spreadsheet.");
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== 'string') { setError('Unexpected file format.'); return; }
        try {
          processRows(parseTextFile(result));
        } catch (err) {
          console.error('[import] CSV parse failed', err);
          setError(err instanceof Error ? `Couldn't parse file: ${err.message}` : "Couldn't parse file.");
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleConfirm = () => {
    if (!preview) return;
    const valid = preview.filter((r) => r.valid);
    if (valid.length === 0) { setError('No valid rows to import — check that Name and Country columns are mapped correctly.'); return; }

    const rows = rawRows
      .map((row) => {
        const name = colMap.name ? (row[colMap.name] ?? '') : '';
        const rawCountry = colMap.country ? (row[colMap.country] ?? '') : '';
        const countryIso2 = resolveCountryIso2(rawCountry);
        if (!name || !countryIso2) return null;
        const rawState = colMap.state ? (row[colMap.state] ?? '') : '';
        const state = rawState ? `${countryIso2}:${rawState.trim().toUpperCase()}` : undefined;
        const arr = colMap.arr ? parseNumber(row[colMap.arr] ?? '') : 0;
        return { name: name.trim(), country: countryIso2, state, fields: { arr } };
      })
      .filter(Boolean) as Array<{ name: string; country: string; state?: string; fields: Record<string, string | number> }>;

    importAccounts(rows);
    onClose();
  };

  const validCount = preview?.filter((r) => r.valid).length ?? 0;
  const skipCount = (preview?.length ?? 0) - validCount;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="territory-import-title"
      className="m-auto w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <h2 id="territory-import-title" className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Import Accounts</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Drop zone */}
          {!preview && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload a file — click to browse or drop a file here"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                dragging
                  ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20'
                  : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
              }`}
            >
              <svg className="h-8 w-8 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm text-zinc-500">Drop a file here, or <span className="text-blue-500">browse</span></p>
              <p className="text-xs text-zinc-400">CSV, TSV, Excel (.xlsx, .xls) · Required: Name, Country · Optional: State, ARR</p>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,.xlsx,.xls,.ods" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950">{error}</p>
          )}

          {/* Column mapping */}
          {preview && rawHeaders.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Map columns</p>
              <div className="grid grid-cols-2 gap-2">
                {(['name', 'country', 'state', 'arr'] as const).map((field) => (
                  <div key={field}>
                    <label className="mb-0.5 block text-xs text-zinc-500 capitalize">
                      {field === 'arr' ? 'ARR / Revenue' : field}{field === 'name' || field === 'country' ? ' *' : ''}
                    </label>
                    <select
                      value={colMap[field] ?? ''}
                      onChange={(e) => handleColChange(field, e.target.value)}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pl-2 pr-6 text-xs text-zinc-700 outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                    >
                      <option value="">— not mapped —</option>
                      {rawHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview table */}
          {preview && preview.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                Preview
                <span className="ml-2 font-normal normal-case text-zinc-500">
                  {validCount} valid{skipCount > 0 && <span className="text-red-400"> · {skipCount} skipped (missing name or unrecognised country)</span>}
                </span>
              </p>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-zinc-100 dark:border-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-800">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Name</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Country</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">State</th>
                      <th className="px-3 py-2 text-right font-medium text-zinc-500">ARR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 8).map((row, i) => (
                      <tr key={i} className={`border-t border-zinc-50 dark:border-zinc-800 ${!row.valid ? 'opacity-40' : ''}`}>
                        <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300 max-w-[120px] truncate">{row.name || <span className="text-red-400">—</span>}</td>
                        <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">
                          {row.countryIso2 ?? <span className="text-red-400">{row.country || '—'}</span>}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-500">{row.state || '—'}</td>
                        <td className="px-3 py-1.5 text-right text-zinc-700 dark:text-zinc-300">
                          {row.arr > 0 ? `$${row.arr.toLocaleString()}` : '—'}
                        </td>
                      </tr>
                    ))}
                    {preview.length > 8 && (
                      <tr className="border-t border-zinc-50 dark:border-zinc-800">
                        <td colSpan={4} className="px-3 py-1.5 text-center text-zinc-400">
                          … and {preview.length - 8} more rows
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Change file link */}
          {preview && (
            <button
              onClick={() => { setPreview(null); setRawRows([]); setRawHeaders([]); setColMap({}); setError(null); }}
              className="text-xs text-blue-500 hover:underline"
            >
              ← Choose a different file
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!preview || validCount === 0}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Import {validCount > 0 ? `${validCount} accounts` : 'accounts'}
          </button>
        </div>
    </dialog>
  );
}

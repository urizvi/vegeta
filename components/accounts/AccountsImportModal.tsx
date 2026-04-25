'use client';

import { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useActions, useMembers, useFieldDefs, useTerritoryStore } from '@/hooks/useTerritoryStore';
import { parseTextFile, parseExcel, reconcileColumns } from '@/lib/fileParser';
import { detectColumn, parseNumber } from '@/lib/csvParser';
import { resolveCountryIso2 } from '@/lib/countryNameToIso2';
import { normalizeOption } from '@/lib/accountFields';
import type { FieldDefinition, FieldType } from '@/lib/accountFields';
import type { ReconcileResult } from '@/lib/fileParser';

interface Props { onClose: () => void }

// ── Static column aliases ────────────────────────────────────────────────────

const NAME_ALIASES    = ['name', 'account', 'company', 'account name', 'company name', 'account_name', 'company_name'];
const COUNTRY_ALIASES = ['country', 'country code', 'country_code', 'iso2', 'iso'];
const STATE_ALIASES   = ['state', 'province', 'state/province', 'state_province'];
const REP_ALIASES     = ['rep', 'sales rep', 'owner', 'account owner', 'assigned to', 'assigned_to', 'sales_rep'];

function detectStaticCols(headers: string[]) {
  return {
    name:    detectColumn(headers, NAME_ALIASES),
    country: detectColumn(headers, COUNTRY_ALIASES),
    state:   detectColumn(headers, STATE_ALIASES),
    rep:     detectColumn(headers, REP_ALIASES),
  };
}

function detectFieldDefCol(headers: string[], def: FieldDefinition): string | undefined {
  const aliases = [def.id.toLowerCase(), def.label.toLowerCase()];
  return headers.find((h) => aliases.includes(h.toLowerCase().trim()));
}

// ── Reconcile step ────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<FieldType, string> = {
  categorical: 'Dropdown',
  metric:      'Number',
  text:        'Text',
};

const TYPE_BADGE: Record<FieldType, string> = {
  categorical: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  metric:      'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  text:        'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300',
};

function ReconcileStep({
  result,
  fieldsToRemove,
  onToggleRemove,
  onConfirm,
  onBack,
}: {
  result: ReconcileResult;
  fieldsToRemove: Set<string>;
  onToggleRemove: (id: string) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const { incoming, orphaned, matched } = result;
  const removeCount = fieldsToRemove.size;

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      <div className="flex gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-950/30">
        <svg className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0114.082 15H1.918a1.75 1.75 0 01-1.543-2.575zm1.763.707a.25.25 0 00-.44 0L1.698 13.132a.25.25 0 00.22.368h12.164a.25.25 0 00.22-.368L8.22 1.754zM9.75 11a1.75 1.75 0 11-3.5 0 1.75 1.75 0 013.5 0zm-.25-5.25a.75.75 0 00-1.5 0v2.5a.75.75 0 001.5 0v-2.5z" />
        </svg>
        <div className="text-xs text-amber-800 dark:text-amber-200">
          <p className="font-semibold">This file will change your field schema.</p>
          <p className="mt-0.5 opacity-80">
            Review the changes below before importing.
            {removeCount > 0 && ` ${removeCount} field${removeCount !== 1 ? 's' : ''} marked for removal.`}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {/* New fields */}
        {incoming.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-green-100 text-green-700 text-[10px] font-bold dark:bg-green-900/40 dark:text-green-400">+</span>
              Fields to add ({incoming.length})
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
              {incoming.map((def, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-zinc-100 bg-white px-2.5 py-2 dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">{def.label}</p>
                    {def.type === 'categorical' && def.options && def.options.length > 0 && (
                      <p className="mt-0.5 truncate text-[10px] text-zinc-400">
                        {def.options.slice(0, 4).join(', ')}{def.options.length > 4 ? ` +${def.options.length - 4}` : ''}
                      </p>
                    )}
                    {def.type === 'metric' && def.isCurrency && (
                      <p className="mt-0.5 text-[10px] text-zinc-400">Currency ($)</p>
                    )}
                  </div>
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[def.type]}`}>
                    {TYPE_LABEL[def.type]}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Orphaned fields */}
        {orphaned.length > 0 && (
          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 text-[10px] font-bold dark:bg-zinc-800">?</span>
              Not in this file ({orphaned.length})
            </p>
            <div className="max-h-48 space-y-1 overflow-y-auto pr-1">
              {orphaned.map((def) => {
                const willRemove = fieldsToRemove.has(def.id);
                return (
                  <label
                    key={def.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                      willRemove
                        ? 'border-red-200 bg-red-50/60 dark:border-red-800/50 dark:bg-red-950/20'
                        : 'border-zinc-100 bg-white dark:border-zinc-800 dark:bg-zinc-900'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={willRemove}
                      onChange={() => onToggleRemove(def.id)}
                      className="h-3.5 w-3.5 accent-red-500"
                    />
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-xs font-medium ${willRemove ? 'text-red-600 line-through dark:text-red-400' : 'text-zinc-700 dark:text-zinc-200'}`}>
                        {def.label}
                      </p>
                    </div>
                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${TYPE_BADGE[def.type]}`}>
                      {TYPE_LABEL[def.type]}
                    </span>
                  </label>
                );
              })}
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-400">
              Check a field to remove it. Unchecked fields are kept even if not in this file.
            </p>
          </div>
        )}
      </div>

      {/* Matched / unchanged */}
      {matched.length > 0 && (
        <p className="text-xs text-zinc-400">
          <span className="font-medium text-zinc-500">{matched.length} field{matched.length !== 1 ? 's' : ''} unchanged:</span>{' '}
          {matched.map((d) => d.label).join(', ')}
        </p>
      )}

      <div className="flex items-center justify-between border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <button
          onClick={onBack}
          className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        >
          ← Choose a different file
        </button>
        <button
          onClick={onConfirm}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Apply & Map Columns →
        </button>
      </div>
    </div>
  );
}

// ── Preview row type ──────────────────────────────────────────────────────────

interface PreviewRow {
  name: string; country: string; countryIso2: string | null;
  firstFieldVal: string; valid: boolean;
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function AccountsImportModal({ onClose }: Props) {
  const { importAccounts, addFieldDef, removeFieldDef } = useActions();
  const members   = useMembers();
  const fieldDefs = useFieldDefs();
  const fileRef   = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);

  type Step = 'upload' | 'reconcile' | 'map';
  const [step,       setStep]       = useState<Step>('upload');
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows,    setRawRows]    = useState<Record<string, string>[]>([]);
  const [colMap,     setColMap]     = useState<Record<string, string>>({});
  const [preview,    setPreview]    = useState<PreviewRow[] | null>(null);
  const [dragging,   setDragging]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  // Reconcile state
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [fieldsToRemove,  setFieldsToRemove]  = useState<Set<string>>(new Set());

  const membersByNameEmail = useMemo(() => {
    const map: Record<string, string> = {};
    Object.values(members).forEach((m) => {
      map[m.name.toLowerCase()]  = m.id;
      map[m.email.toLowerCase()] = m.id;
    });
    return map;
  }, [members]);

  // ── Preview builder ──────────────────────────────────────────────────────

  const buildPreview = useCallback((
    rows: Record<string, string>[],
    map: Record<string, string>,
  ) => {
    const built: PreviewRow[] = rows.slice(0, 200).map((row) => {
      const name       = map.name    ? (row[map.name] ?? '') : '';
      const rawCountry = map.country ? (row[map.country] ?? '') : '';
      const countryIso2 = resolveCountryIso2(rawCountry);
      const firstDef = fieldDefs[0];
      const firstFieldVal = firstDef && map[firstDef.id] ? (row[map[firstDef.id]] ?? '') : '';
      return { name, country: rawCountry, countryIso2, firstFieldVal, valid: !!name && !!countryIso2 };
    });
    setPreview(built);
  }, [fieldDefs]);

  // ── Col map builder (used after reconciliation) ───────────────────────────

  function buildColMap(headers: string[], currentFieldDefs: FieldDefinition[]): Record<string, string> {
    const staticDetected = detectStaticCols(headers);
    const map: Record<string, string> = {
      name:    staticDetected.name    ?? '',
      country: staticDetected.country ?? '',
      state:   staticDetected.state   ?? '',
      rep:     staticDetected.rep     ?? '',
    };
    currentFieldDefs.forEach((def) => {
      map[def.id] = detectFieldDefCol(headers, def) ?? '';
    });
    return map;
  }

  // ── File processing ───────────────────────────────────────────────────────

  function afterParse(rows: Record<string, string>[], headers: string[]) {
    setError(null);
    if (rows.length === 0) { setError('No data rows found.'); return; }

    let result: ReconcileResult;
    try {
      result = reconcileColumns(headers, fieldDefs, rows);
    } catch (err) {
      console.error('[import] reconcileColumns failed', err);
      setError(err instanceof Error ? `Failed to analyze columns: ${err.message}` : 'Failed to analyze columns.');
      return;
    }
    setRawHeaders(headers);
    setRawRows(rows);
    setReconcileResult(result);

    if (result.needsReconcile) {
      setFieldsToRemove(new Set()); // reset: keep all by default
      setStep('reconcile');
    } else {
      // No schema changes needed — go straight to column mapping
      const map = buildColMap(headers, fieldDefs);
      setColMap(map);
      buildPreview(rows, map);
      setStep('map');
    }
  }

  const handleTextFile = useCallback((text: string) => {
    try {
      const rows = parseTextFile(text);
      if (rows.length === 0) { setError('No data rows found.'); return; }
      const headers = Object.keys(rows[0]);
      afterParse(rows, headers);
    } catch (err) {
      console.error('[import] CSV parse failed', err);
      setError(err instanceof Error ? `Couldn't parse file: ${err.message}` : "Couldn't parse file.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldDefs, buildPreview]);

  const handleExcelFile = useCallback((buffer: ArrayBuffer) => {
    try {
      const rows = parseExcel(buffer);
      if (rows.length === 0) { setError('No data found in spreadsheet.'); return; }
      const headers = Object.keys(rows[0]);
      afterParse(rows, headers);
    } catch (err) {
      console.error('[import] Excel parse failed', err);
      setError(err instanceof Error ? `Couldn't read spreadsheet: ${err.message}` : "Couldn't read spreadsheet.");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldDefs, buildPreview]);

  function handleFile(file: File) {
    setError(null);
    const isExcel = /\.(xlsx?|ods)$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => setError("Couldn't read file. It may be corrupt or locked by another program.");
    if (isExcel) {
      reader.onload = (e) => {
        const result = e.target?.result;
        if (!(result instanceof ArrayBuffer)) { setError('Unexpected file format.'); return; }
        handleExcelFile(result);
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (e) => {
        const result = e.target?.result;
        if (typeof result !== 'string') { setError('Unexpected file format.'); return; }
        handleTextFile(result);
      };
      reader.readAsText(file);
    }
  }

  // ── Reconcile confirmation ────────────────────────────────────────────────

  async function handleReconcileConfirm() {
    if (!reconcileResult) return;

    try {
      // Server-first so the next read sees real Directus IDs.
      await Promise.all([
        ...reconcileResult.incoming.map((def) => addFieldDef(def)),
        ...Array.from(fieldsToRemove).map((id) => removeFieldDef(id)),
      ]);
    } catch (err) {
      console.error('[import] reconcile failed', err);
      setError(err instanceof Error ? err.message : 'Failed to update fields.');
      return;
    }

    const updatedDefs = useTerritoryStore.getState().fieldDefs;
    const map = buildColMap(rawHeaders, updatedDefs);
    setColMap(map);
    buildPreview(rawRows, map);
    setStep('map');
  }

  function toggleFieldToRemove(id: string) {
    setFieldsToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // ── Column change ─────────────────────────────────────────────────────────

  const handleColChange = (key: string, header: string) => {
    const next = { ...colMap, [key]: header };
    setColMap(next);
    buildPreview(rawRows, next);
  };

  // ── Import confirm ────────────────────────────────────────────────────────

  const [importing, setImporting] = useState(false);

  const handleConfirm = async () => {
    if (!preview) return;
    const valid = preview.filter((r) => r.valid);
    if (valid.length === 0) { setError('No valid rows — check Name and Country mapping.'); return; }

    // Resolve the current fieldDefs (post-reconcile mutations already applied to store)
    const currentDefs = fieldDefs;

    const rows = rawRows
      .map((row) => {
        const name       = colMap.name    ? (row[colMap.name] ?? '') : '';
        const rawCountry = colMap.country ? (row[colMap.country] ?? '') : '';
        const countryIso2 = resolveCountryIso2(rawCountry);
        if (!name || !countryIso2) return null;

        const rawState = colMap.state ? (row[colMap.state] ?? '') : '';
        const state    = rawState ? `${countryIso2}:${rawState.trim().toUpperCase()}` : undefined;

        const repRaw = colMap.rep ? (row[colMap.rep] ?? '').toLowerCase() : '';
        const repId  = repRaw ? (membersByNameEmail[repRaw] ?? null) : null;

        const fields: Record<string, string | number> = {};
        currentDefs.forEach((def) => {
          const header = colMap[def.id] ?? '';
          const rawVal = header ? (row[header] ?? '') : '';
          if (def.type === 'metric') {
            fields[def.id] = rawVal ? parseNumber(rawVal) : 0;
          } else if (def.type === 'categorical') {
            fields[def.id] = rawVal
              ? normalizeOption(rawVal, def.options ?? [], def.options?.[0] ?? '')
              : (def.options?.[0] ?? '');
          } else {
            fields[def.id] = rawVal;
          }
        });

        return { name: name.trim(), country: countryIso2, state, repId, fields };
      })
      .filter(Boolean) as Array<{ name: string; country: string; state?: string; repId: string | null; fields: Record<string, string | number> }>;

    setImporting(true);
    setError(null);
    try {
      await importAccounts(rows);
      onClose();
    } catch (err) {
      console.error('[import] importAccounts failed', err);
      setError(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

  function resetToUpload() {
    setStep('upload');
    setRawRows([]);
    setRawHeaders([]);
    setColMap({});
    setPreview(null);
    setError(null);
    setReconcileResult(null);
    setFieldsToRemove(new Set());
  }

  const validCount = preview?.filter((r) => r.valid).length ?? 0;
  const skipCount  = (preview?.length ?? 0) - validCount;
  const firstDef   = fieldDefs[0];

  // All fields for column mapping UI (static + dynamic)
  const allMappingFields = [
    { key: 'name',    label: 'Name',     required: true  },
    { key: 'country', label: 'Country',  required: true  },
    { key: 'state',   label: 'State'                     },
    { key: 'rep',     label: 'Sales Rep'                 },
    ...fieldDefs.map((def) => ({ key: def.id, label: def.label })),
  ];

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="accounts-import-title"
      className="m-auto w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm dark:border-zinc-700 dark:bg-zinc-900"
    >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <div>
            <h2 id="accounts-import-title" className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Import Accounts</h2>
            <div className="mt-1 flex items-center gap-1.5">
              {(['upload', 'reconcile', 'map'] as const).map((s, i) => (
                <span key={s} className="flex items-center gap-1.5">
                  {i > 0 && <span className="text-zinc-200 dark:text-zinc-700">›</span>}
                  <span className={`text-[11px] ${step === s ? 'font-semibold text-blue-600 dark:text-blue-400' : 'text-zinc-400'}`}>
                    {s === 'upload' ? 'Upload' : s === 'reconcile' ? 'Review Fields' : 'Map Columns'}
                  </span>
                </span>
              ))}
            </div>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">

          {/* ── Step 1: Upload ─────────────────────────────────────────── */}
          {step === 'upload' && (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload a file — click to browse or drop a file here"
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                dragging ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
              }`}
            >
              <svg className="h-8 w-8 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm text-zinc-500">
                Drop a file here, or <span className="text-blue-500">browse</span>
              </p>
              <p className="text-xs text-zinc-400">CSV, TSV, Excel (.xlsx, .xls)</p>
              <p className="text-xs text-zinc-400">
                Required: Name, Country · Optional: State, Rep
                {fieldDefs.length > 0 && ` · Fields: ${fieldDefs.map((f) => f.label).join(', ')}`}
              </p>
              <a
                href="/sample-accounts.csv"
                download
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-blue-500 hover:underline"
              >
                Download sample CSV
              </a>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xls,.ods"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
              />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950">{error}</p>
          )}

          {/* ── Step 2: Reconcile ──────────────────────────────────────── */}
          {step === 'reconcile' && reconcileResult && (
            <ReconcileStep
              result={reconcileResult}
              fieldsToRemove={fieldsToRemove}
              onToggleRemove={toggleFieldToRemove}
              onConfirm={handleReconcileConfirm}
              onBack={resetToUpload}
            />
          )}

          {/* ── Step 3: Column mapping ─────────────────────────────────── */}
          {step === 'map' && (
            <>
              {rawHeaders.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Map Columns</p>
                  <div className="max-h-52 overflow-y-auto pr-1">
                  <div className="grid grid-cols-3 gap-2">
                    {allMappingFields.map(({ key, label, required }) => (
                      <div key={key}>
                        <label className="mb-0.5 block text-xs text-zinc-500">
                          {label}{required && ' *'}
                        </label>
                        <select
                          value={colMap[key] ?? ''}
                          onChange={(e) => handleColChange(key, e.target.value)}
                          className="w-full rounded-lg border border-zinc-200 bg-zinc-50 py-1.5 pl-2 pr-6 text-xs text-zinc-700 outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                        >
                          <option value="">— not mapped —</option>
                          {rawHeaders.map((h) => <option key={h} value={h}>{h}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>
                  </div>
                </div>
              )}

              {/* Preview */}
              {preview && preview.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">
                    Preview
                    <span className="ml-2 font-normal normal-case text-zinc-500">
                      {validCount} valid
                      {skipCount > 0 && <span className="text-red-400"> · {skipCount} skipped</span>}
                    </span>
                  </p>
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-zinc-100 dark:border-zinc-800">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-50 dark:bg-zinc-800">
                        <tr>
                          {['Name', 'Country', firstDef?.label ?? '—', 'Rep'].map((h) => (
                            <th key={h} className="px-3 py-2 text-left font-medium text-zinc-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.slice(0, 8).map((row, i) => (
                          <tr key={i} className={`border-t border-zinc-50 dark:border-zinc-800 ${!row.valid ? 'opacity-40' : ''}`}>
                            <td className="max-w-[120px] truncate px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{row.name || <span className="text-red-400">—</span>}</td>
                            <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{row.countryIso2 ?? <span className="text-red-400">{row.country || '—'}</span>}</td>
                            <td className="px-3 py-1.5 text-zinc-500">{row.firstFieldVal || '—'}</td>
                            <td className="px-3 py-1.5 text-zinc-500">—</td>
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

              <button onClick={resetToUpload} className="text-xs text-blue-500 hover:underline">
                ← Choose a different file
              </button>
            </>
          )}
        </div>

        {/* Footer (only shown on map step) */}
        {step === 'map' && (
          <div className="flex items-center justify-end gap-2 border-t border-zinc-200 px-5 py-3 dark:border-zinc-700">
            <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800">
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!preview || validCount === 0 || importing}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {importing ? 'Importing…' : `Import ${validCount > 0 ? `${validCount} accounts` : 'accounts'}`}
            </button>
          </div>
        )}
    </dialog>
  );
}

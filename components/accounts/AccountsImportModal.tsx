'use client';

import { useRef, useState, useCallback, useMemo } from 'react';
import { useActions, useMembers } from '@/hooks/useTerritoryStore';
import { parseCSV, detectColumns, parseNumber } from '@/lib/csvParser';
import { resolveCountryIso2 } from '@/lib/countryNameToIso2';
import {
  STAGE_OPTIONS, SEGMENT_OPTIONS, TIER_OPTIONS, INDUSTRY_OPTIONS,
  normalizeOption,
} from '@/lib/accountFields';
import type { Account } from '@/types/account';

interface Props { onClose: () => void }

type ColMap = {
  name?: string; country?: string; state?: string;
  arr?: string; mrr?: string; headcount?: string;
  stage?: string; segment?: string; industry?: string; tier?: string; rep?: string;
};

interface PreviewRow {
  name: string; country: string; countryIso2: string | null;
  stage: string; segment: string; arr: number; rep: string;
  valid: boolean;
}

const FIELD_LABELS: { key: keyof ColMap; label: string; required?: boolean }[] = [
  { key: 'name',      label: 'Name',      required: true  },
  { key: 'country',   label: 'Country',   required: true  },
  { key: 'state',     label: 'State'                      },
  { key: 'arr',       label: 'ARR'                        },
  { key: 'mrr',       label: 'MRR'                        },
  { key: 'headcount', label: 'Headcount'                  },
  { key: 'stage',     label: 'Stage'                      },
  { key: 'segment',   label: 'Segment'                    },
  { key: 'industry',  label: 'Industry'                   },
  { key: 'tier',      label: 'Tier'                       },
  { key: 'rep',       label: 'Sales Rep'                  },
];

export default function AccountsImportModal({ onClose }: Props) {
  const { importAccounts } = useActions();
  const members  = useMembers();
  const fileRef  = useRef<HTMLInputElement>(null);

  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows,    setRawRows]    = useState<Record<string, string>[]>([]);
  const [colMap,     setColMap]     = useState<ColMap>({});
  const [preview,    setPreview]    = useState<PreviewRow[] | null>(null);
  const [dragging,   setDragging]   = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const membersByNameEmail = useMemo(() => {
    const map: Record<string, string> = {};
    Object.values(members).forEach((m) => {
      map[m.name.toLowerCase()]  = m.id;
      map[m.email.toLowerCase()] = m.id;
    });
    return map;
  }, [members]);

  const buildPreview = useCallback((
    rows: Record<string, string>[],
    map: ColMap,
  ) => {
    const built: PreviewRow[] = rows.slice(0, 200).map((row) => {
      const name       = map.name    ? (row[map.name] ?? '') : '';
      const rawCountry = map.country ? (row[map.country] ?? '') : '';
      const countryIso2 = resolveCountryIso2(rawCountry);
      const stage   = map.stage   ? normalizeOption(row[map.stage]   ?? '', STAGE_OPTIONS,   'Prospect') : 'Prospect';
      const segment = map.segment ? normalizeOption(row[map.segment] ?? '', SEGMENT_OPTIONS, 'SMB')      : 'SMB';
      const arr = map.arr ? parseNumber(row[map.arr] ?? '') : 0;
      const rep = map.rep ? (row[map.rep] ?? '') : '';
      return { name, country: rawCountry, countryIso2, stage, segment, arr, rep, valid: !!name && !!countryIso2 };
    });
    setPreview(built);
  }, []);

  const processFile = useCallback((text: string) => {
    setError(null);
    const rows = parseCSV(text);
    if (rows.length === 0) { setError('No data rows found.'); return; }
    const headers  = Object.keys(rows[0]);
    const detected = detectColumns(headers);
    const resolved: ColMap = {
      name:      detected.name,
      country:   detected.country,
      state:     detected.state,
      arr:       detected.arr,
      mrr:       detected.mrr,
      headcount: detected.headcount,
      stage:     detected.stage,
      segment:   detected.segment,
      industry:  detected.industry,
      tier:      detected.tier,
      rep:       detected.rep,
    };
    setRawHeaders(headers);
    setRawRows(rows);
    setColMap(resolved);
    buildPreview(rows, resolved);
  }, [buildPreview]);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => processFile(e.target?.result as string);
    reader.readAsText(file);
  };

  const handleColChange = (field: keyof ColMap, header: string) => {
    const next = { ...colMap, [field]: header || undefined };
    setColMap(next);
    buildPreview(rawRows, next);
  };

  const handleConfirm = () => {
    if (!preview) return;
    const valid = preview.filter((r) => r.valid);
    if (valid.length === 0) { setError('No valid rows — check Name and Country mapping.'); return; }

    const accounts: Array<Partial<Omit<Account, 'id'>> & { name: string; country: string }> = rawRows
      .map((row) => {
        const name       = colMap.name    ? (row[colMap.name] ?? '') : '';
        const rawCountry = colMap.country ? (row[colMap.country] ?? '') : '';
        const countryIso2 = resolveCountryIso2(rawCountry);
        if (!name || !countryIso2) return null;

        const rawState = colMap.state ? (row[colMap.state] ?? '') : '';
        const state    = rawState ? `${countryIso2}:${rawState.trim().toUpperCase()}` : undefined;

        const repRaw = colMap.rep ? (row[colMap.rep] ?? '').toLowerCase() : '';
        const repId  = repRaw ? (membersByNameEmail[repRaw] ?? null) : null;

        return {
          name: name.trim(),
          country:   countryIso2,
          state,
          arr:       colMap.arr       ? parseNumber(row[colMap.arr] ?? '')       : 0,
          mrr:       colMap.mrr       ? parseNumber(row[colMap.mrr] ?? '')       : 0,
          headcount: colMap.headcount ? parseInt(row[colMap.headcount] ?? '') || 0 : 0,
          stage:     colMap.stage     ? normalizeOption(row[colMap.stage]    ?? '', STAGE_OPTIONS,    'Prospect') : undefined,
          segment:   colMap.segment   ? normalizeOption(row[colMap.segment]  ?? '', SEGMENT_OPTIONS,  'SMB')      : undefined,
          industry:  colMap.industry  ? normalizeOption(row[colMap.industry] ?? '', INDUSTRY_OPTIONS, 'Other')    : undefined,
          tier:      colMap.tier      ? normalizeOption(row[colMap.tier]     ?? '', TIER_OPTIONS,     'Untiered') : undefined,
          repId,
        };
      })
      .filter(Boolean) as Array<Partial<Omit<Account, 'id'>> & { name: string; country: string }>;

    importAccounts(accounts);
    onClose();
  };

  const validCount = preview?.filter((r) => r.valid).length ?? 0;
  const skipCount  = (preview?.length ?? 0) - validCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-700">
          <h2 className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">Import Accounts from CSV</h2>
          <button onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 p-5">
          {/* Drop zone */}
          {!preview && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => fileRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 transition-colors ${
                dragging ? 'border-blue-400 bg-blue-50 dark:bg-blue-950/20' : 'border-zinc-200 hover:border-zinc-300 dark:border-zinc-700'
              }`}
            >
              <svg className="h-8 w-8 text-zinc-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <p className="text-sm text-zinc-500">Drop a CSV file here, or <span className="text-blue-500">browse</span></p>
              <p className="text-xs text-zinc-400">Required: Name, Country · Optional: State, Stage, Segment, Industry, Tier, ARR, MRR, Headcount, Rep</p>
              <a
                href="/sample-accounts.csv"
                download
                onClick={(e) => e.stopPropagation()}
                className="text-xs text-blue-500 hover:underline"
              >
                Download sample CSV
              </a>
              <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 dark:bg-red-950">{error}</p>
          )}

          {/* Column mapping */}
          {preview && rawHeaders.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Map Columns</p>
              <div className="grid grid-cols-3 gap-2">
                {FIELD_LABELS.map(({ key, label, required }) => (
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
                      {['Name', 'Country', 'Stage', 'Segment', 'ARR', 'Rep'].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-zinc-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.slice(0, 8).map((row, i) => (
                      <tr key={i} className={`border-t border-zinc-50 dark:border-zinc-800 ${!row.valid ? 'opacity-40' : ''}`}>
                        <td className="max-w-[120px] truncate px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{row.name || <span className="text-red-400">—</span>}</td>
                        <td className="px-3 py-1.5 text-zinc-700 dark:text-zinc-300">{row.countryIso2 ?? <span className="text-red-400">{row.country || '—'}</span>}</td>
                        <td className="px-3 py-1.5 text-zinc-500">{row.stage}</td>
                        <td className="px-3 py-1.5 text-zinc-500">{row.segment}</td>
                        <td className="px-3 py-1.5 text-right text-zinc-700 dark:text-zinc-300">
                          {row.arr > 0 ? `$${row.arr.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-zinc-500">{row.rep || '—'}</td>
                      </tr>
                    ))}
                    {preview.length > 8 && (
                      <tr className="border-t border-zinc-50 dark:border-zinc-800">
                        <td colSpan={6} className="px-3 py-1.5 text-center text-zinc-400">… and {preview.length - 8} more rows</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

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
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Import {validCount > 0 ? `${validCount} accounts` : 'accounts'}
          </button>
        </div>
      </div>
    </div>
  );
}

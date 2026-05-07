'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useActions, useMembers, useFieldDefs, useTerritoryStore, useGeoNodes } from '@/hooks/useTerritoryStore';
import { parseTextFile, parseExcel } from '@/lib/fileParser';
import {
  inferDefaultConfigs,
  configsToNewFieldDefs,
  buildColMapFromConfigs,
  buildPreviewRows,
  buildImportRows,
  getOrphanFieldDefs,
  type ColumnConfigMap,
  type PreviewRow,
} from './import/importHelpers';
import UploadStep from './import/UploadStep';
import ConfigureStep from './import/ConfigureStep';
import ReconcileStep from './import/ReconcileStep';
import MapStep from './import/MapStep';
import { useEntityNoun } from '@/hooks/useEntityNoun';

interface Props { onClose: () => void }

type Step = 'upload' | 'configure' | 'reconcile' | 'map';

export default function AccountsImportModal({ onClose }: Props) {
  const { importAccounts, addFieldDef, removeFieldDef, updateFieldDef } = useActions();
  const members   = useMembers();
  const fieldDefs = useFieldDefs();
  const geoNodes  = useGeoNodes();
  const entityPlural = useEntityNoun('plural');
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { dialogRef.current?.showModal(); }, []);

  const [step,           setStep]           = useState<Step>('upload');
  const [rawHeaders,     setRawHeaders]     = useState<string[]>([]);
  const [rawRows,        setRawRows]        = useState<Record<string, string>[]>([]);
  const [configs,        setConfigs]        = useState<ColumnConfigMap>({});
  const [colMap,         setColMap]         = useState<Record<string, string>>({});
  const [preview,        setPreview]        = useState<PreviewRow[] | null>(null);
  const [error,          setError]          = useState<string | null>(null);
  const [orphans,        setOrphans]        = useState<ReturnType<typeof getOrphanFieldDefs>>([]);
  const [fieldsToRemove, setFieldsToRemove] = useState<Set<string>>(new Set());
  const [importing,      setImporting]      = useState(false);

  const membersByNameEmail = useMemo(() => {
    const map: Record<string, string> = {};
    Object.values(members).forEach((m) => {
      map[m.name.toLowerCase()]  = m.id;
      map[m.email.toLowerCase()] = m.id;
    });
    return map;
  }, [members]);

  const geosByName = useMemo(() => {
    const map: Record<string, string> = {};
    Object.values(geoNodes).forEach((g) => { map[g.name.toLowerCase()] = g.id; });
    return map;
  }, [geoNodes]);

  const afterParse = useCallback((rows: Record<string, string>[], headers: string[]) => {
    setError(null);
    if (rows.length === 0) { setError('No data rows found.'); return; }
    setRawHeaders(headers);
    setRawRows(rows);
    setConfigs(inferDefaultConfigs(headers, rows, fieldDefs));
    setStep('configure');
  }, [fieldDefs]);

  const handleFile = useCallback((file: File) => {
    setError(null);
    const isExcel = /\.(xlsx?|ods)$/i.test(file.name);
    const reader = new FileReader();
    reader.onerror = () => setError("Couldn't read file. It may be corrupt or locked by another program.");
    if (isExcel) {
      reader.onload = async (e) => {
        const result = e.target?.result;
        if (!(result instanceof ArrayBuffer)) { setError('Unexpected file format.'); return; }
        try {
          const rows = await parseExcel(result);
          if (rows.length === 0) { setError('No data found in spreadsheet.'); return; }
          afterParse(rows, Object.keys(rows[0]));
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
          const rows = parseTextFile(result);
          if (rows.length === 0) { setError('No data rows found.'); return; }
          afterParse(rows, Object.keys(rows[0]));
        } catch (err) {
          console.error('[import] CSV parse failed', err);
          setError(err instanceof Error ? `Couldn't parse file: ${err.message}` : "Couldn't parse file.");
        }
      };
      reader.readAsText(file);
    }
  }, [afterParse]);

  async function handleConfigureConfirm() {
    setError(null);
    const newDefs = configsToNewFieldDefs(configs, rawRows);

    try {
      await Promise.all(newDefs.map(({ def }) => addFieldDef(def)));
    } catch (err) {
      console.error('[import] addFieldDef failed', err);
      setError(err instanceof Error ? err.message : 'Failed to add fields.');
      return;
    }

    const updatedDefs = useTerritoryStore.getState().fieldDefs;
    const orphanList  = getOrphanFieldDefs(configs, updatedDefs);

    if (orphanList.length > 0) {
      setOrphans(orphanList);
      setFieldsToRemove(new Set());
      setStep('reconcile');
      return;
    }

    advanceToPreview(updatedDefs);
  }

  async function handleReconcileConfirm() {
    setError(null);
    try {
      await Promise.all(Array.from(fieldsToRemove).map((id) => removeFieldDef(id)));
    } catch (err) {
      console.error('[import] removeFieldDef failed', err);
      setError(err instanceof Error ? err.message : 'Failed to remove fields.');
      return;
    }
    advanceToPreview(useTerritoryStore.getState().fieldDefs);
  }

  function advanceToPreview(defs: typeof fieldDefs) {
    const map = buildColMapFromConfigs(configs, defs);
    setColMap(map);
    setPreview(buildPreviewRows(rawRows, map, defs));
    setStep('map');
  }

  function toggleFieldToRemove(id: string) {
    setFieldsToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleConfirm() {
    if (!preview) return;
    const valid = preview.filter((r) => r.valid);
    if (valid.length === 0) { setError('No valid rows — every row needs a Name.'); return; }

    const rows = buildImportRows(rawRows, colMap, fieldDefs, membersByNameEmail, geosByName);

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
  }

  function resetToUpload() {
    setStep('upload');
    setRawRows([]);
    setRawHeaders([]);
    setConfigs({});
    setColMap({});
    setPreview(null);
    setError(null);
    setOrphans([]);
    setFieldsToRemove(new Set());
  }

  function backToConfigure() {
    setStep('configure');
  }

  const validCount = preview?.filter((r) => r.valid).length ?? 0;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="accounts-import-title"
      className="m-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-black/40 backdrop:backdrop-blur-sm dark:border-slate-700 dark:bg-slate-900"
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div>
          <h2 id="accounts-import-title" className="text-sm font-semibold text-slate-800 dark:text-slate-100">Import {entityPlural}</h2>
          <div className="mt-1 flex items-center gap-1.5">
            {(['upload', 'configure', 'reconcile', 'map'] as const).map((s, i) => (
              <span key={s} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-slate-200 dark:text-slate-700">›</span>}
                <span className={`text-[11px] ${step === s ? 'font-semibold text-brand' : 'text-slate-400'}`}>
                  {s === 'upload' ? 'Upload' : s === 'configure' ? 'Configure Columns' : s === 'reconcile' ? 'Review Removals' : 'Preview'}
                </span>
              </span>
            ))}
          </div>
        </div>
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      <div className="space-y-4 p-5">
        {step === 'upload' && <UploadStep fieldDefs={fieldDefs} onFile={handleFile} />}

        {error && (
          <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950">{error}</p>
        )}

        {step === 'configure' && (
          <ConfigureStep
            rawHeaders={rawHeaders}
            rows={rawRows}
            fieldDefs={fieldDefs}
            configs={configs}
            onChange={setConfigs}
            onConfirm={handleConfigureConfirm}
            onBack={resetToUpload}
            onSaveAlias={async (header, fieldId) => {
              const def = useTerritoryStore.getState().fieldDefs.find((d) => d.id === fieldId);
              if (!def) return;
              const h = header.toLowerCase().trim();
              const next = [...(def.aliases ?? [])];
              if (!next.includes(h)) next.push(h);
              await updateFieldDef(fieldId, { aliases: next });
            }}
          />
        )}

        {step === 'reconcile' && (
          <ReconcileStep
            orphans={orphans}
            fieldsToRemove={fieldsToRemove}
            onToggleRemove={toggleFieldToRemove}
            onConfirm={handleReconcileConfirm}
            onBack={backToConfigure}
          />
        )}

        {step === 'map' && (
          <MapStep
            fieldDefs={fieldDefs}
            preview={preview}
            onBack={backToConfigure}
          />
        )}
      </div>

      {step === 'map' && (
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800">
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!preview || validCount === 0 || importing}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {importing ? 'Importing…' : `Import ${validCount > 0 ? `${validCount} accounts` : 'accounts'}`}
          </button>
        </div>
      )}
    </dialog>
  );
}

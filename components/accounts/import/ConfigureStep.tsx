'use client';

import { useMemo, useState } from 'react';
import type { FieldDefinition } from '@/lib/accountFields';
import {
  validateConfigs,
  type ColumnConfig,
  type ColumnConfigMap,
  type ColumnRole,
  type FieldTypeChoice,
} from './importHelpers';
import { useOwnerNoun } from '@/hooks/useOwnerNoun';

interface Props {
  rawHeaders: string[];
  rows: Record<string, string>[];
  fieldDefs: FieldDefinition[];
  configs: ColumnConfigMap;
  onChange: (configs: ColumnConfigMap) => void;
  onConfirm: () => void;
  onBack: () => void;
  /** Persist `header` (lowercased) as an alias of the existing field. */
  onSaveAlias: (header: string, fieldId: string) => Promise<void> | void;
}

function buildRoleOptions(ownerNoun: string): { value: ColumnRole; label: string }[] {
  return [
    { value: 'name',    label: 'Name *' },
    { value: 'country', label: 'Country' },
    { value: 'state',   label: 'State' },
    { value: 'geo',     label: 'Geo' },
    { value: 'rep',     label: ownerNoun },
    { value: 'field',   label: 'Custom field' },
    { value: 'skip',    label: 'Skip' },
  ];
}

const TYPE_OPTIONS: { value: FieldTypeChoice; label: string }[] = [
  { value: 'text',     label: 'Text' },
  { value: 'number',   label: 'Number' },
  { value: 'currency', label: 'Currency' },
  { value: 'dropdown', label: 'Dropdown' },
];

export default function ConfigureStep({
  rawHeaders, rows, fieldDefs, configs, onChange, onConfirm, onBack, onSaveAlias,
}: Props) {
  const [savedAliases, setSavedAliases] = useState<Set<string>>(new Set());
  const [savingAlias, setSavingAlias] = useState<string | null>(null);

  async function handleSaveAlias(header: string, fieldId: string) {
    const key = `${fieldId}::${header.toLowerCase().trim()}`;
    if (savedAliases.has(key)) return;
    setSavingAlias(key);
    try {
      await onSaveAlias(header, fieldId);
      setSavedAliases((prev) => new Set(prev).add(key));
    } finally {
      setSavingAlias(null);
    }
  }
  const validation = useMemo(() => validateConfigs(configs), [configs]);
  const ownerNoun = useOwnerNoun();
  const roleOptions = useMemo(() => buildRoleOptions(ownerNoun), [ownerNoun]);

  function setRole(header: string, role: ColumnRole) {
    const next: ColumnConfigMap = { ...configs };
    // Critical roles are exclusive — clear any other column already holding this role.
    if (role === 'name' || role === 'country' || role === 'state' || role === 'geo' || role === 'rep') {
      for (const [h, cfg] of Object.entries(next)) {
        if (h !== header && cfg.role === role) next[h] = { role: 'skip' };
      }
    }
    const prev = next[header] ?? { role: 'skip' };
    if (role === 'field') {
      next[header] = { role, type: prev.type ?? 'text', existingFieldId: prev.existingFieldId };
    } else {
      next[header] = { role };
    }
    onChange(next);
  }

  function setType(header: string, type: FieldTypeChoice) {
    const prev = configs[header];
    if (!prev || prev.role !== 'field' || prev.existingFieldId) return;
    onChange({ ...configs, [header]: { ...prev, type } });
  }

  function uniqueCount(header: string): number {
    const h = header.toLowerCase().trim();
    const set = new Set<string>();
    for (const r of rows) {
      const v = (r[h] ?? '').trim();
      if (v) set.add(v);
    }
    return set.size;
  }

  const fieldDefById = useMemo(() => {
    const m: Record<string, FieldDefinition> = {};
    fieldDefs.forEach((d) => { m[d.id] = d; });
    return m;
  }, [fieldDefs]);

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-800 dark:border-indigo-800 dark:bg-indigo-950/30 dark:text-indigo-200">
        Assign each column a role. <span className="font-semibold">Name</span> is required (must be unique).
        Country and State are optional — accounts without a country won&apos;t appear on the map.
      </div>

      <div className="max-h-[420px] overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
            <tr className="text-left text-slate-500">
              <th className="px-3 py-2 font-medium">File column</th>
              <th className="px-3 py-2 font-medium">Role</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {rawHeaders.map((header) => {
              const cfg: ColumnConfig = configs[header] ?? { role: 'skip' };
              const isField = cfg.role === 'field';
              const lockedDef = cfg.existingFieldId ? fieldDefById[cfg.existingFieldId] : null;
              const showOptionPreview = isField && cfg.type === 'dropdown' && !lockedDef;

              return (
                <tr key={header} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="max-w-[160px] truncate px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200" title={header}>
                    {header}
                  </td>
                  <td className="px-3 py-1.5">
                    <select
                      value={cfg.role}
                      onChange={(e) => setRole(header, e.target.value as ColumnRole)}
                      className="w-full rounded border border-slate-200 bg-white py-1 pl-1.5 pr-5 text-xs text-slate-700 outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    >
                      {roleOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-1.5">
                    {isField ? (
                      <select
                        value={cfg.type ?? 'text'}
                        onChange={(e) => setType(header, e.target.value as FieldTypeChoice)}
                        disabled={!!lockedDef}
                        className="w-full rounded border border-slate-200 bg-white py-1 pl-1.5 pr-5 text-xs text-slate-700 outline-none focus:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                      >
                        {TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-slate-300">—</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-[11px] text-slate-400">
                    {lockedDef && (() => {
                      const h = header.toLowerCase().trim();
                      const isKnown =
                        lockedDef.label.toLowerCase() === h ||
                        lockedDef.id.toLowerCase() === h ||
                        (lockedDef.aliases?.includes(h) ?? false);
                      const aliasKey = `${lockedDef.id}::${h}`;
                      const justSaved = savedAliases.has(aliasKey);
                      const saving = savingAlias === aliasKey;
                      return (
                        <span className="flex items-center gap-2">
                          <span>maps to existing <span className="text-slate-500">{lockedDef.label}</span></span>
                          {!isKnown && !justSaved && (
                            <button
                              type="button"
                              onClick={() => handleSaveAlias(header, lockedDef.id)}
                              disabled={saving}
                              className="rounded px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 hover:bg-indigo-50 disabled:opacity-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                            >
                              {saving ? 'Saving…' : 'Remember header'}
                            </button>
                          )}
                          {justSaved && <span className="text-green-600 dark:text-green-400">Saved</span>}
                        </span>
                      );
                    })()}
                    {!lockedDef && showOptionPreview && <>{uniqueCount(header)} unique values</>}
                    {!lockedDef && isField && cfg.type === 'currency' && <>numbers with $ prefix</>}
                    {cfg.role === 'skip' && <>not imported</>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!validation.ok && (
        <div className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950/40 dark:text-rose-300">
          {validation.missing.length > 0 && (
            <p>Required: Name.</p>
          )}
          {validation.duplicateRoles.length > 0 && (
            <p>Each role can only be assigned to one column.</p>
          )}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
        <button onClick={onBack} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
          ← Choose a different file
        </button>
        <button
          onClick={onConfirm}
          disabled={!validation.ok}
          className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}

'use client';

import { useMemo, useRef, useState } from 'react';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';
import { parse } from '@/lib/formula/parse';

interface Props {
  source: string;
  onChange: (v: string) => void;
  defs: FieldDefinition[];
  previewAccount: Account | null;
}

export default function AdvancedMode({ source, onChange, defs, previewAccount }: Props) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [autocompleteOpen, setAutocompleteOpen] = useState(false);
  const [autocompleteFilter, setAutocompleteFilter] = useState('');
  const [caret, setCaret] = useState(0);

  const nameToId = useMemo(() => Object.fromEntries(defs.map((d) => [d.label, d.id])), [defs]);

  const parseResult = useMemo(() => parse(source, { nameToId }), [source, nameToId]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    onChange(v);
    const pos = e.target.selectionStart ?? v.length;
    setCaret(pos);
    const before = v.slice(0, pos);
    const openIdx = before.lastIndexOf('{');
    const closeIdx = before.lastIndexOf('}');
    if (openIdx > closeIdx) {
      setAutocompleteOpen(true);
      setAutocompleteFilter(before.slice(openIdx + 1));
    } else {
      setAutocompleteOpen(false);
    }
  }

  function pickField(name: string) {
    const ta = taRef.current;
    if (!ta) return;
    const before = source.slice(0, caret);
    const openIdx = before.lastIndexOf('{');
    if (openIdx < 0) return;
    const after = source.slice(caret);
    const next = `${source.slice(0, openIdx)}{${name}}${after}`;
    onChange(next);
    setAutocompleteOpen(false);
    setTimeout(() => {
      const newPos = openIdx + name.length + 2;
      ta.focus();
      ta.setSelectionRange(newPos, newPos);
    }, 0);
  }

  const filteredFields = defs.filter((d) =>
    d.label.toLowerCase().includes(autocompleteFilter.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <textarea
          ref={taRef}
          aria-label="Formula source"
          value={source}
          onChange={handleChange}
          onKeyDown={(e) => { if (e.key === 'Escape') setAutocompleteOpen(false); }}
          spellCheck={false}
          rows={6}
          placeholder="Type a formula. Use { to insert a field. Example: IF({ARR} > 100000, 'Ent', 'SMB')"
          className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm leading-6 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
        {autocompleteOpen && filteredFields.length > 0 && (
          <ul
            role="listbox"
            className="absolute left-2 z-10 mt-1 max-h-48 min-w-[12rem] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {filteredFields.slice(0, 10).map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => pickField(d.label)}
                  className="block w-full px-3 py-1.5 text-left text-sm text-slate-700 hover:bg-indigo-50 dark:text-slate-200 dark:hover:bg-indigo-950"
                >
                  <span className="font-mono">{d.label}</span>
                  <span className="ml-2 text-xs text-slate-400">{d.type}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!parseResult.ok && parseResult.errors.length > 0 && (
        <ul className="space-y-0.5 text-xs text-rose-600 dark:text-rose-400">
          {parseResult.errors.map((e, idx) => (
            <li key={idx}>
              <span className="font-mono">col {e.col}:</span> {e.message}
              {e.code === 'UNKNOWN_FIELD' && e.name && (
                <span className="ml-1 text-rose-500/80">
                  {suggestField(e.name, defs)
                    ? `— did you mean "${suggestField(e.name, defs)!.label}"?`
                    : ''}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {parseResult.ok && previewAccount && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Previewing against <strong>{previewAccount.name}</strong>.</p>
      )}
    </div>
  );
}

function suggestField(name: string, defs: FieldDefinition[]): FieldDefinition | undefined {
  const target = name.toLowerCase();
  let best: { d: FieldDefinition; score: number } | null = null;
  for (const d of defs) {
    const lower = d.label.toLowerCase();
    const score = sharedPrefix(lower, target) + (lower.includes(target) ? 3 : 0);
    if (score > 0 && (!best || score > best.score)) best = { d, score };
  }
  return best?.d;
}

function sharedPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i;
}

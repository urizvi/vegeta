'use client';

import { useMemo, useState } from 'react';
import type { FieldDefinition, ComputedOutput } from '@/lib/accountFields';
import { formatFieldValue } from '@/lib/accountFields';
import type { Account } from '@/types/account';
import type { FormulaAst } from '@/lib/formula/ast';
import type { SimpleFormConfig } from '@/lib/formula/simpleForm';
import { simpleToAst, astToSimple, isExpressibleInSimple } from '@/lib/formula/simpleForm';
import { parse, prettyPrint } from '@/lib/formula/parse';
import { evaluate } from '@/lib/formula/evaluate';
import { inferType } from '@/lib/formula/typeCheck';
import { detectCycle } from '@/lib/formula/recompute';
import FormulaEditorHeader from './FormulaEditorHeader';
import SimpleMode from './SimpleMode';
import AdvancedMode from './AdvancedMode';
import ConvertOutputDialog from './ConvertOutputDialog';

interface Props {
  /** Existing computed field being edited; null when authoring a new one. */
  existing: FieldDefinition | null;
  /** Full set of field defs (used for autocomplete + type checks). */
  defs: FieldDefinition[];
  accounts: Account[];
  onCancel: () => void;
  onSave: (draft: Omit<FieldDefinition, 'id'>) => Promise<void>;
}

const DEFAULT_SIMPLE: Record<ComputedOutput, SimpleFormConfig> = {
  number:  { shape: 'arithmetic', terms: [] },
  text:    { shape: 'bucket', fieldId: '', op: '>', tiers: [], otherwise: '' },
  boolean: { shape: 'flag', join: 'and', conditions: [] },
};

export default function FormulaEditor({ existing, defs, accounts, onCancel, onSave }: Props) {
  const [label, setLabel] = useState(existing?.label ?? '');
  const [outputType, setOutputType] = useState<ComputedOutput>(existing?.outputType ?? 'number');
  const [isCurrency, setIsCurrency] = useState(!!existing?.isCurrency);
  const [mode, setMode] = useState<'simple' | 'advanced'>('simple');
  const [simpleCfg, setSimpleCfg] = useState<SimpleFormConfig>(
    existing?.formulaForm ?? (existing?.formula ? (astToSimple(existing.formula) ?? DEFAULT_SIMPLE[existing.outputType ?? 'number']) : DEFAULT_SIMPLE[outputType]),
  );
  const [advancedSrc, setAdvancedSrc] = useState<string>(
    existing?.formulaSource
      ?? (existing?.formula ? prettyPrint(existing.formula, { idToName: idMapFromDefs(defs) }) : ''),
  );
  const [previewId, setPreviewId] = useState<string | null>(accounts[0]?.id ?? null);
  const [showConvert, setShowConvert] = useState(false);

  const outputTypeLocked = existing !== null;

  const idToName = useMemo(() => idMapFromDefs(defs), [defs]);
  const nameToId = useMemo(() => nameMapFromDefs(defs), [defs]);

  const draftAst: FormulaAst | null = useMemo(() => {
    if (mode === 'simple') {
      try { return simpleToAst(simpleCfg); } catch { return null; }
    }
    const r = parse(advancedSrc, { nameToId });
    return r.ok ? r.ast : null;
  }, [mode, simpleCfg, advancedSrc, nameToId]);

  const previewAccount = accounts.find((a) => a.id === previewId) ?? null;
  const previewLabel = useMemo(() => {
    if (!draftAst || !previewAccount) return '—';
    const r = evaluate(draftAst, previewAccount, defs);
    if (!r.ok) return '—';
    return formatFieldValue(r.value as string | number | boolean, {
      id: 'preview', label, type: 'computed', entity: 'account',
      outputType, isCurrency,
    });
  }, [draftAst, previewAccount, defs, label, outputType, isCurrency]);

  function validate(): string | null {
    if (!label.trim()) return 'Name is required.';
    if (!draftAst) return mode === 'advanced' ? 'Fix the formula errors above.' : 'Complete the formula.';
    const inferred = inferType(draftAst, defs);
    if (!inferred.ok) return `Type error: ${inferred.error.code}`;
    if (inferred.type !== outputType) return `Formula returns ${inferred.type}, but output is set to ${outputType}.`;
    const draftDef: FieldDefinition = {
      id: existing?.id ?? '__draft__',
      label, type: 'computed', entity: 'account',
      outputType, isCurrency, formula: draftAst,
    };
    const cycle = detectCycle(existing ? defs.map((d) => d.id === existing.id ? draftDef : d) : [...defs, draftDef]);
    if (cycle) return 'This formula would create a cycle.';
    return null;
  }

  const validationError = validate();

  const tooComplexInSimple = useMemo(() => {
    if (!draftAst) return false;
    return !isExpressibleInSimple(draftAst);
  }, [draftAst]);

  function handleModeChange(next: 'simple' | 'advanced') {
    if (next === 'simple' && mode === 'advanced' && draftAst) {
      const recovered = astToSimple(draftAst);
      if (recovered) setSimpleCfg(recovered);
      // If recovered is null, SimpleMode will show the tooComplex banner.
    }
    setMode(next);
  }

  async function handleSave() {
    if (validationError) return;
    await onSave({
      label: label.trim(),
      type: 'computed',
      entity: 'account',
      outputType,
      isCurrency: outputType === 'number' ? isCurrency : undefined,
      formula: draftAst!,
      formulaSource: mode === 'advanced' ? advancedSrc : prettyPrint(draftAst!, { idToName }),
      formulaForm: mode === 'simple' ? simpleCfg : undefined,
    });
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <FormulaEditorHeader
        label={label}
        onLabelChange={setLabel}
        outputType={outputType}
        outputTypeLocked={outputTypeLocked}
        onOutputTypeChange={(v) => { setOutputType(v); setSimpleCfg(DEFAULT_SIMPLE[v]); }}
        onRequestConvert={() => setShowConvert(true)}
        isCurrency={isCurrency}
        onIsCurrencyChange={setIsCurrency}
        mode={mode}
        onModeChange={handleModeChange}
        previewAccountId={previewId}
        previewOptions={accounts.map((a) => ({ id: a.id, name: a.name }))}
        onPreviewAccountChange={setPreviewId}
        previewLabel={previewLabel}
      />

      <div className="p-5">
        {mode === 'simple' ? (
          <SimpleMode
            config={simpleCfg}
            outputType={outputType}
            defs={defs}
            onChange={setSimpleCfg}
            tooComplex={tooComplexInSimple}
          />
        ) : (
          <AdvancedMode
            source={advancedSrc}
            onChange={setAdvancedSrc}
            defs={defs}
            previewAccount={previewAccount}
          />
        )}
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        {validationError && (
          <span className="mr-auto text-xs text-rose-600 dark:text-rose-400">{validationError}</span>
        )}
        <button onClick={onCancel} className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!!validationError}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Save
        </button>
      </div>

      {showConvert && existing && (
        <ConvertOutputDialog
          fieldLabel={existing.label}
          currentType={existing.outputType ?? 'number'}
          onCancel={() => setShowConvert(false)}
          onConfirm={async (next: ComputedOutput) => {
            // 1. Persist the cleared, type-converted def to the store first.
            //    This fires updateFieldDef → recompute tail → workspace backfill.
            await onSave({
              label: label.trim() || existing!.label,
              type: 'computed',
              entity: 'account',
              outputType: next,
              isCurrency: next === 'number' ? isCurrency : undefined,
              // Intentionally omit formula / formulaSource / formulaForm so they're cleared.
            });
            // 2. Then update local editor state so the UI reflects the new type.
            setOutputType(next);
            setSimpleCfg(DEFAULT_SIMPLE[next]);
            setAdvancedSrc('');
            setShowConvert(false);
          }}
        />
      )}
    </div>
  );
}

function idMapFromDefs(defs: FieldDefinition[]): Record<string, string> {
  const out: Record<string, string> = {};
  defs.forEach((d) => { out[d.id] = d.label; });
  return out;
}

function nameMapFromDefs(defs: FieldDefinition[]): Record<string, string> {
  const out: Record<string, string> = {};
  defs.forEach((d) => { out[d.label] = d.id; });
  return out;
}

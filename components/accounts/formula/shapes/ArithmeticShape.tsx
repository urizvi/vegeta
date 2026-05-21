'use client';

import type { FieldDefinition } from '@/lib/accountFields';
import type { ArithmeticShape as Shape, ArithOp, ArithTerm } from '@/lib/formula/simpleForm';

interface Props {
  config: Shape;
  defs: FieldDefinition[];
  onChange: (c: Shape) => void;
}

const OPS: ArithOp[] = ['+', '-', '*', '/'];
const metricDefs = (defs: FieldDefinition[]) => defs.filter((d) => d.type === 'metric' || (d.type === 'computed' && d.outputType === 'number'));

export default function ArithmeticShape({ config, defs, onChange }: Props) {
  function setTerm(idx: number, t: ArithTerm) {
    const next = [...config.terms];
    next[idx] = t;
    onChange({ ...config, terms: next });
  }
  function addValueAndOp() {
    onChange({
      ...config,
      terms: config.terms.length === 0
        ? [{ kind: 'field', fieldId: '' }]
        : [...config.terms, { kind: 'op', op: '+' }, { kind: 'field', fieldId: '' }],
    });
  }
  function removeTail() {
    if (config.terms.length <= 1) return;
    onChange({ ...config, terms: config.terms.slice(0, -2) });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {config.terms.length === 0 && (
          <span className="text-sm text-slate-500 dark:text-slate-400">Pick a field to start.</span>
        )}
        {config.terms.map((t, i) => {
          if (t.kind === 'op') {
            return (
              <select
                key={i}
                aria-label={`Operator ${i}`}
                value={t.op}
                onChange={(e) => setTerm(i, { kind: 'op', op: e.target.value as ArithOp })}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
            );
          }
          if (t.kind === 'field') {
            return (
              <select
                key={i}
                aria-label={`Term ${i}`}
                value={t.fieldId}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v.startsWith('__num__')) {
                    setTerm(i, { kind: 'number', value: 0 });
                  } else {
                    setTerm(i, { kind: 'field', fieldId: v });
                  }
                }}
                className="rounded border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              >
                <option value="" disabled>Pick a field…</option>
                {metricDefs(defs).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
                <option value="__num__">— constant number —</option>
              </select>
            );
          }
          return (
            <input
              key={i}
              type="number"
              aria-label={`Number ${i}`}
              value={t.value}
              onChange={(e) => setTerm(i, { kind: 'number', value: Number(e.target.value) })}
              className="w-24 rounded border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
          );
        })}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={addValueAndOp}
          className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 hover:border-slate-400 dark:border-slate-700 dark:text-slate-400"
        >
          + add term
        </button>
        {config.terms.length > 1 && (
          <button
            type="button"
            onClick={removeTail}
            className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-400 hover:border-rose-400 hover:text-rose-500 dark:border-slate-700"
          >
            − remove last term
          </button>
        )}
      </div>
    </div>
  );
}

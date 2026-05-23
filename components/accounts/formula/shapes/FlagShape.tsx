'use client';

import type { FieldDefinition } from '@/lib/accountFields';
import type { FlagShape as Shape, CompareOp } from '@/lib/formula/simpleForm';

interface Props {
  config: Shape;
  defs: FieldDefinition[];
  onChange: (c: Shape) => void;
}

const OPS: CompareOp[] = ['=', '!=', '<', '<=', '>', '>='];
const eligibleDefs = (defs: FieldDefinition[]) =>
  defs.filter((d) => d.type === 'metric' || d.type === 'text' || d.type === 'categorical' || (d.type === 'computed' && d.outputType !== 'boolean'));

export default function FlagShape({ config, defs, onChange }: Props) {
  function update(idx: number, patch: Partial<Shape['conditions'][number]>) {
    const conditions = config.conditions.map((c, i) => i === idx ? { ...c, ...patch } : c);
    onChange({ ...config, conditions });
  }
  function add() {
    onChange({ ...config, conditions: [...config.conditions, { fieldId: '', op: '=', value: '' }] });
  }
  function remove(idx: number) {
    onChange({ ...config, conditions: config.conditions.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Match</span>
        <select
          aria-label="Join"
          value={config.join}
          onChange={(e) => onChange({ ...config, join: e.target.value as 'and' | 'or' })}
          className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="and">all of</option>
          <option value="or">any of</option>
        </select>
        <span className="text-slate-500">these conditions:</span>
      </div>

      <div className="space-y-1">
        {config.conditions.map((c, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <select
              aria-label={`Field ${i}`}
              value={c.fieldId}
              onChange={(e) => update(i, { fieldId: e.target.value })}
              className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              <option value="" disabled>Pick a field…</option>
              {eligibleDefs(defs).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
            <select
              aria-label={`Op ${i}`}
              value={c.op}
              onChange={(e) => update(i, { op: e.target.value as CompareOp })}
              className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            >
              {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
            </select>
            <input
              aria-label={`Value ${i}`}
              value={String(c.value)}
              onChange={(e) => {
                const raw = e.target.value;
                const n = Number(raw);
                update(i, { value: raw !== '' && !Number.isNaN(n) ? n : raw });
              }}
              className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <button onClick={() => remove(i)} aria-label={`Remove condition ${i}`}
              className="text-slate-400 hover:text-rose-500">×</button>
          </div>
        ))}
        <button
          type="button"
          onClick={add}
          className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          + add condition
        </button>
      </div>
    </div>
  );
}

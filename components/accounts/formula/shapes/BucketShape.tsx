'use client';

import type { FieldDefinition } from '@/lib/accountFields';
import type { BucketShape as Shape, CompareOp } from '@/lib/formula/simpleForm';

interface Props {
  config: Shape;
  defs: FieldDefinition[];
  onChange: (c: Shape) => void;
}

const OPS: CompareOp[] = ['>', '>=', '<', '<=', '=', '!='];
const metricDefs = (defs: FieldDefinition[]) => defs.filter((d) => d.type === 'metric' || (d.type === 'computed' && d.outputType === 'number'));

export default function BucketShape({ config, defs, onChange }: Props) {
  function updateTier(idx: number, patch: Partial<Shape['tiers'][number]>) {
    const tiers = config.tiers.map((t, i) => i === idx ? { ...t, ...patch } : t);
    onChange({ ...config, tiers });
  }
  function addTier() {
    onChange({ ...config, tiers: [...config.tiers, { threshold: 0, label: '' }] });
  }
  function removeTier(idx: number) {
    onChange({ ...config, tiers: config.tiers.filter((_, i) => i !== idx) });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-500">When</span>
        <select
          aria-label="Bucket field"
          value={config.fieldId}
          onChange={(e) => onChange({ ...config, fieldId: e.target.value })}
          className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          <option value="" disabled>Pick a field…</option>
          {metricDefs(defs).map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
        </select>
        <span className="text-slate-500">is</span>
        <select
          aria-label="Bucket op"
          value={config.op}
          onChange={(e) => onChange({ ...config, op: e.target.value as CompareOp })}
          className="rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        >
          {OPS.map((op) => <option key={op} value={op}>{op}</option>)}
        </select>
        <span className="text-slate-500">…</span>
      </div>

      <div className="space-y-1">
        {config.tiers.map((t, i) => (
          <div key={i} className="flex items-center gap-2 text-sm">
            <input
              type="number"
              aria-label={`Threshold ${i}`}
              value={t.threshold}
              onChange={(e) => updateTier(i, { threshold: Number(e.target.value) })}
              className="w-32 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <span className="text-slate-400">→</span>
            <input
              aria-label={`Result ${i}`}
              value={t.label}
              placeholder="Enterprise"
              onChange={(e) => updateTier(i, { label: e.target.value })}
              className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
            />
            <button onClick={() => removeTier(i)} aria-label={`Remove tier ${i}`}
              className="text-slate-400 hover:text-rose-500">×</button>
          </div>
        ))}
        <button
          type="button"
          onClick={addTier}
          className="rounded border border-dashed border-slate-300 px-2 py-1 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400"
        >
          + add tier
        </button>
      </div>

      <div className="flex items-center gap-2 text-sm">
        <span className="text-slate-500">Otherwise →</span>
        <input
          aria-label="Otherwise result"
          value={config.otherwise}
          placeholder="SMB"
          onChange={(e) => onChange({ ...config, otherwise: e.target.value })}
          className="flex-1 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
        />
      </div>
    </div>
  );
}

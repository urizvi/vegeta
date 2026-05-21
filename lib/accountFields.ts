import type { FormulaAst } from './formula/ast';
import type { SimpleFormConfig } from './formula/simpleForm';

export type FieldType = 'categorical' | 'metric' | 'text' | 'computed';
export type FieldEntity = 'account' | 'contact' | 'activity' | 'task';
export type ComputedOutput = 'number' | 'text' | 'boolean';

export interface FieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];           // categorical only
  isCurrency?: boolean;         // metric, or computed with outputType === 'number'
  entity: FieldEntity;
  aliases?: string[];
  // computed-only:
  outputType?: ComputedOutput;
  formula?: FormulaAst;
  formulaSource?: string;       // Advanced-mode user text (round-trip)
  formulaForm?: SimpleFormConfig; // Simple-mode form config (round-trip)
}

const OPTION_PALETTE = [
  '#94a3b8', '#60a5fa', '#f59e0b', '#22c55e', '#ef4444',
  '#a78bfa', '#fb923c', '#34d399', '#f472b6', '#38bdf8',
  '#facc15', '#4ade80',
];

export function optionColor(index: number): string {
  return OPTION_PALETTE[index % OPTION_PALETTE.length];
}

export function formatFieldValue(
  value: string | number | boolean | undefined,
  field: FieldDefinition,
): string {
  if (value === undefined || value === null || value === '') return '—';

  if (field.type === 'computed') {
    if (field.outputType === 'boolean') {
      if (typeof value !== 'boolean') return '—';
      return value ? '✓' : '✗';
    }
    if (field.outputType === 'text') return String(value);
    // number — fall through to metric formatting
  }

  if (field.type === 'metric' || (field.type === 'computed' && field.outputType === 'number')) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (field.isCurrency) {
      if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
      if (n >= 1_000)     return `$${(n / 1_000).toFixed(0)}K`;
      return `$${n.toLocaleString()}`;
    }
    return n.toLocaleString();
  }
  return String(value);
}

export function normalizeOption(raw: string, options: string[], fallback: string): string {
  const lower = raw.toLowerCase().trim();
  return options.find((o) => o.toLowerCase() === lower) ?? fallback;
}

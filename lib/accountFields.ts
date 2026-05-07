export type FieldType = 'categorical' | 'metric' | 'text';

export type FieldEntity = 'account' | 'contact' | 'activity' | 'task';

export interface FieldDefinition {
  id: string;
  label: string;
  type: FieldType;
  options?: string[];   // categorical only
  isCurrency?: boolean; // metric only
  entity: FieldEntity;
  /** Additive CSV header aliases (lowercased) that auto-map to this field. */
  aliases?: string[];
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
  value: string | number | undefined,
  field: FieldDefinition,
): string {
  if (value === undefined || value === null || value === '') return '—';
  if (field.type === 'metric') {
    const n = Number(value);
    if (n <= 0) return '—';
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

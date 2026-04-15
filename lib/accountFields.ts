export type AccountStage    = 'Prospect' | 'Lead' | 'Opportunity' | 'Customer' | 'Churned';
export type AccountSegment  = 'SMB' | 'Mid-Market' | 'Enterprise';
export type AccountTier     = 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Untiered';
export type AccountIndustry =
  | 'SaaS' | 'FinTech' | 'Healthcare' | 'E-commerce' | 'Manufacturing'
  | 'Education' | 'Media' | 'Government' | 'Other';
export type MapAccountMetric = 'count' | 'arr' | 'mrr' | 'headcount';

export const STAGE_OPTIONS:    readonly AccountStage[]    = ['Prospect', 'Lead', 'Opportunity', 'Customer', 'Churned'];
export const SEGMENT_OPTIONS:  readonly AccountSegment[]  = ['SMB', 'Mid-Market', 'Enterprise'];
export const TIER_OPTIONS:     readonly AccountTier[]     = ['Tier 1', 'Tier 2', 'Tier 3', 'Untiered'];
export const INDUSTRY_OPTIONS: readonly AccountIndustry[] = [
  'SaaS', 'FinTech', 'Healthcare', 'E-commerce', 'Manufacturing',
  'Education', 'Media', 'Government', 'Other',
];

export const MAP_METRIC_OPTIONS: readonly { id: MapAccountMetric; label: string }[] = [
  { id: 'count',     label: 'Count'     },
  { id: 'arr',       label: 'ARR'       },
  { id: 'mrr',       label: 'MRR'       },
  { id: 'headcount', label: 'Headcount' },
];

export const STAGE_COLORS: Record<AccountStage, string> = {
  Prospect:    '#94a3b8',
  Lead:        '#60a5fa',
  Opportunity: '#f59e0b',
  Customer:    '#22c55e',
  Churned:     '#ef4444',
};

/** Defaults applied whenever an account is created or imported without explicit values. */
export const ACCOUNT_DEFAULTS = {
  state:     undefined  as string | undefined,
  arr:       0,
  mrr:       0,
  headcount: 0,
  industry:  'Other'    as AccountIndustry,
  stage:     'Prospect' as AccountStage,
  segment:   'SMB'      as AccountSegment,
  tier:      'Untiered' as AccountTier,
  repId:     null       as string | null,
} as const;

/** Format a metric value for display (map bubbles, tooltips, table cells). */
export function formatMetric(metric: MapAccountMetric, value: number): string {
  if (value <= 0) return '—';
  if (metric === 'arr' || metric === 'mrr') {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (value >= 1_000)     return `$${(value / 1_000).toFixed(0)}K`;
    return `$${value.toLocaleString()}`;
  }
  return value.toLocaleString();
}

/** Normalize a raw string to the nearest categorical option, or return fallback. */
export function normalizeOption<T extends string>(
  raw: string,
  options: readonly T[],
  fallback: T,
): T {
  const lower = raw.toLowerCase().trim();
  return options.find((o) => o.toLowerCase() === lower) ?? fallback;
}

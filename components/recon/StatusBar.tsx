'use client';

import type { ReconSummary } from '@/lib/reconView';

interface Props {
  summary: ReconSummary;
}

// Horizontal stacked bar showing distribution of results by status.
// Inline SVG — the plan said "D3 for charts, no chart library"; d3 isn't
// needed for a single-bar layout and adding it would be ceremony.
export default function StatusBar({ summary }: Props) {
  const total = summary.total;
  if (total === 0) return null;

  const segments = [
    { key: 'matched', value: summary.matched, fill: 'var(--brand)', label: 'Matched' },
    { key: 'flagged', value: summary.flagged, fill: '#d97706', label: 'Flagged' },
    { key: 'missing', value: summary.missing, fill: '#94a3b8', label: 'Missing' },
    { key: 'orphan', value: summary.orphan, fill: '#e11d48', label: 'Orphan' },
  ].filter((s) => s.value > 0);

  const width = 600;
  const height = 28;
  let x = 0;
  const rects = segments.map((s) => {
    const w = (s.value / total) * width;
    const rect = { ...s, x, w };
    x += w;
    return rect;
  });

  return (
    <figure className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4">
      <figcaption className="mb-2 text-xs uppercase tracking-wide text-[color:var(--ink-muted)]">
        Distribution ({total} result{total === 1 ? '' : 's'})
      </figcaption>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Result distribution" className="w-full">
        {rects.map((r) => (
          <rect
            key={r.key}
            x={r.x}
            y={0}
            width={r.w}
            height={height}
            fill={r.fill}
          >
            <title>{`${r.label}: ${r.value} (${Math.round((r.value / total) * 100)}%)`}</title>
          </rect>
        ))}
      </svg>
      <ul className="mt-3 flex flex-wrap gap-4 text-xs text-[color:var(--ink-muted)]">
        {segments.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span
              className="inline-block h-3 w-3 rounded-sm"
              style={{ background: s.fill }}
              aria-hidden="true"
            />
            {s.label}: {s.value}
          </li>
        ))}
      </ul>
    </figure>
  );
}

'use client';

import type { ValidationIssue } from '@/ingestion/types';

interface Props {
  issues: ValidationIssue[];
  rowCount: number;
}

export default function ValidationSummary({ issues, rowCount }: Props) {
  if (issues.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-panel)] p-4 text-sm">
        <span className="font-medium text-emerald-700">Clean.</span>{' '}
        <span className="text-[color:var(--ink-muted)]">
          {rowCount} row{rowCount === 1 ? '' : 's'}, no validation issues.
        </span>
      </div>
    );
  }
  const grouped = new Map<string, ValidationIssue[]>();
  for (const issue of issues) {
    const arr = grouped.get(issue.columnKey) ?? [];
    arr.push(issue);
    grouped.set(issue.columnKey, arr);
  }
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="text-sm font-medium text-amber-900">
        {issues.length} issue{issues.length === 1 ? '' : 's'} across {rowCount} row{rowCount === 1 ? '' : 's'}
      </div>
      <ul className="mt-3 max-h-64 space-y-1 overflow-y-auto text-sm text-amber-900">
        {issues.slice(0, 50).map((issue, i) => (
          <li key={i} className="font-mono text-xs">
            row {issue.rowIndex + 2}: {issue.message}
          </li>
        ))}
        {issues.length > 50 && (
          <li className="text-xs italic text-amber-800">
            …and {issues.length - 50} more
          </li>
        )}
      </ul>
    </div>
  );
}

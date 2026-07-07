import type { Column, ParsedSheet } from './types';
import { inferColumnType } from './infer';

/**
 * Turn a ParsedSheet into initial Column definitions: one per header,
 * with an inferred type and a slugified stable key. Users edit these in
 * the mapping UI before dataset finalization.
 */
export function initialColumns(sheet: ParsedSheet): Column[] {
  const keys = new Set<string>();
  return sheet.headers.map((header, idx) => {
    const values = sheet.rows.map((r) => r[idx] ?? null);
    const key = uniqueKey(slugify(header) || `col_${idx + 1}`, keys);
    keys.add(key);
    return {
      key,
      sourceHeader: header,
      label: header,
      type: inferColumnType(values),
      required: false,
      discarded: false,
    };
  });
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

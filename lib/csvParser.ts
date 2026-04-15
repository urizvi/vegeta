/**
 * Minimal CSV/TSV parser — no external dependency.
 * Handles quoted fields, comma and tab delimiters.
 */
export function parseCSV(text: string): Record<string, string>[] {
  const normalised = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (!normalised) return [];

  // Auto-detect delimiter: if first line has more tabs than commas, use tab
  const firstLine = normalised.split('\n')[0];
  const delimiter = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? '\t' : ',';

  const rows = splitLines(normalised);
  if (rows.length < 2) return [];

  const headers = splitRow(rows[0], delimiter).map((h) => h.toLowerCase().trim());

  return rows.slice(1).map((row) => {
    const values = splitRow(row, delimiter);
    const record: Record<string, string> = {};
    headers.forEach((h, i) => {
      record[h] = (values[i] ?? '').trim();
    });
    return record;
  }).filter((r) => Object.values(r).some((v) => v !== ''));
}

function splitLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') { inQuote = !inQuote; current += ch; }
    else if (ch === '\n' && !inQuote) { lines.push(current); current = ''; }
    else { current += ch; }
  }
  if (current) lines.push(current);
  return lines;
}

function splitRow(row: string, delimiter: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuote = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (ch === '"') {
      if (inQuote && row[i + 1] === '"') { current += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === delimiter && !inQuote) {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

/** Find which key in a row matches any of the given aliases. Returns the matched key or undefined. */
export function detectColumn(headers: string[], aliases: string[]): string | undefined {
  return headers.find((h) => aliases.includes(h.toLowerCase().trim()));
}

const NAME_ALIASES    = ['name', 'account', 'company', 'account name', 'company name', 'account_name', 'company_name'];
const COUNTRY_ALIASES = ['country', 'country code', 'country_code', 'iso2', 'iso', 'country_iso'];
const STATE_ALIASES   = ['state', 'province', 'state/province', 'state_province', 'territory', 'region'];
const ARR_ALIASES     = ['arr', 'revenue', 'amount', 'annual revenue', 'annual_revenue', 'mrr', 'contract value', 'acv', 'deal value'];

export interface DetectedColumns {
  name?: string;
  country?: string;
  state?: string;
  arr?: string;
}

export function detectColumns(headers: string[]): DetectedColumns {
  return {
    name:    detectColumn(headers, NAME_ALIASES),
    country: detectColumn(headers, COUNTRY_ALIASES),
    state:   detectColumn(headers, STATE_ALIASES),
    arr:     detectColumn(headers, ARR_ALIASES),
  };
}

export function parseNumber(v: string): number {
  // Strip currency symbols, commas, spaces
  const cleaned = v.replace(/[$€£¥,\s]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n;
}

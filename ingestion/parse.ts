import * as XLSX from 'xlsx';
import type { ParsedSheet } from './types';

export class ParseError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'ParseError';
  }
}

/**
 * Read a File (CSV/XLSX/XLS) into a ParsedSheet. Picks the first non-empty
 * sheet if the workbook has multiple; other sheet names are returned in
 * `otherSheets` for informational surfacing.
 *
 * Uses SheetJS with `cellDates: true` so Excel serial dates arrive as JS
 * Date objects. Empty cells become null (not undefined) for consistency.
 */
export async function parseFile(file: File): Promise<ParsedSheet> {
  if (file.size === 0) throw new ParseError('File is empty.');
  // File.arrayBuffer is spec-standard but missing in some test envs (jsdom).
  // Response(blob).arrayBuffer works everywhere Blob does.
  const buf = typeof file.arrayBuffer === 'function'
    ? await file.arrayBuffer()
    : await new Response(file).arrayBuffer();
  return parseArrayBuffer(buf, file.name);
}

export function parseArrayBuffer(buf: ArrayBuffer, fileName = 'file'): ParsedSheet {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buf, { type: 'array', cellDates: true });
  } catch (err) {
    throw new ParseError(`Could not read "${fileName}". Is it a valid CSV or XLSX?`, err);
  }

  if (workbook.SheetNames.length === 0) {
    throw new ParseError(`"${fileName}" has no sheets.`);
  }

  // Pick first non-empty sheet; track the rest as informational.
  let chosenName: string | undefined;
  let chosenSheet: XLSX.WorkSheet | undefined;
  const otherSheets: string[] = [];
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet) continue;
    if (!chosenSheet && !isEmptySheet(sheet)) {
      chosenName = name;
      chosenSheet = sheet;
    } else {
      otherSheets.push(name);
    }
  }
  if (!chosenSheet) throw new ParseError(`"${fileName}" contains only empty sheets.`);

  const raw = XLSX.utils.sheet_to_json<unknown[]>(chosenSheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false,
  });

  if (raw.length === 0) throw new ParseError(`Sheet "${chosenName ?? fileName}" has no rows.`);

  const [headerRow, ...bodyRaw] = raw;
  const headers = (headerRow ?? []).map((h, i) => normalizeHeader(h, i));
  const rows = bodyRaw.map((r) => normalizeRow(r, headers.length));

  return {
    headers,
    rows,
    sheetName: chosenName,
    otherSheets,
  };
}

function isEmptySheet(sheet: XLSX.WorkSheet): boolean {
  const ref = sheet['!ref'];
  if (!ref) return true;
  const range = XLSX.utils.decode_range(ref);
  return range.e.r < range.s.r || range.e.c < range.s.c;
}

function normalizeHeader(raw: unknown, index: number): string {
  const s = raw == null ? '' : String(raw).trim();
  return s || `Column ${index + 1}`;
}

type Cell = string | number | boolean | Date | null;

function normalizeRow(row: unknown[], width: number): Cell[] {
  const out: Cell[] = new Array(width);
  for (let i = 0; i < width; i++) {
    const v = row[i];
    if (v == null || v === '') {
      out[i] = null;
    } else if (v instanceof Date) {
      out[i] = v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[i] = v;
    } else {
      out[i] = String(v);
    }
  }
  return out;
}

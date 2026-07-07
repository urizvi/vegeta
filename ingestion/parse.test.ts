import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseArrayBuffer, ParseError } from './parse';

function csvBuffer(body: string): ArrayBuffer {
  const bytes = new TextEncoder().encode(body);
  // Return a fresh ArrayBuffer (not the shared TextEncoder view buffer).
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function xlsxBuffer(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), sheetName);
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
}

describe('parseArrayBuffer', () => {
  it('parses a CSV into headers + rows', () => {
    const parsed = parseArrayBuffer(csvBuffer('Name,Amount\nAcme,1000\nBeta,2500\n'), 'a.csv');
    expect(parsed.headers).toEqual(['Name', 'Amount']);
    expect(parsed.rows.length).toBe(2);
    expect(parsed.rows[0]![0]).toBe('Acme');
    expect(parsed.rows[0]![1]).toBe(1000);
  });

  it('handles quoted commas + empty cells (empty becomes null)', () => {
    const parsed = parseArrayBuffer(csvBuffer('Name,Note\n"Acme, Inc.",\nBeta,ok\n'), 'q.csv');
    expect(parsed.rows[0]![0]).toBe('Acme, Inc.');
    expect(parsed.rows[0]![1]).toBeNull();
    expect(parsed.rows[1]![1]).toBe('ok');
  });

  it('normalizes empty/blank headers to "Column N"', () => {
    const parsed = parseArrayBuffer(csvBuffer('Name,,Note\nA,B,C\n'), 'h.csv');
    expect(parsed.headers).toEqual(['Name', 'Column 2', 'Note']);
  });

  it('picks the first non-empty sheet from a multi-sheet workbook', () => {
    const parsed = parseArrayBuffer(
      xlsxBuffer({
        Empty: [],
        Data: [['H1'], ['v1']],
        Notes: [['NoteHeader'], ['note-body']],
      }),
      'multi.xlsx',
    );
    expect(parsed.sheetName).toBe('Data');
    expect(parsed.otherSheets).toContain('Notes');
  });

  it('throws ParseError when every sheet is empty', () => {
    expect(() => parseArrayBuffer(xlsxBuffer({ S1: [], S2: [] }), 'empty.xlsx'))
      .toThrow(ParseError);
  });
});

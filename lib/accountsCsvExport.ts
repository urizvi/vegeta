import type { Account } from '@/types/account';
import type { FieldDefinition } from '@/lib/accountFields';

export function buildAccountsCsv(accounts: Account[], defs: FieldDefinition[]): string {
  const cols: { id: string; header: string }[] = [
    { id: 'name', header: 'Name' },
    ...defs.map((d) => ({
      id: d.id,
      header: d.type === 'computed' ? `ƒ ${d.label}` : d.label,
    })),
  ];
  const escape = (v: unknown): string => {
    if (v === undefined || v === null) return '';
    const s = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const headerRow = cols.map((c) => escape(c.header)).join(',');
  const dataRows = accounts.map((a) =>
    cols.map((c) => escape(c.id === 'name' ? a.name : a.fields[c.id])).join(','),
  );
  return [headerRow, ...dataRows].join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

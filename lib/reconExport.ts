// CSV / XLSX export for reconciliation results. Flattens one row per
// ReconciliationResult so the file opens cleanly in Excel — nested claims
// become a semicolon-joined ID list; nested flags become a single message
// string. Users who want per-claim breakdown drill down in the app.

import * as XLSX from 'xlsx';
import type {
  Claim,
  POSRecord,
  ReconciliationResult,
} from '@/domain/pos-recon/entities';

export interface ExportRow {
  status: ReconciliationResult['status'];
  distributor: string;
  period: string;
  partNumber: string;
  endCustomer: string;
  shipDate: string;
  posQuantity: number | '';
  posResalePrice: number | '';
  posExtendedAmount: number | '';
  claimIds: string;           // semicolon-joined
  claimTypes: string;         // semicolon-joined; s&d, pp
  claimQuantity: number | '';
  calculatedCredit: number | '';
  flagKinds: string;          // semicolon-joined
  flagMessages: string;       // ' | '-joined for readability
  totalFlagImpact: number | '';
  datasetId: string;
  sourceRowIndex: number | '';
}

export function reconResultsToRows(
  results: readonly ReconciliationResult[],
  posById: ReadonlyMap<string, POSRecord>,
  claimsById: ReadonlyMap<string, Claim>,
): ExportRow[] {
  return results.map((r) => {
    const pos = r.posRecordId ? posById.get(r.posRecordId) : undefined;
    const claims = r.claimIds.map((id) => claimsById.get(id)).filter((c): c is Claim => !!c);
    const totalClaimQty = claims.reduce((s, c) => s + c.quantity, 0);
    const flagImpact = r.flags.reduce((s, f) => s + (typeof f.amountImpact === 'number' ? Math.abs(f.amountImpact) : 0), 0);
    // For orphan_claim, prefer the claim's own fields.
    const anchorClaim = !pos ? claims[0] : undefined;

    return {
      status: r.status,
      distributor: pos?.distributor ?? anchorClaim?.distributor ?? '',
      period: pos?.period ?? anchorClaim?.period ?? '',
      partNumber: pos?.partNumber ?? anchorClaim?.partNumber ?? '',
      endCustomer: pos?.endCustomer ?? anchorClaim?.endCustomer ?? '',
      shipDate: pos?.shipDate ?? '',
      posQuantity: pos?.quantity ?? '',
      posResalePrice: pos?.resalePrice ?? '',
      posExtendedAmount: pos?.extendedAmount ?? '',
      claimIds: r.claimIds.join(';'),
      claimTypes: claims.map((c) => c.type === 'ship_and_debit' ? 's&d' : 'pp').join(';'),
      claimQuantity: claims.length > 0 ? totalClaimQty : '',
      calculatedCredit: r.calculatedCredit ?? '',
      flagKinds: r.flags.map((f) => f.kind).join(';'),
      flagMessages: r.flags.map((f) => f.message).join(' | '),
      totalFlagImpact: flagImpact || '',
      datasetId: pos?.datasetId ?? anchorClaim?.datasetId ?? '',
      sourceRowIndex: pos?.sourceRowIndex ?? anchorClaim?.sourceRowIndex ?? '',
    };
  });
}

export function rowsToWorkbook(rows: readonly ExportRow[]): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([...rows]);
  XLSX.utils.book_append_sheet(wb, ws, 'Reconciliation');
  return wb;
}

/** Browser-only. Triggers a download of the given workbook in the requested format. */
export function downloadWorkbook(wb: XLSX.WorkBook, filename: string, format: 'csv' | 'xlsx'): void {
  const bookType = format === 'csv' ? 'csv' : 'xlsx';
  const data = XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer;
  const mime = format === 'csv'
    ? 'text/csv;charset=utf-8'
    : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const blob = new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

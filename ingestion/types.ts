// Canonical ingestion types for WaferIQ P1.
//
// Deliberately loose: the wedge (POS-recon vs design-win funnel) is not yet
// chosen, so there is no target entity schema here. Datasets are typed
// columns + dynamic rows. P2 introduces wedge-specific canonical schemas
// that datasets can be mapped INTO — those live in `domain/`.

export type ColumnType = 'text' | 'number' | 'date' | 'boolean';

export interface Column {
  /** Stable identifier used as the row-object key. Renameable by the user. */
  key: string;
  /** Original header from the source file. Preserved for provenance. */
  sourceHeader: string;
  /** Human-facing label; defaults to sourceHeader, editable in mapping UI. */
  label: string;
  /** Inferred at import time; user-overridable in the mapping step. */
  type: ColumnType;
  /** If true, empty cells in this column will be flagged in validation. */
  required: boolean;
  /** If true, the column is dropped from the final Dataset.rows. */
  discarded: boolean;
}

/** A single row after coercion to the declared column types. */
export type Row = Record<string, string | number | boolean | Date | null>;

export interface ImportSource {
  /** Original filename, for display + provenance. */
  fileName: string;
  /** Byte size of the source file. */
  fileSize: number;
  /** Sheet name for XLSX (undefined for CSV). */
  sheetName?: string;
  /** ISO timestamp of import. */
  importedAt: string;
}

export interface Dataset {
  id: string;
  name: string;
  source: ImportSource;
  columns: Column[];
  rows: Row[];
  /** Issues found during the final validation pass. */
  issues: ValidationIssue[];
}

export type ValidationIssueKind =
  | 'parse_error'
  | 'type_mismatch'
  | 'empty_required';

export interface ValidationIssue {
  rowIndex: number;
  columnKey: string;
  kind: ValidationIssueKind;
  /** Plain-English, user-facing. e.g. "Expected a number, got 'N/A'". */
  message: string;
  /** The raw cell value (post-parse, pre-coerce) for surface + drill-down. */
  rawValue: unknown;
}

/** Output of the raw parse step, before column mapping + type inference. */
export interface ParsedSheet {
  headers: string[];
  /** Raw cell values from SheetJS; may be string | number | boolean | Date | null. */
  rows: (string | number | boolean | Date | null)[][];
  sheetName?: string;
  /** Other sheet names skipped by the parser, if any. Purely informational. */
  otherSheets: string[];
}

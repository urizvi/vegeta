// Fetch + parse + import the built-in sample dataset trio. Extracted so
// both /ingest and / (home) can drive it.
//
// The samples live in public/sample/ and get parsed through the normal
// P1 ingestion path so their behavior matches a real user upload.

import { parseArrayBuffer } from '@/ingestion/parse';
import { initialColumns } from '@/ingestion/columns';
import { buildDataset } from '@/ingestion/validate';
import type { Dataset } from '@/ingestion/types';

interface SampleFile {
  path: string;
  name: string;
}

export const SAMPLE_FILES: SampleFile[] = [
  { path: '/sample/pos.csv', name: 'Sample POS report (June 2026)' },
  { path: '/sample/sd_claims.csv', name: 'Sample S&D claims (June 2026)' },
  { path: '/sample/pp_claims.csv', name: 'Sample PP claims (June 2026)' },
];

interface Deps {
  commitDataset: (d: Dataset) => void;
  recordDatasetImport: () => void;
}

export async function loadSampleData({ commitDataset, recordDatasetImport }: Deps): Promise<void> {
  for (const f of SAMPLE_FILES) {
    const res = await fetch(f.path);
    if (!res.ok) throw new Error(`Failed to fetch ${f.path} (${res.status}).`);
    const buf = await res.arrayBuffer();
    const sheet = parseArrayBuffer(buf, f.path);
    const columns = initialColumns(sheet);
    const built = buildDataset(sheet, columns);
    const dataset: Dataset = {
      id: `ds_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: f.name,
      source: {
        fileName: f.path.split('/').pop() ?? f.path,
        fileSize: buf.byteLength,
        importedAt: new Date().toISOString(),
      },
      columns,
      rows: built.rows,
      issues: built.issues,
    };
    commitDataset(dataset);
    recordDatasetImport();
  }
}

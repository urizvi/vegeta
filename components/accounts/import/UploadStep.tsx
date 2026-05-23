'use client';

import { useRef, useState } from 'react';
import type { FieldDefinition } from '@/lib/accountFields';
import { useOwnerNoun } from '@/hooks/useOwnerNoun';

interface Props {
  fieldDefs: FieldDefinition[];
  onFile: (file: File) => void;
}

export default function UploadStep({ fieldDefs, onFile }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const ownerNoun = useOwnerNoun();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload a file — click to browse or drop a file here"
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
      onClick={() => fileRef.current?.click()}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed py-10 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
        dragging ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/20' : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
      }`}
    >
      <svg className="h-8 w-8 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
      </svg>
      <p className="text-sm text-slate-500">
        Drop a file here, or <span className="text-indigo-500">browse</span>
      </p>
      <p className="text-xs text-slate-400">CSV, TSV, Excel (.xlsx, .xls)</p>
      <p className="text-xs text-slate-400">
        Required: Name (unique) · Optional: Country, State, {ownerNoun}
        {fieldDefs.length > 0 && ` · Fields: ${fieldDefs.map((f) => f.label).join(', ')}`}
      </p>
      <a
        href="/sample-accounts.csv"
        download
        onClick={(e) => e.stopPropagation()}
        className="text-xs text-indigo-500 hover:underline"
      >
        Download sample CSV
      </a>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xls,.ods"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); }}
      />
    </div>
  );
}

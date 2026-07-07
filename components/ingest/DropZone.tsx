'use client';

import { useCallback, useRef, useState } from 'react';

interface DropZoneProps {
  onFile: (file: File) => void;
  disabled?: boolean;
}

export default function DropZone({ onFile, disabled }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFiles = useCallback((files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  }, [onFile]);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFiles(e.dataTransfer.files);
  }, [disabled, handleFiles]);

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => { if (!disabled) inputRef.current?.click(); }}
      role="button"
      tabIndex={0}
      aria-disabled={disabled}
      className={`
        rounded-lg border-2 border-dashed p-10 text-center cursor-pointer
        transition-colors
        ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        ${dragOver ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--hairline-strong)] bg-[var(--surface-panel)]'}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
        disabled={disabled}
      />
      <div className="text-[color:var(--ink-strong)] font-medium">
        Drop a CSV or XLSX to start
      </div>
      <div className="mt-1 text-sm text-[color:var(--ink-muted)]">
        or click to choose a file
      </div>
    </div>
  );
}

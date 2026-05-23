'use client';

import { useEffect, useRef, useState } from 'react';

const SWATCHES = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#10b981', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
];

interface Props {
  value: string | null;
  onChange: (next: string | null) => void;
  onClose: () => void;
  anchorRect: DOMRect;
}

export default function ColorPickerPopover({ value, onChange, onClose, anchorRect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [hex, setHex] = useState(value ?? '');

  useEffect(() => {
    function handleDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', handleDown);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleDown);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  function commitHex() {
    const trimmed = hex.trim();
    if (/^#[0-9a-f]{6}$/i.test(trimmed)) {
      onChange(trimmed.toLowerCase());
      onClose();
    }
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 w-48 rounded-md border border-hairline bg-panel p-2 shadow-lg"
      style={{
        top: anchorRect.bottom + 4,
        left: Math.min(anchorRect.left, window.innerWidth - 200),
      }}
      role="dialog"
      aria-label="Pick color"
    >
      <div className="grid grid-cols-5 gap-1.5">
        {SWATCHES.map((c) => (
          <button
            key={c}
            onClick={() => { onChange(c); onClose(); }}
            style={{ background: c }}
            className={`h-6 w-6 rounded ${value === c ? 'ring-2 ring-offset-1 ring-brand' : 'ring-1 ring-black/10'}`}
            aria-label={`Use ${c}`}
          />
        ))}
      </div>
      <button
        onClick={() => { onChange(null); onClose(); }}
        className="mt-2 w-full rounded bg-sunken py-1 text-[11px] font-medium text-ink-muted hover:bg-slate-200 dark:hover:bg-slate-700"
      >
        Inherit from parent
      </button>
      <div className="mt-2 flex gap-1">
        <input
          value={hex}
          onChange={(e) => setHex(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') commitHex(); }}
          placeholder="#3b82f6"
          className="flex-1 rounded border border-hairline bg-canvas px-1.5 py-0.5 text-[11px] font-mono outline-none focus:ring-1 focus:ring-brand/40"
          maxLength={7}
        />
        <button
          onClick={commitHex}
          className="rounded bg-brand px-2 py-0.5 text-[11px] font-medium text-white hover:bg-brand-hover"
        >
          Set
        </button>
      </div>
    </div>
  );
}

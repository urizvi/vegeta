'use client';

import { forwardRef } from 'react';
import { useActions } from '@/hooks/useTerritoryStore';
import {
  useSelectedEntityCodes,
  useSelectionCount,
} from '@/store/slices/selectionSelectors';
import { getRegionNameByIso } from '@/store/slices/mapUiSelectors';
import MapChip from './MapChip';

interface Props {
  open: boolean;
  onToggle: () => void;
}

const SelectionChip = forwardRef<HTMLButtonElement, Props>(function SelectionChip(
  { open, onToggle }, ref,
) {
  const count = useSelectionCount();
  if (count === 0) return null;

  return (
    <MapChip
      ref={ref}
      label={`${count} selected`}
      active={open}
      onClick={onToggle}
      glance={
        <>
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-brand"
          />
          <span className="font-mono tabular-nums">{count}</span>
          <span className="text-ink-muted">selected</span>
        </>
      }
    />
  );
});

export default SelectionChip;

export function SelectionChipPopover() {
  const codes = useSelectedEntityCodes();
  const { toggleSelection, clearSelection } = useActions();

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Selected regions
        </span>
        <button
          type="button"
          onClick={clearSelection}
          className="text-[11px] text-brand hover:underline"
        >
          Clear
        </button>
      </div>
      <ul className="max-h-[280px] overflow-y-auto flex flex-col gap-0.5">
        {codes.map((code) => (
          <SelectionRow
            key={code}
            code={code}
            onRemove={() => toggleSelection(code)}
          />
        ))}
      </ul>
    </div>
  );
}

function SelectionRow({ code, onRemove }: { code: string; onRemove: () => void }) {
  const name = getRegionNameByIso(code);
  return (
    <li className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-canvas">
      <span className="flex-1 truncate text-[12px]">
        {name ? (
          <>
            <span className="text-ink">{name}</span>
            <span className="ml-1 font-mono text-[10px] text-ink-muted">{code}</span>
          </>
        ) : (
          <span className="font-mono text-[12px] text-ink-body">{code}</span>
        )}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${code} from selection`}
        className="rounded p-0.5 text-ink-faint hover:bg-sunken hover:text-ink"
      >
        <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
          <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
        </svg>
      </button>
    </li>
  );
}

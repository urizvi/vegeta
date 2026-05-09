'use client';

interface Props {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}

export default function SidebarSearchInput({ value, onChange, placeholder = 'Search…' }: Props) {
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded border border-hairline bg-canvas px-2 py-1 pr-6 text-[12px] outline-none focus:ring-1 focus:ring-brand/40"
        aria-label={placeholder}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-1 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded text-ink-faint hover:bg-slate-200 hover:text-ink-body dark:hover:bg-slate-700"
          aria-label="Clear search"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
          </svg>
        </button>
      )}
    </div>
  );
}

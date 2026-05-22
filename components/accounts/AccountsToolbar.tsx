'use client';

import Link from 'next/link';
import { useCategoricalFields, useFieldDefs } from '@/hooks/useTerritoryStore';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import { useEntityNoun } from '@/hooks/useEntityNoun';
import { useNavModules } from '@/hooks/useNavModules';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from '@/types/account';
import { buildAccountsCsv, downloadCsv } from '@/lib/accountsCsvExport';

type ViewMode = 'table' | 'kanban';

interface Props {
  search:          string;
  filters:         Record<string, string>;
  totalCount:      number;
  view:            ViewMode;
  accounts:        Account[];
  onView:          (v: ViewMode) => void;
  onSearch:        (v: string) => void;
  onFilter:        (patch: Record<string, string>) => void;
  onClearFilters:  () => void;
  onAdd:           () => void;
  onImport:        () => void;
  onManageFields:  () => void;
  onManageStages:  () => void;
}

function deriveDistinctValues(def: FieldDefinition, accounts: Account[]): string[] {
  if (def.type === 'categorical') return def.options ?? [];
  if (def.type === 'computed' && def.outputType === 'text') {
    const seen = new Set<string>();
    for (const a of accounts) {
      const v = a.fields[def.id];
      if (typeof v === 'string' && v !== '') seen.add(v);
    }
    return [...seen].sort();
  }
  return [];
}

const ghostBtn =
  'inline-flex items-center gap-1.5 rounded-md border border-hairline bg-panel/60 px-2.5 py-1.5 text-[11px] font-medium text-ink-body transition-all hover:border-hairline-strong hover:bg-panel hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30';

const primaryBtn =
  'inline-flex items-center gap-1.5 rounded-md bg-brand px-3 py-1.5 text-[11px] font-semibold tracking-tight text-white shadow-brand transition-all hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:ring-offset-1 focus-visible:ring-offset-canvas';

const navLink =
  'rounded-[7px] px-2.5 py-1 text-[11px] font-medium tracking-tight text-ink-muted transition-colors hover:text-ink';
const navActive =
  'rounded-[7px] bg-panel px-2.5 py-1 text-[11px] font-semibold tracking-tight text-ink shadow-xs';

export default function AccountsToolbar({
  search, filters, totalCount, view, accounts, onView, onSearch, onFilter, onClearFilters,
  onAdd, onImport, onManageFields, onManageStages,
}: Props) {
  const categoricalFields = useCategoricalFields();
  const allFieldDefs = useFieldDefs();
  const entitySingular = useEntityNoun('singular');
  const entityPlural = useEntityNoun('plural');
  const navModules = useNavModules();
  const activeCount = Object.values(filters).filter(Boolean).length;

  // Computed text fields that have at least one distinct value (derived from materialized data)
  const computedTextFields = allFieldDefs.filter(
    (def) => def.type === 'computed' && def.outputType === 'text',
  );

  // Computed boolean fields — always show tri-state All / True / False pill
  const computedBooleanFields = allFieldDefs.filter(
    (def) => def.type === 'computed' && def.outputType === 'boolean',
  );

  return (
    <header className="relative flex flex-col border-b border-hairline bg-canvas/80 backdrop-blur-md">
      {/* Top row: brand · workspace · nav · primary actions */}
      <div className="flex items-center gap-3 px-5 py-3">
        <Link href="/territory" className="group inline-flex items-center gap-2">
          <span
            aria-hidden="true"
            className="grid h-6 w-6 place-items-center rounded-[7px] bg-gradient-to-br from-brand to-brand-ink text-white shadow-brand"
          >
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor">
              <path d="M3 12.5V4.2c0-.4.2-.7.6-.9l4-2.1c.3-.1.5-.1.7 0l4 2.1c.4.2.6.5.6.9v8.3l-2-1V5L8 3.4 5 5v8.5l-2-1z" />
            </svg>
          </span>
          <span className="display text-[15px] font-semibold tracking-tight text-ink transition-colors group-hover:text-brand">
            Vegeta
          </span>
          <span className="hidden h-3.5 w-px bg-hairline-strong sm:block" aria-hidden="true" />
          <span className="hidden text-[11px] font-medium uppercase tracking-[0.14em] text-ink-faint sm:block">
            Sales Deployment
          </span>
        </Link>

        <WorkspaceSwitcher />

        <nav className="ml-1 flex items-center gap-0.5 rounded-[10px] border border-hairline bg-sunken/70 p-0.5">
          {navModules.map((m) => (
            <Link key={m.key} href={m.navHref} className={navLink}>{m.navLabel}</Link>
          ))}
          <span className={navActive}>{entityPlural}</span>
          {navModules.some((m) => m.key === 'territory') && (
            <Link href="/teams" className={navLink}>Teams</Link>
          )}
        </nav>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 rounded-[10px] border border-hairline bg-sunken/70 p-0.5">
          {(['table', 'kanban'] as ViewMode[]).map((v) => (
            <button
              key={v}
              onClick={() => onView(v)}
              className={view === v ? navActive : navLink}
            >
              {v === 'table' ? 'Table' : 'Board'}
            </button>
          ))}
        </div>

        <button onClick={onManageStages} className={ghostBtn} title="Manage pipeline stages">Stages</button>
        <button onClick={onManageFields} className={ghostBtn} title="Manage custom fields">Fields</button>
        <button onClick={onImport}       className={ghostBtn}>Import</button>
        <button
          onClick={() => downloadCsv('accounts.csv', buildAccountsCsv(accounts, allFieldDefs))}
          className={ghostBtn}
        >
          Export CSV
        </button>

        <button onClick={onAdd} className={primaryBtn}>
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 1.5a.75.75 0 01.75.75V7.25h5a.75.75 0 010 1.5h-5v5a.75.75 0 01-1.5 0v-5h-5a.75.75 0 010-1.5h5V2.25A.75.75 0 018 1.5z" />
          </svg>
          New {entitySingular.toLowerCase()}
        </button>
      </div>

      <div className="flex items-center gap-2 border-t border-hairline px-5 py-2.5">
        <div className="relative">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04a.749.749 0 11-1.06 1.06l-3.04-3.04zm-5.44-1.19a4.5 4.5 0 100-9 4.5 4.5 0 000 9z" />
          </svg>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={`Search ${entityPlural.toLowerCase()}…`}
            className="w-64 rounded-md border border-hairline bg-panel/60 py-1.5 pl-8 pr-3 text-xs text-ink-body outline-none transition-colors placeholder:text-ink-faint hover:border-hairline-strong focus:border-brand/60 focus:bg-panel focus:ring-2 focus:ring-brand/20"
          />
        </div>

        {(categoricalFields.length > 0 || computedTextFields.length > 0 || computedBooleanFields.length > 0) && (
          <span className="h-4 w-px bg-hairline" aria-hidden="true" />
        )}

        {categoricalFields.map((def) => (
          <select
            key={def.id}
            value={filters[def.id] ?? ''}
            onChange={(e) => onFilter({ [def.id]: e.target.value })}
            className="appearance-none rounded-md border border-hairline bg-panel/60 py-1.5 pl-2.5 pr-7 text-[11px] font-medium text-ink-body outline-none transition-colors hover:border-hairline-strong hover:bg-panel focus:border-brand/60 focus:ring-2 focus:ring-brand/20 [background-image:url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2210%22%20height=%2210%22%20viewBox=%220%200%2010%2010%22><path%20d=%22M2%204l3%203%203-3%22%20stroke=%22%2397a0b3%22%20stroke-width=%221.4%22%20fill=%22none%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/></svg>')] [background-position:right_0.5rem_center] [background-repeat:no-repeat] [background-size:10px_10px]"
          >
            <option value="">All {def.label}s</option>
            {deriveDistinctValues(def, accounts).map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ))}

        {computedTextFields.map((def) => {
          const opts = deriveDistinctValues(def, accounts);
          if (opts.length === 0) return null;
          return (
            <select
              key={def.id}
              value={filters[def.id] ?? ''}
              onChange={(e) => onFilter({ [def.id]: e.target.value })}
              className="appearance-none rounded-md border border-hairline bg-panel/60 py-1.5 pl-2.5 pr-7 text-[11px] font-medium text-ink-body outline-none transition-colors hover:border-hairline-strong hover:bg-panel focus:border-brand/60 focus:ring-2 focus:ring-brand/20 [background-image:url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2210%22%20height=%2210%22%20viewBox=%220%200%2010%2010%22><path%20d=%22M2%204l3%203%203-3%22%20stroke=%22%2397a0b3%22%20stroke-width=%221.4%22%20fill=%22none%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/></svg>')] [background-position:right_0.5rem_center] [background-repeat:no-repeat] [background-size:10px_10px]"
            >
              <option value="">All {def.label}s</option>
              {opts.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          );
        })}

        {computedBooleanFields.map((def) => (
          <select
            key={def.id}
            value={filters[def.id] ?? ''}
            onChange={(e) => onFilter({ [def.id]: e.target.value })}
            className="appearance-none rounded-md border border-hairline bg-panel/60 py-1.5 pl-2.5 pr-7 text-[11px] font-medium text-ink-body outline-none transition-colors hover:border-hairline-strong hover:bg-panel focus:border-brand/60 focus:ring-2 focus:ring-brand/20 [background-image:url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2210%22%20height=%2210%22%20viewBox=%220%200%2010%2010%22><path%20d=%22M2%204l3%203%203-3%22%20stroke=%22%2397a0b3%22%20stroke-width=%221.4%22%20fill=%22none%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/></svg>')] [background-position:right_0.5rem_center] [background-repeat:no-repeat] [background-size:10px_10px]"
          >
            <option value="">All {def.label}</option>
            <option value="true">True</option>
            <option value="false">False</option>
          </select>
        ))}

        {activeCount > 0 && (
          <button
            onClick={onClearFilters}
            className="text-[11px] font-medium text-ink-muted transition-colors hover:text-ink"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
          <span className="font-mono font-semibold tabular-nums text-ink">{totalCount}</span>
          <span>{totalCount === 1 ? entitySingular.toLowerCase() : entityPlural.toLowerCase()}</span>
        </span>
      </div>
    </header>
  );
}

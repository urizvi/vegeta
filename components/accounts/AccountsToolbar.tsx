'use client';

import Link from 'next/link';
import { STAGE_OPTIONS, SEGMENT_OPTIONS, TIER_OPTIONS, INDUSTRY_OPTIONS } from '@/lib/accountFields';
import type { AccountStage, AccountSegment, AccountTier, AccountIndustry } from '@/lib/accountFields';

export interface AccountFilters {
  stage?:    AccountStage;
  segment?:  AccountSegment;
  industry?: AccountIndustry;
  tier?:     AccountTier;
}

interface Props {
  search:      string;
  filters:     AccountFilters;
  totalCount:  number;
  onSearch:    (v: string) => void;
  onFilter:    (patch: Partial<AccountFilters>) => void;
  onAdd:       () => void;
  onImport:    () => void;
}

export default function AccountsToolbar({
  search, filters, totalCount, onSearch, onFilter, onAdd, onImport,
}: Props) {
  const selectCls = 'rounded-lg border border-zinc-200 bg-white py-1.5 pl-2.5 pr-6 text-xs text-zinc-600 outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300';
  const activeCount = Object.values(filters).filter(Boolean).length;

  return (
    <header className="flex flex-col gap-0 border-b border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
      <div className="flex items-center gap-3 px-4 py-2.5">
        {/* Logo + nav */}
        <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">Sales Deployment</span>
        <div className="flex items-center rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
          <Link
            href="/territory"
            className="rounded-md px-2.5 py-1 font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
          >
            Territory
          </Link>
          <span className="rounded-md bg-zinc-900 px-2.5 py-1 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
            Accounts
          </span>
        </div>

        <div className="flex-1" />

        {/* Actions */}
        <button
          onClick={onImport}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a.75.75 0 01.53 1.28L5.56 4.25h4.69A5.5 5.5 0 1110.06 15H8a.75.75 0 010-1.5h2.06a4 4 0 10-.09-7.75H5.56l2.97 2.97a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06L7.47.47A.75.75 0 018 0z" />
          </svg>
          Import CSV
        </button>
        <button
          onClick={onAdd}
          className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 0a.75.75 0 01.75.75v6.5h6.5a.75.75 0 010 1.5h-6.5v6.5a.75.75 0 01-1.5 0v-6.5H.75a.75.75 0 010-1.5h6.5V.75A.75.75 0 018 0z" />
          </svg>
          Add Account
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-2 border-t border-zinc-100 px-4 py-2 dark:border-zinc-800">
        {/* Search */}
        <div className="relative">
          <svg className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.68 11.74a6 6 0 01-7.922-8.982 6 6 0 018.982 7.922l3.04 3.04a.749.749 0 11-1.06 1.06l-3.04-3.04zm-5.44-1.19a4.5 4.5 0 100-9 4.5 4.5 0 000 9z" />
          </svg>
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Search accounts…"
            className="rounded-lg border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-xs text-zinc-700 outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 w-52"
          />
        </div>

        <span className="text-zinc-200 dark:text-zinc-700">|</span>

        {/* Category filters */}
        <select value={filters.stage ?? ''} onChange={(e) => onFilter({ stage: (e.target.value as AccountStage) || undefined })} className={selectCls}>
          <option value="">All Stages</option>
          {STAGE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filters.segment ?? ''} onChange={(e) => onFilter({ segment: (e.target.value as AccountSegment) || undefined })} className={selectCls}>
          <option value="">All Segments</option>
          {SEGMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filters.industry ?? ''} onChange={(e) => onFilter({ industry: (e.target.value as AccountIndustry) || undefined })} className={selectCls}>
          <option value="">All Industries</option>
          {INDUSTRY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <select value={filters.tier ?? ''} onChange={(e) => onFilter({ tier: (e.target.value as AccountTier) || undefined })} className={selectCls}>
          <option value="">All Tiers</option>
          {TIER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>

        {activeCount > 0 && (
          <button
            onClick={() => onFilter({ stage: undefined, segment: undefined, industry: undefined, tier: undefined })}
            className="text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
          >
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-zinc-400">{totalCount} account{totalCount !== 1 ? 's' : ''}</span>
      </div>
    </header>
  );
}

'use client';

import { useState } from 'react';
import RegionsSidebarPanel from './RegionsSidebarPanel';
import GeoSidebarPanel from './GeoSidebarPanel';

type Tab = 'geos' | 'regions';

export default function TeamSidebar() {
  const [tab, setTab] = useState<Tab>('geos');
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <aside className="flex w-10 flex-shrink-0 flex-col border-r border-hairline bg-panel">
        <button
          onClick={() => setCollapsed(false)}
          className="flex h-10 w-full items-center justify-center text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
          aria-label="Expand sidebar"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 011.06 0l4 4a.75.75 0 010 1.06l-4 4a.75.75 0 01-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </aside>
    );
  }

  const tabBase = 'relative flex-1 py-2.5 text-[11px] font-semibold uppercase tracking-[0.10em] transition-colors';
  const tabIdle = 'text-ink-faint hover:text-ink';
  const tabActive = 'text-ink';

  return (
    <aside className="flex w-72 flex-shrink-0 flex-col border-r border-hairline bg-panel">
      <div className="relative flex items-center border-b border-hairline">
        <button
          onClick={() => setTab('geos')}
          className={`${tabBase} ${tab === 'geos' ? tabActive : tabIdle}`}
        >
          Geos
          {tab === 'geos' && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-brand" aria-hidden="true" />}
        </button>
        <button
          onClick={() => setTab('regions')}
          className={`${tabBase} ${tab === 'regions' ? tabActive : tabIdle}`}
        >
          Regions
          {tab === 'regions' && <span className="absolute inset-x-3 bottom-0 h-[2px] rounded-full bg-brand" aria-hidden="true" />}
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="mr-2 flex h-6 w-6 items-center justify-center rounded-md text-ink-faint transition-colors hover:bg-sunken hover:text-ink"
          aria-label="Collapse sidebar"
        >
          <svg className="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M9.78 3.22a.75.75 0 010 1.06L6.06 8l3.72 3.72a.75.75 0 11-1.06 1.06l-4-4a.75.75 0 010-1.06l4-4a.75.75 0 011.06 0z" />
          </svg>
        </button>
      </div>

      {tab === 'geos' ? <GeoSidebarPanel /> : <RegionsSidebarPanel />}
    </aside>
  );
}

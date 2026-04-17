'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useActiveView, useDrillDownCountryCode, useMapTheme, useAccountOrder,
  useShowAccounts, useMapAccountMetric, useActions, useMetricFields,
} from '@/hooks/useTerritoryStore';
import { MAP_THEMES } from '@/lib/mapThemes';
import type { MapThemeId } from '@/lib/mapThemes';
import ImportAccountsModal from './ImportAccountsModal';

interface ToolbarProps {
  drillDownCountryName: string | null;
}

const THEME_ORDER: MapThemeId[] = ['deep-ocean', 'crisp-atlas', 'dark-studio'];

export default function Toolbar({ drillDownCountryName }: ToolbarProps) {
  const activeView    = useActiveView();
  const drillDownCode = useDrillDownCountryCode();
  const activeTheme   = useMapTheme();
  const accountOrder  = useAccountOrder();
  const showAccounts  = useShowAccounts();
  const mapMetric     = useMapAccountMetric();
  const metricFields  = useMetricFields();
  const {
    setActiveView, setDrillDownCountryCode, setMapTheme,
    toggleShowAccounts, clearAccounts, setMapAccountMetric,
  } = useActions();
  const [showImport, setShowImport] = useState(false);

  return (
    <>
    <header className="flex items-center gap-3 border-b border-zinc-200 bg-white px-4 py-2.5 dark:border-zinc-700 dark:bg-zinc-950">
      {/* Logo + page nav */}
      <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
        Sales Deployment
      </span>
      <div className="flex items-center rounded-lg border border-zinc-200 p-0.5 text-xs dark:border-zinc-700">
        <span className="rounded-md bg-zinc-900 px-2.5 py-1 font-medium text-white dark:bg-zinc-100 dark:text-zinc-900">
          Territory
        </span>
        <Link
          href="/accounts"
          className="rounded-md px-2.5 py-1 font-medium text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
        >
          Accounts
        </Link>
      </div>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-zinc-500">
        <button
          onClick={() => setDrillDownCountryCode(null)}
          className={`rounded px-1.5 py-0.5 transition-colors hover:text-zinc-800 dark:hover:text-zinc-200 ${
            !drillDownCode ? 'font-semibold text-zinc-800 dark:text-zinc-100' : ''
          }`}
        >
          World
        </button>
        {drillDownCode && drillDownCountryName && (
          <>
            <span className="text-zinc-300 dark:text-zinc-600">/</span>
            <span className="rounded px-1.5 py-0.5 font-semibold text-zinc-800 dark:text-zinc-100">
              {drillDownCountryName}
            </span>
          </>
        )}
      </nav>

      <div className="flex-1" />

      {/* Map theme picker */}
      <div className="flex items-center gap-1" title="Map theme">
        {THEME_ORDER.map((id) => {
          const t = MAP_THEMES[id];
          const isActive = activeTheme.id === id;
          return (
            <button
              key={id}
              onClick={() => setMapTheme(id)}
              title={t.label}
              aria-label={`Switch to ${t.label} theme`}
              className={`flex h-6 w-6 items-center justify-center rounded-md border transition-all ${
                isActive
                  ? 'border-blue-500 ring-2 ring-blue-300 ring-offset-1 dark:ring-offset-zinc-950'
                  : 'border-zinc-200 hover:border-zinc-400 dark:border-zinc-700'
              }`}
              style={{ background: t.previewBg }}
            >
              <span
                className="h-3.5 w-3.5 rounded-sm"
                style={{ background: `linear-gradient(135deg, ${t.previewOcean} 50%, ${t.previewLand} 50%)` }}
              />
            </button>
          );
        })}
      </div>

      {/* Accounts controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-600 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          title="Import account data"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM14 14s1 0 1-1-1-4-7-4-7 3-7 4 1 1 1 1h12z" />
          </svg>
          Accounts
          {accountOrder.length > 0 && (
            <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-900 dark:text-blue-300">
              {accountOrder.length}
            </span>
          )}
        </button>
        {accountOrder.length > 0 && (
          <>
            <button
              onClick={toggleShowAccounts}
              title={showAccounts ? 'Hide accounts on map' : 'Show accounts on map'}
              className={`flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                showAccounts
                  ? 'border-blue-300 bg-blue-50 text-blue-600 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-400'
                  : 'border-zinc-200 bg-white text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800'
              }`}
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
                {showAccounts
                  ? <path d="M8 2a6 6 0 100 12A6 6 0 008 2zm0 2a4 4 0 110 8A4 4 0 018 4zm0 1.5a2.5 2.5 0 100 5 2.5 2.5 0 000-5z" />
                  : <path d="M.5 3.5a.5.5 0 000 1L3 7l-2.5 2.5a.5.5 0 10.707.707L4 7.707l1.646 1.647A6.025 6.025 0 018 10c2.09 0 3.943.695 5.354 1.646l.5.354.5-.354A.5.5 0 1013.646 11L12 9.354l2.5-2.5A.5.5 0 0014.207 6L12 8.207 9.793 6H9.5a.5.5 0 00-.5.5v.207L8 5.793 7 6.793V6.5a.5.5 0 00-.5-.5H6.207L4 3.793 2.207 5.586.5 3.5z" />
                }
              </svg>
            </button>
            {showAccounts && (
              <select
                value={mapMetric}
                onChange={(e) => setMapAccountMetric(e.target.value)}
                title="Map metric"
                className="rounded-lg border border-zinc-200 bg-white py-1 pl-2 pr-6 text-xs text-zinc-600 outline-none focus:border-blue-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
              >
                <option value="count">Count</option>
                {metricFields.map((f) => (
                  <option key={f.id} value={f.id}>{f.label}</option>
                ))}
              </select>
            )}
            <button
              onClick={() => { if (confirm('Remove all imported accounts?')) clearAccounts(); }}
              title="Clear accounts"
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:border-red-300 hover:text-red-500 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
                <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* View toggle */}
      <div className="flex rounded-lg border border-zinc-200 p-0.5 dark:border-zinc-700">
        <button
          onClick={() => setActiveView('map')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeView === 'map'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75v10.5A1.75 1.75 0 0114.25 15H1.75A1.75 1.75 0 010 13.25V2.75zm1.75-.25a.25.25 0 00-.25.25v10.5c0 .138.112.25.25.25h12.5a.25.25 0 00.25-.25V2.75a.25.25 0 00-.25-.25H1.75z" />
          </svg>
          Map
        </button>
        <button
          onClick={() => setActiveView('spreadsheet')}
          className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            activeView === 'spreadsheet'
              ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
              : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
          }`}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 1.75C0 .784.784 0 1.75 0h12.5C15.216 0 16 .784 16 1.75v12.5A1.75 1.75 0 0114.25 16H1.75A1.75 1.75 0 010 14.25V1.75zM1.5 5.25v9a.25.25 0 00.25.25H5.5V5.25H1.5zm5.5 0v9.25h7.75a.25.25 0 00.25-.25v-9H7zM5.5 3.75H1.5v-.25L1.75 1.5h3.75v2.25zm1.5 0V1.5h7.25l.25 2V3.75H7z" />
          </svg>
          Spreadsheet
        </button>
      </div>
    </header>

    {showImport && <ImportAccountsModal onClose={() => setShowImport(false)} />}
    </>
  );
}

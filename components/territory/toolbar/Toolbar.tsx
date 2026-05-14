'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  useActiveView, useDrillDownCountryCode, useMapTheme, useAccountOrder,
  useShowAccounts, useMapAccountMetric, useActions, useMetricFields,
  useActivePaintGeo, useActiveEraser, useActiveSelect, useCanUndoGeo, useCanRedoGeo,
  useShowLabels,
} from '@/hooks/useTerritoryStore';
import { useSelectionCount } from '@/store/slices/selectionSelectors';
import type { ZoomCommand } from '@/store/slices/mapUiSlice';
import { logout } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { MAP_THEMES } from '@/lib/mapThemes';
import type { MapThemeId } from '@/lib/mapThemes';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import { useEntityNoun } from '@/hooks/useEntityNoun';
import { useModuleEnabled } from '@/hooks/useModuleEnabled';
import { MapHelpPopover } from '@/components/territory/map/MapHelpPopover';

interface ToolbarProps {
  drillDownCountryName: string | null;
}

const THEME_ORDER: MapThemeId[] = ['vegeta', 'crisp-atlas', 'deep-ocean', 'dark-studio'];

const ghostBtn =
  'inline-flex items-center gap-1.5 rounded-md border border-hairline bg-panel/60 px-2.5 py-1.5 text-[11px] font-medium text-ink-body transition-all hover:border-hairline-strong hover:bg-panel hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30';

const iconBtn =
  'flex h-7 w-7 items-center justify-center rounded-md border border-hairline bg-panel/60 text-ink-muted transition-colors hover:border-hairline-strong hover:bg-panel hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30';

const navLink =
  'rounded-[7px] px-2.5 py-1 text-[11px] font-medium tracking-tight text-ink-muted transition-colors hover:text-ink';
const navActive =
  'rounded-[7px] bg-panel px-2.5 py-1 text-[11px] font-semibold tracking-tight text-ink shadow-xs';

export default function Toolbar({ drillDownCountryName }: ToolbarProps) {
  const activeView    = useActiveView();
  const drillDownCode = useDrillDownCountryCode();
  const activeTheme   = useMapTheme();
  const accountOrder  = useAccountOrder();
  const showAccounts  = useShowAccounts();
  const mapMetric     = useMapAccountMetric();
  const metricFields  = useMetricFields();
  const showLabels    = useShowLabels();
  const paintGeo      = useActivePaintGeo();
  const eraserActive  = useActiveEraser();
  const selectActive  = useActiveSelect();
  const canUndo       = useCanUndoGeo();
  const canRedo       = useCanRedoGeo();
  const entityPlural  = useEntityNoun('plural');
  const tasksEnabled  = useModuleEnabled('tasks');
  const {
    setActiveView, setDrillDownCountryCode, setMapTheme,
    toggleShowAccounts, setMapAccountMetric, setActivePaintGeo, setActiveEraser, setActiveSelect,
    undoGeoAssignment, redoGeoAssignment, toggleShowLabels, clearSelection, setMapZoomCommand,
  } = useActions();
  const [helpOpen, setHelpOpen] = useState(false);
  const selectionCount = useSelectionCount();

  useEffect(() => {
    function isEditableTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false;
      const tag = t.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
    }
    function onKey(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;

      // Esc cascade: popover → selection → paint/eraser
      if (e.key === 'Escape') {
        if (helpOpen) { setHelpOpen(false); return; }
        if (selectionCount > 0) { clearSelection(); return; }
        if (paintGeo || eraserActive) {
          setActivePaintGeo(null);
          setActiveEraser(false);
          return;
        }
        return;
      }

      // ? toggles help (key === '?' on most layouts)
      if (e.key === '?') {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }

      // / focuses the Geos sidebar search input
      if (e.key === '/') {
        e.preventDefault();
        document.getElementById('geo-sidebar-search')?.focus();
        return;
      }

      // g focuses the first row in the Geos sidebar tree
      if (e.key === 'g' && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        document.querySelector<HTMLElement>('[data-geo-node-row]')?.focus();
        return;
      }

      // Arrow / +/- / 0 — dispatch zoom commands (no modifier)
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        let cmd: ZoomCommand | null = null;
        const PAN_PX = 40;
        if (e.key === 'ArrowUp')         cmd = { kind: 'panBy', dx: 0, dy: -PAN_PX, nonce: Date.now() };
        else if (e.key === 'ArrowDown')  cmd = { kind: 'panBy', dx: 0, dy:  PAN_PX, nonce: Date.now() };
        else if (e.key === 'ArrowLeft')  cmd = { kind: 'panBy', dx: -PAN_PX, dy: 0, nonce: Date.now() };
        else if (e.key === 'ArrowRight') cmd = { kind: 'panBy', dx:  PAN_PX, dy: 0, nonce: Date.now() };
        else if (e.key === '+' || e.key === '=') cmd = { kind: 'zoomBy', factor: 1.5, nonce: Date.now() };
        else if (e.key === '-')                  cmd = { kind: 'zoomBy', factor: 1 / 1.5, nonce: Date.now() };
        else if (e.key === '0')                  cmd = { kind: 'reset', nonce: Date.now() };
        if (cmd) {
          e.preventDefault();
          setMapZoomCommand(cmd);
          return;
        }
      }

      // Existing undo/redo (cmd+z, cmd+shift+z, cmd+y)
      const withCmdKey = e.metaKey || e.ctrlKey;
      if (!withCmdKey) return;
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoGeoAssignment();
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        redoGeoAssignment();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    paintGeo, eraserActive, helpOpen, selectionCount,
    setActivePaintGeo, setActiveEraser, undoGeoAssignment, redoGeoAssignment,
    clearSelection, setMapZoomCommand,
  ]);

  const router = useRouter();

  async function handleSignOut() {
    await logout();
    router.replace('/login');
  }

  return (
    <header className="relative flex flex-wrap items-center gap-3 border-b border-hairline bg-canvas/80 px-5 py-3 backdrop-blur-md">
      {/* Brand mark */}
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

      {/* Primary nav */}
      <nav className="ml-1 flex items-center gap-0.5 rounded-[10px] border border-hairline bg-sunken/70 p-0.5">
        <span className={navActive}>Territory</span>
        <Link href="/accounts" className={navLink}>{entityPlural}</Link>
        <Link href="/teams" className={navLink}>Teams</Link>
        {tasksEnabled && <Link href="/tasks" className={navLink}>Tasks</Link>}
      </nav>

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-[12px]" aria-label="Map breadcrumb">
        <button
          onClick={() => setDrillDownCountryCode(null)}
          className={`rounded-md px-1.5 py-0.5 transition-colors hover:text-ink ${
            !drillDownCode ? 'font-semibold text-ink' : 'text-ink-muted'
          }`}
        >
          World
        </button>
        {drillDownCode && drillDownCountryName && (
          <>
            <span className="text-indigo-400/70" aria-hidden="true">›</span>
            <span className="rounded-md px-1.5 py-0.5 font-semibold text-ink">
              {drillDownCountryName}
            </span>
          </>
        )}
      </nav>

      {paintGeo && (
        <div
          className="inline-flex items-center gap-2 rounded-full border border-brand/30 bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand-ink"
          title="Active paint mode — click countries on the map to assign them"
        >
          <span
            className="inline-block h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
            style={{ background: paintGeo.color ?? 'transparent' }}
          />
          <span>Painting <span className="font-semibold">{paintGeo.name}</span></span>
          <button
            onClick={() => setActivePaintGeo(null)}
            className="rounded-full p-0.5 transition-colors hover:bg-brand/15"
            title="Stop painting (Esc)"
            aria-label="Stop painting"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>
      )}
      {eraserActive && (
        <div
          className="inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-200"
          title="Eraser mode — click countries on the map to clear their assignment"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.05 1.05a3 3 0 014.24 0l1.66 1.66a3 3 0 010 4.24L7.7 14.2A3 3 0 015.58 15H2a1 1 0 01-1-1v-3.58A3 3 0 011.8 8.3l7.25-7.25z" />
          </svg>
          <span>Erasing</span>
          <button
            onClick={() => setActiveEraser(false)}
            className="rounded-full p-0.5 transition-colors hover:bg-amber-500/15"
            title="Stop erasing (Esc)"
            aria-label="Stop erasing"
          >
            <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M3.72 3.72a.75.75 0 011.06 0L8 6.94l3.22-3.22a.75.75 0 111.06 1.06L9.06 8l3.22 3.22a.75.75 0 11-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 01-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 010-1.06z" />
            </svg>
          </button>
        </div>
      )}
      {!paintGeo && !eraserActive && (
        <button
          onClick={() => setActiveEraser(true)}
          className={ghostBtn}
          title="Eraser — click countries to clear their Geo assignment"
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M9.05 1.05a3 3 0 014.24 0l1.66 1.66a3 3 0 010 4.24L7.7 14.2A3 3 0 015.58 15H2a1 1 0 01-1-1v-3.58A3 3 0 011.8 8.3l7.25-7.25z" />
          </svg>
          Erase
        </button>
      )}
      {!paintGeo && !eraserActive && (
        <button
          onClick={() => setActiveSelect(!selectActive)}
          className={`${ghostBtn}${selectActive ? ' border-brand/40 bg-brand-soft text-brand-ink' : ''}`}
          title={selectActive ? 'Exit select mode (Esc)' : 'Multi-select regions'}
          aria-pressed={selectActive}
        >
          <svg className="h-3 w-3" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2l4.5 11 2-4.5L13 6.5 2 2z" />
          </svg>
          Select
        </button>
      )}

      <button
        type="button"
        onClick={() => setHelpOpen((v) => !v)}
        className="ml-1 inline-flex h-6 w-6 items-center justify-center rounded-full border border-hairline text-[11px] font-semibold text-ink-muted hover:text-ink"
        aria-label="Keyboard shortcuts"
        aria-expanded={helpOpen}
        title="Keyboard shortcuts (?)"
      >
        ?
      </button>

      {/* Undo / redo */}
      <div className="flex items-center gap-0.5 rounded-md border border-hairline bg-panel/60 p-0.5">
        <button
          onClick={undoGeoAssignment}
          disabled={!canUndo}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title="Undo Geo assignment (⌘Z)"
          aria-label="Undo Geo assignment"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5.78 3.22a.75.75 0 010 1.06L3.81 6.25H8.5a4.5 4.5 0 010 9H4.75a.75.75 0 010-1.5H8.5a3 3 0 100-6H3.81l1.97 1.97a.75.75 0 01-1.06 1.06L1.47 7.53a.75.75 0 010-1.06l3.25-3.25a.75.75 0 011.06 0z" />
          </svg>
        </button>
        <button
          onClick={redoGeoAssignment}
          disabled={!canRedo}
          className="flex h-6 w-6 items-center justify-center rounded text-ink-muted transition-colors hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title="Redo Geo assignment (⇧⌘Z)"
          aria-label="Redo Geo assignment"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.22 3.22a.75.75 0 011.06 0l3.25 3.25a.75.75 0 010 1.06l-3.25 3.25a.75.75 0 11-1.06-1.06l1.97-1.97H7.5a3 3 0 100 6h3.75a.75.75 0 010 1.5H7.5a4.5 4.5 0 010-9h4.69l-1.97-1.97a.75.75 0 010-1.06z" />
          </svg>
        </button>
      </div>

      <div className="flex-1" />

      {/* Map theme picker */}
      <div className="flex items-center gap-1 rounded-md border border-hairline bg-panel/60 p-0.5" title="Map theme">
        {THEME_ORDER.map((id) => {
          const t = MAP_THEMES[id];
          const isActive = activeTheme.id === id;
          return (
            <button
              key={id}
              onClick={() => setMapTheme(id)}
              title={t.label}
              aria-label={`Switch to ${t.label} theme`}
              className={`relative grid h-5 w-5 place-items-center rounded transition-all ${
                isActive
                  ? 'ring-2 ring-brand ring-offset-1 ring-offset-panel'
                  : 'ring-1 ring-hairline-strong hover:ring-ink-muted'
              }`}
              style={{ background: t.previewBg }}
            >
              <span
                className="h-3 w-3 rounded-sm"
                style={{ background: `linear-gradient(135deg, ${t.previewOcean} 50%, ${t.previewLand} 50%)` }}
              />
            </button>
          );
        })}
      </div>

      {/* Account display controls */}
      {accountOrder.length > 0 && (
        <div className="flex items-center gap-1.5">
          <span
            className="inline-flex items-center gap-1.5 rounded-md border border-hairline bg-panel/60 px-2 py-1.5 text-[11px] font-medium text-ink-body"
            title={`${entityPlural} loaded`}
          >
            <svg className="h-3.5 w-3.5 text-ink-muted" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 8a3 3 0 100-6 3 3 0 000 6zM14 14s1 0 1-1-1-4-7-4-7 3-7 4 1 1 1 1h12z" />
            </svg>
            <span>{entityPlural}</span>
            <span className="rounded-full bg-brand-soft px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-brand-ink">
              {accountOrder.length}
            </span>
          </span>
          <button
            onClick={toggleShowAccounts}
            title={showAccounts ? 'Hide accounts on map' : 'Show accounts on map'}
            className={`${iconBtn} ${showAccounts ? 'border-brand/40 bg-brand-soft text-brand' : ''}`}
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
              aria-label="Map metric"
              className="appearance-none rounded-md border border-hairline bg-panel/60 py-1.5 pl-2.5 pr-7 text-[11px] font-medium text-ink-body outline-none transition-colors hover:border-hairline-strong hover:bg-panel focus:border-brand/60 focus:ring-2 focus:ring-brand/20 [background-image:url('data:image/svg+xml;utf8,<svg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%2210%22%20height=%2210%22%20viewBox=%220%200%2010%2010%22><path%20d=%22M2%204l3%203%203-3%22%20stroke=%22%2397a0b3%22%20stroke-width=%221.4%22%20fill=%22none%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22/></svg>')] [background-position:right_0.5rem_center] [background-repeat:no-repeat] [background-size:10px_10px]"
            >
              <option value="count">Count</option>
              {metricFields.map((f) => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          )}
        </div>
      )}

      {/* Labels toggle */}
      <button
        type="button"
        onClick={toggleShowLabels}
        className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-hairline ${showLabels ? 'bg-brand-soft text-brand' : 'bg-panel hover:bg-canvas'}`}
        aria-label={showLabels ? 'Hide labels' : 'Show labels'}
        aria-pressed={showLabels}
      >
        <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
          {showLabels ? (
            <>
              <ellipse cx="8" cy="8" rx="6" ry="3.5" />
              <circle cx="8" cy="8" r="1.4" fill="currentColor" stroke="none" />
            </>
          ) : (
            <>
              <path d="M2 8c1.5-2 3.5-3 6-3 1 0 1.9.15 2.7.4" />
              <path d="M14 8c-1.4 1.9-3.3 2.9-5.7 3" />
              <path d="M3 3l10 10" />
            </>
          )}
        </svg>
      </button>

      {/* View toggle */}
      <div className="flex items-center gap-0.5 rounded-[10px] border border-hairline bg-sunken/70 p-0.5">
        <button onClick={() => setActiveView('map')} className={activeView === 'map' ? navActive : navLink}>Map</button>
        <button onClick={() => setActiveView('spreadsheet')} className={activeView === 'spreadsheet' ? navActive : navLink}>Sheet</button>
      </div>

      <button
        onClick={handleSignOut}
        className={ghostBtn}
        title="Sign out"
      >
        Sign out
      </button>
      <MapHelpPopover open={helpOpen} onClose={() => setHelpOpen(false)} />
    </header>
  );
}

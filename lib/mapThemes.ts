export type MapThemeId = 'vegeta' | 'dark-studio' | 'crisp-atlas' | 'deep-ocean';

export interface MapTheme {
  id: MapThemeId;
  label: string;
  // preview swatches shown in the toolbar picker
  previewBg: string;
  previewOcean: string;
  previewLand: string;
  // map container background
  bg: string;
  // Sphere
  sphereFill: string;
  sphereStroke: string;
  // Graticule (null = hidden)
  graticuleFill: string | null;
  graticuleStroke: string | null;
  graticuleWidth: number;
  // Borders
  countryStroke: string;
  countryStrokeWidth: number;
  stateStroke: string;
  stateStrokeWidth: number;
  // Unassigned country/state fill + hover
  unassignedFill: string;
  unassignedHover: string;
  hoverOpacity: number;
  // Transition
  transition: string;
  // UI chrome
  legendClass: string;
  legendTitleClass: string;
  legendTextClass: string;
  tooltipClass: string;
  // Inner-cell class for one of the three zoom buttons inside the wrapper panel.
  zoomBtnClass: string;
}

// Shared chrome shapes — all themes use the same structural classes so the
// picker swaps mood (color), not layout. Mood-specific surfaces still vary.

const SHARED_LEGEND_TITLE =
  'mb-2 text-[10px] font-semibold uppercase tracking-[0.14em]';
const SHARED_LEGEND_TEXT  =
  'flex items-center gap-2 text-xs';

export const MAP_THEMES: Record<MapThemeId, MapTheme> = {
  // ── Vegeta — paper-quiet, premium minimal default ──────────────────────────
  'vegeta': {
    id: 'vegeta',
    label: 'Vegeta',
    previewBg:    '#f7f7f5',
    previewOcean: '#f1f1ed',
    previewLand:  '#e7e7e0',
    bg:           '#f7f7f5',
    sphereFill:   '#f7f7f5',
    sphereStroke: 'rgba(15,23,42,0.10)',
    graticuleFill: null,
    graticuleStroke: null,
    graticuleWidth: 0,
    countryStroke:    'rgba(15,23,42,0.10)',
    countryStrokeWidth: 0.5,
    stateStroke:      'rgba(15,23,42,0.07)',
    stateStrokeWidth: 0.5,
    unassignedFill:  '#ececeb',
    unassignedHover: '#dedede',
    hoverOpacity:    1.0,
    transition: 'fill 140ms ease-out',
    legendClass:
      'absolute bottom-4 left-4 z-10 rounded-xl border border-hairline bg-panel/85 p-3 shadow-md backdrop-blur-md',
    legendTitleClass: `${SHARED_LEGEND_TITLE} text-ink-muted`,
    legendTextClass:  `${SHARED_LEGEND_TEXT} text-ink-body`,
    tooltipClass:
      'pointer-events-none fixed z-50 rounded-lg border border-hairline bg-panel/90 px-3 py-2 text-xs text-ink shadow-md backdrop-blur',
    zoomBtnClass:
      'flex h-8 w-8 items-center justify-center bg-panel text-ink-muted transition-colors hover:bg-sunken hover:text-ink',
  },

  'dark-studio': {
    id: 'dark-studio',
    label: 'Dark Studio',
    previewBg:    '#0f172a',
    previewOcean: '#1e3a5c',
    previewLand:  '#2d3f52',
    bg:           '#0f172a',
    sphereFill:   '#3466a2',
    sphereStroke: '#162d41',
    graticuleFill: null,
    graticuleStroke: '#1e3258',
    graticuleWidth: 0,
    countryStroke:      '#0f172a',
    countryStrokeWidth: 0.5,
    stateStroke:        '#0f172a',
    stateStrokeWidth:   1.0,
    unassignedFill:  '#2d3f52',
    unassignedHover: '#3d5268',
    hoverOpacity:    0.9,
    transition: 'fill 200ms ease-out',
    legendClass:
      'absolute bottom-4 left-4 z-10 rounded-xl border border-slate-700/80 bg-slate-900/85 p-3 shadow-lg backdrop-blur-md',
    legendTitleClass: `${SHARED_LEGEND_TITLE} text-slate-400`,
    legendTextClass:  `${SHARED_LEGEND_TEXT} text-slate-200`,
    tooltipClass:
      'pointer-events-none fixed z-50 rounded-lg border border-slate-700/80 bg-slate-900/90 px-3 py-2 text-xs text-slate-100 shadow-lg backdrop-blur',
    zoomBtnClass:
      'flex h-8 w-8 items-center justify-center bg-slate-900/85 text-slate-200 transition-colors hover:bg-slate-800',
  },

  'crisp-atlas': {
    id: 'crisp-atlas',
    label: 'Crisp Atlas',
    previewBg:    '#f1f5f9',
    previewOcean: '#e2e8f0',
    previewLand:  '#f8fafc',
    bg:           '#f1f5f9',
    sphereFill:   '#a3aab2',
    sphereStroke: '#cbd5e1',
    graticuleFill: null,
    graticuleStroke: null,
    graticuleWidth: 0,
    countryStroke:      '#cbd5e1',
    countryStrokeWidth: 0.5,
    stateStroke:        '#e2e8f0',
    stateStrokeWidth:   0.8,
    unassignedFill:  '#f1f5f9',
    unassignedHover: '#e2e8f0',
    hoverOpacity:    1.0,
    transition: 'fill 120ms ease',
    legendClass:
      'absolute bottom-4 left-4 z-10 rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-md backdrop-blur-md',
    legendTitleClass: `${SHARED_LEGEND_TITLE} text-slate-400`,
    legendTextClass:  `${SHARED_LEGEND_TEXT} text-slate-700`,
    tooltipClass:
      'pointer-events-none fixed z-50 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs text-slate-800 shadow-md backdrop-blur',
    zoomBtnClass:
      'flex h-8 w-8 items-center justify-center bg-white text-slate-600 transition-colors hover:bg-slate-50',
  },

  'deep-ocean': {
    id: 'deep-ocean',
    label: 'Deep Ocean',
    previewBg:    '#e0f2fe',
    previewOcean: '#0369a1',
    previewLand:  '#94a3b8',
    bg:           '#e0f2fe',
    sphereFill:   '#0369a1',
    sphereStroke: '#0284c7',
    graticuleFill: null,
    graticuleStroke: '#38bdf8',
    graticuleWidth: 0,
    countryStroke:      '#ffffff',
    countryStrokeWidth: 0.6,
    stateStroke:        '#ffffff',
    stateStrokeWidth:   1.0,
    unassignedFill:  '#94a3b8',
    unassignedHover: '#64748b',
    hoverOpacity:    0.85,
    transition: 'fill 150ms ease',
    legendClass:
      'absolute bottom-4 left-4 z-10 rounded-xl border border-sky-100/80 bg-white/90 p-3 shadow-md backdrop-blur-md',
    legendTitleClass: `${SHARED_LEGEND_TITLE} text-slate-400`,
    legendTextClass:  `${SHARED_LEGEND_TEXT} text-slate-800`,
    tooltipClass:
      'pointer-events-none fixed z-50 rounded-lg border border-slate-700/40 bg-slate-900/90 px-3 py-2 text-xs text-white shadow-lg backdrop-blur',
    zoomBtnClass:
      'flex h-8 w-8 items-center justify-center bg-white/95 text-slate-700 transition-colors hover:bg-white',
  },
};

export const DEFAULT_THEME_ID: MapThemeId = 'vegeta';

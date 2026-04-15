export type MapThemeId = 'dark-studio' | 'crisp-atlas' | 'deep-ocean';

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
  zoomBtnClass: string;
}

export const MAP_THEMES: Record<MapThemeId, MapTheme> = {
  'dark-studio': {
    id: 'dark-studio',
    label: 'Dark Studio',
    previewBg: '#0f172a',
    previewOcean: '#1e3a5c',
    previewLand: '#2d3f52',
    bg: '#0f172a',
    sphereFill: '#1e3a5c',
    sphereStroke: '#162d41',
    graticuleFill: null,
    graticuleStroke: '#1e3258',
    graticuleWidth: 0.2,
    countryStroke: '#0f172a',
    countryStrokeWidth: 0.5,
    stateStroke: '#0f172a',
    stateStrokeWidth: 1.0,
    unassignedFill: '#2d3f52',
    unassignedHover: '#3d5268',
    hoverOpacity: 0.9,
    transition: 'fill 200ms ease-out',
    legendClass:
      'absolute bottom-4 left-4 z-10 rounded-xl border border-slate-700 bg-slate-900/80 p-3 shadow-2xl backdrop-blur-md',
    legendTitleClass: 'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400',
    legendTextClass: 'flex items-center gap-2 text-sm text-slate-200',
    tooltipClass:
      'pointer-events-none fixed z-50 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white shadow-2xl',
    zoomBtnClass:
      'flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 bg-slate-800 font-bold text-slate-200 shadow hover:bg-slate-700 transition-colors',
  },

  'crisp-atlas': {
    id: 'crisp-atlas',
    label: 'Crisp Atlas',
    previewBg: '#f1f5f9',
    previewOcean: '#e2e8f0',
    previewLand: '#f8fafc',
    bg: '#f1f5f9',
    sphereFill: '#e2e8f0',
    sphereStroke: '#cbd5e1',
    graticuleFill: null,
    graticuleStroke: null, // hidden
    graticuleWidth: 0,
    countryStroke: '#cbd5e1',
    countryStrokeWidth: 0.5,
    stateStroke: '#e2e8f0',
    stateStrokeWidth: 0.8,
    unassignedFill: '#f1f5f9',
    unassignedHover: '#e2e8f0',
    hoverOpacity: 1.0,
    transition: 'fill 120ms ease',
    legendClass:
      'absolute bottom-4 left-4 z-10 rounded-2xl border border-slate-100 bg-white p-3 shadow-md',
    legendTitleClass: 'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400',
    legendTextClass: 'flex items-center gap-2 text-sm text-slate-700',
    tooltipClass:
      'pointer-events-none fixed z-50 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-lg',
    zoomBtnClass:
      'flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white font-bold text-slate-600 shadow-sm hover:bg-slate-50 transition-colors',
  },

  'deep-ocean': {
    id: 'deep-ocean',
    label: 'Deep Ocean',
    previewBg: '#e0f2fe',
    previewOcean: '#0369a1',
    previewLand: '#94a3b8',
    bg: '#e0f2fe',
    sphereFill: '#0369a1',
    sphereStroke: '#0284c7',
    graticuleFill: null,
    graticuleStroke: '#38bdf8',
    graticuleWidth: 0.15,
    countryStroke: '#ffffff',
    countryStrokeWidth: 0.6,
    stateStroke: '#ffffff',
    stateStrokeWidth: 1.0,
    unassignedFill: '#94a3b8',
    unassignedHover: '#64748b',
    hoverOpacity: 0.85,
    transition: 'fill 150ms ease',
    legendClass:
      'absolute bottom-4 left-4 z-10 rounded-2xl border border-sky-100 bg-white/95 p-3 shadow-xl backdrop-blur-sm',
    legendTitleClass: 'mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400',
    legendTextClass: 'flex items-center gap-2 text-sm text-slate-800',
    tooltipClass:
      'pointer-events-none fixed z-50 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white shadow-xl',
    zoomBtnClass:
      'flex h-8 w-8 items-center justify-center rounded-lg border border-sky-200 bg-white/90 font-bold text-slate-600 shadow-md backdrop-blur hover:bg-white transition-colors',
  },
};

export const DEFAULT_THEME_ID: MapThemeId = 'deep-ocean';

// Barrel of selector hooks. Selectors are colocated with their slice in
// `store/slices/*Selectors.ts`; cross-slice selectors live in `store/selectors.ts`.
// Import from those modules directly in new code; this file exists for
// backwards compatibility with existing consumers.

export { useTerritoryStore } from '@/store/territoryStore';

export * from '@/store/slices/mapUiSelectors';
export * from '@/store/slices/teamsSelectors';
export * from '@/store/slices/membersSelectors';
export * from '@/store/slices/regionsSelectors';
export * from '@/store/slices/subregionsSelectors';
export * from '@/store/slices/assignmentsSelectors';
export * from '@/store/slices/geoSelectors';
export * from '@/store/slices/accountsSelectors';
export * from '@/store/slices/hierarchyLevelsSelectors';
export * from '@/store/slices/pipelineStagesSelectors';
export * from '@/store/selectors';

import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore } from '../territoryStore';

export const useAccounts = () => useTerritoryStore((s) => s.accounts);
export const useAccountOrder = () => useTerritoryStore((s) => s.accountOrder);
export const useFieldDefs = () => useTerritoryStore(useShallow((s) => s.fieldDefs));
export const useMetricFields = () =>
  useTerritoryStore(useShallow((s) => s.fieldDefs.filter((f) => f.type === 'metric')));
export const useCategoricalFields = () =>
  useTerritoryStore(useShallow((s) => s.fieldDefs.filter((f) => f.type === 'categorical')));

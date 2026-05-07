import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore } from '../territoryStore';
import type { Activity } from '@/types/crm';

export const useActivities = () => useTerritoryStore((s) => s.activities);
export const useActivityOrder = () => useTerritoryStore((s) => s.activityOrder);
export const useActivity = (id: string | null) =>
  useTerritoryStore((s) => (id ? s.activities[id] ?? null : null));

/** Activities for one account, newest-first by occurredAt. */
export const useActivitiesForAccount = (accountId: string | null) =>
  useTerritoryStore(
    useShallow((s) =>
      accountId
        ? s.activityOrder
            .map((id) => s.activities[id])
            .filter((a): a is Activity => !!a && a.accountId === accountId)
        : [],
    ),
  );

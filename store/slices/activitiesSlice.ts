import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { Activity } from '@/types/crm';
import * as directusWrite from '@/lib/directus-write';

function fireWrite(label: string, p: Promise<unknown>): void {
  p.catch((err: unknown) => console.error(`[activitiesSlice] ${label} failed`, err));
}

export type ActivityInput = Omit<Activity, 'id' | 'fields'> & { fields?: Record<string, string | number> };

export interface ActivitiesSlice {
  activities: Record<string, Activity>;
  activityOrder: string[]; // newest first by occurredAt

  addActivity: (input: ActivityInput) => string;
  updateActivity: (id: string, patch: Partial<Omit<Activity, 'id'>>) => void;
  removeActivity: (id: string) => void;

  hydrateActivities: (activities: Activity[]) => void;
}

export const activitiesPersistKeys = ['activities', 'activityOrder'] as const satisfies readonly (keyof ActivitiesSlice)[];

function sortByOccurredDesc(a: Activity, b: Activity): number {
  const av = a.occurredAt ? Date.parse(a.occurredAt) : 0;
  const bv = b.occurredAt ? Date.parse(b.occurredAt) : 0;
  return bv - av;
}

export const createActivitiesSlice: StateCreator<TerritoryStore, [], [], ActivitiesSlice> = (set) => ({
  activities: {},
  activityOrder: [],

  addActivity(input) {
    const id = crypto.randomUUID();
    const activity: Activity = {
      id,
      accountId: input.accountId,
      contactId: input.contactId ?? null,
      kind: input.kind,
      body: input.body ?? null,
      occurredAt: input.occurredAt ?? new Date().toISOString(),
      createdBy: input.createdBy ?? null,
      fields: input.fields ?? {},
    };
    set((s) => {
      const next = { ...s.activities, [id]: activity };
      const order = Object.values(next).sort(sortByOccurredDesc).map((a) => a.id);
      return { activities: next, activityOrder: order };
    });
    fireWrite(`createActivity(${id})`, directusWrite.createActivity(activity));
    return id;
  },

  updateActivity(id, patch) {
    let didApply = false;
    set((s) => {
      if (!s.activities[id]) return s;
      didApply = true;
      const next = { ...s.activities, [id]: { ...s.activities[id], ...patch } };
      // Re-sort if occurredAt changed; otherwise keep order stable.
      const order = patch.occurredAt !== undefined
        ? Object.values(next).sort(sortByOccurredDesc).map((a) => a.id)
        : s.activityOrder;
      return { activities: next, activityOrder: order };
    });
    if (didApply) fireWrite(`updateActivity(${id})`, directusWrite.updateActivityRemote(id, patch));
  },

  removeActivity(id) {
    let didApply = false;
    set((s) => {
      if (!s.activities[id]) return s;
      didApply = true;
      const activities = { ...s.activities };
      delete activities[id];
      return {
        activities,
        activityOrder: s.activityOrder.filter((aid) => aid !== id),
      };
    });
    if (didApply) fireWrite(`deleteActivity(${id})`, directusWrite.deleteActivity(id));
  },

  hydrateActivities(activities) {
    const map: Record<string, Activity> = {};
    activities.forEach((a) => { map[a.id] = a; });
    const order = activities.slice().sort(sortByOccurredDesc).map((a) => a.id);
    set({ activities: map, activityOrder: order });
  },
});

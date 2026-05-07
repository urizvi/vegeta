import { useShallow } from 'zustand/react/shallow';
import { useTerritoryStore } from '../territoryStore';
import type { Task } from '@/types/crm';

export const useTasks = () => useTerritoryStore((s) => s.tasks);
export const useTaskOrder = () => useTerritoryStore((s) => s.taskOrder);
export const useTask = (id: string | null) =>
  useTerritoryStore((s) => (id ? s.tasks[id] ?? null : null));

/** Tasks pinned to a single account (excludes standalone tasks). */
export const useTasksForAccount = (accountId: string | null) =>
  useTerritoryStore(
    useShallow((s) =>
      accountId
        ? s.taskOrder
            .map((id) => s.tasks[id])
            .filter((t): t is Task => !!t && t.accountId === accountId)
        : [],
    ),
  );

/** All tasks in stable taskOrder — used by /tasks cross-account view. */
export const useAllTasks = () =>
  useTerritoryStore(
    useShallow((s) =>
      s.taskOrder.map((id) => s.tasks[id]).filter((t): t is Task => !!t),
    ),
  );

/** Tasks assigned to a specific member, regardless of account. */
export const useTasksForAssignee = (memberId: string | null) =>
  useTerritoryStore(
    useShallow((s) =>
      memberId
        ? s.taskOrder
            .map((id) => s.tasks[id])
            .filter((t): t is Task => !!t && t.assigneeId === memberId)
        : [],
    ),
  );

import type { StateCreator } from 'zustand';
import type { TerritoryStore } from '../types';
import type { Task } from '@/types/crm';
import * as directusWrite from '@/lib/directus-write';

function fireWrite(label: string, p: Promise<unknown>): void {
  p.catch((err: unknown) => console.error(`[tasksSlice] ${label} failed`, err));
}

export type TaskInput = Omit<Task, 'id' | 'fields' | 'completedAt'> & {
  fields?: Record<string, string | number>;
  completedAt?: string | null;
};

export interface TasksSlice {
  tasks: Record<string, Task>;
  taskOrder: string[]; // open first by dueAt asc, then completed by completedAt desc

  addTask: (input: TaskInput) => string;
  updateTask: (id: string, patch: Partial<Omit<Task, 'id'>>) => void;
  toggleTaskComplete: (id: string) => void;
  removeTask: (id: string) => void;

  hydrateTasks: (tasks: Task[]) => void;
}

export const tasksPersistKeys = ['tasks', 'taskOrder'] as const satisfies readonly (keyof TasksSlice)[];

function sortTasks(a: Task, b: Task): number {
  // Open before completed.
  if (!a.completedAt && b.completedAt) return -1;
  if (a.completedAt && !b.completedAt) return 1;
  if (!a.completedAt && !b.completedAt) {
    // Both open: earliest dueAt first; null dueAt last.
    const av = a.dueAt ? Date.parse(a.dueAt) : Infinity;
    const bv = b.dueAt ? Date.parse(b.dueAt) : Infinity;
    return av - bv;
  }
  // Both completed: most recently completed first.
  const av = a.completedAt ? Date.parse(a.completedAt) : 0;
  const bv = b.completedAt ? Date.parse(b.completedAt) : 0;
  return bv - av;
}

function recomputeOrder(tasks: Record<string, Task>): string[] {
  return Object.values(tasks).sort(sortTasks).map((t) => t.id);
}

export const createTasksSlice: StateCreator<TerritoryStore, [], [], TasksSlice> = (set) => ({
  tasks: {},
  taskOrder: [],

  addTask(input) {
    const id = crypto.randomUUID();
    const task: Task = {
      id,
      accountId: input.accountId ?? null,
      title: input.title,
      dueAt: input.dueAt ?? null,
      completedAt: input.completedAt ?? null,
      assigneeId: input.assigneeId ?? null,
      fields: input.fields ?? {},
    };
    set((s) => {
      const next = { ...s.tasks, [id]: task };
      return { tasks: next, taskOrder: recomputeOrder(next) };
    });
    fireWrite(`createTask(${id})`, directusWrite.createTask(task));
    return id;
  },

  updateTask(id, patch) {
    let didApply = false;
    set((s) => {
      if (!s.tasks[id]) return s;
      didApply = true;
      const next = { ...s.tasks, [id]: { ...s.tasks[id], ...patch } };
      return { tasks: next, taskOrder: recomputeOrder(next) };
    });
    if (didApply) fireWrite(`updateTask(${id})`, directusWrite.updateTaskRemote(id, patch));
  },

  toggleTaskComplete(id) {
    let didApply = false;
    let nextCompletedAt: string | null = null;
    set((s) => {
      const t = s.tasks[id];
      if (!t) return s;
      didApply = true;
      nextCompletedAt = t.completedAt ? null : new Date().toISOString();
      const next = { ...s.tasks, [id]: { ...t, completedAt: nextCompletedAt } };
      return { tasks: next, taskOrder: recomputeOrder(next) };
    });
    if (didApply) {
      fireWrite(
        `toggleTaskComplete(${id})`,
        directusWrite.updateTaskRemote(id, { completedAt: nextCompletedAt }),
      );
    }
  },

  removeTask(id) {
    let didApply = false;
    set((s) => {
      if (!s.tasks[id]) return s;
      didApply = true;
      const tasks = { ...s.tasks };
      delete tasks[id];
      return { tasks, taskOrder: s.taskOrder.filter((tid) => tid !== id) };
    });
    if (didApply) fireWrite(`deleteTask(${id})`, directusWrite.deleteTask(id));
  },

  hydrateTasks(tasks) {
    const map: Record<string, Task> = {};
    tasks.forEach((t) => { map[t.id] = t; });
    set({ tasks: map, taskOrder: recomputeOrder(map) });
  },
});

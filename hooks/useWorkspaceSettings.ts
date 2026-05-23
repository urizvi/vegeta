'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useCurrentWorkspaceId } from './useCurrentWorkspaceId';

export interface ModulesEnabled {
  territory: boolean;
  contacts: boolean;
  activities: boolean;
  tasks: boolean;
}

export interface WorkspaceSettings {
  entityNounSingular: string;
  entityNounPlural: string;
  ownerNoun: string;
  modulesEnabled: ModulesEnabled;
  brandColor: string | null;
}

const DEFAULT_SETTINGS: WorkspaceSettings = {
  entityNounSingular: 'Account',
  entityNounPlural: 'Accounts',
  ownerNoun: 'Owner',
  modulesEnabled: { territory: true, contacts: true, activities: true, tasks: true },
  brandColor: null,
};

const cache = new Map<string, WorkspaceSettings>();
const inflight = new Map<string, Promise<WorkspaceSettings>>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

interface SettingsRow {
  entity_noun_singular: string | null;
  entity_noun_plural: string | null;
  owner_noun: string | null;
  modules_enabled: ModulesEnabled | string | null;
  brand_color: string | null;
}

function parseModules(raw: unknown): ModulesEnabled {
  if (!raw) return DEFAULT_SETTINGS.modulesEnabled;
  let obj: Partial<ModulesEnabled> = {};
  if (typeof raw === 'string') {
    try {
      obj = JSON.parse(raw) as Partial<ModulesEnabled>;
    } catch {
      return DEFAULT_SETTINGS.modulesEnabled;
    }
  } else if (typeof raw === 'object') {
    obj = raw as Partial<ModulesEnabled>;
  }
  return {
    territory: obj.territory ?? true,
    contacts: obj.contacts ?? true,
    activities: obj.activities ?? true,
    tasks: obj.tasks ?? true,
  };
}

function rowToSettings(row: SettingsRow): WorkspaceSettings {
  return {
    entityNounSingular: row.entity_noun_singular || DEFAULT_SETTINGS.entityNounSingular,
    entityNounPlural: row.entity_noun_plural || DEFAULT_SETTINGS.entityNounPlural,
    ownerNoun: row.owner_noun || DEFAULT_SETTINGS.ownerNoun,
    modulesEnabled: parseModules(row.modules_enabled),
    brandColor: row.brand_color ?? null,
  };
}

async function fetchSettings(workspaceId: string): Promise<WorkspaceSettings> {
  const base = process.env.NEXT_PUBLIC_DIRECTUS_URL;
  if (!base) return DEFAULT_SETTINGS;
  const res = await fetch(
    `${base}/items/workspace_settings?filter[workspace_id][_eq]=${encodeURIComponent(workspaceId)}&fields=entity_noun_singular,entity_noun_plural,owner_noun,modules_enabled,brand_color&limit=1`,
    { credentials: 'include', cache: 'no-store' },
  );
  if (!res.ok) return DEFAULT_SETTINGS;
  const json = (await res.json()) as { data?: SettingsRow[] };
  const row = json.data?.[0];
  return row ? rowToSettings(row) : DEFAULT_SETTINGS;
}

function loadIfNeeded(workspaceId: string): void {
  if (cache.has(workspaceId) || inflight.has(workspaceId)) return;
  const p = fetchSettings(workspaceId)
    .then((settings) => {
      cache.set(workspaceId, settings);
      return settings;
    })
    .catch(() => {
      cache.set(workspaceId, DEFAULT_SETTINGS);
      return DEFAULT_SETTINGS;
    })
    .finally(() => {
      inflight.delete(workspaceId);
      notify();
    });
  inflight.set(workspaceId, p);
}

function getSnapshotFor(workspaceId: string | null): WorkspaceSettings {
  if (!workspaceId) return DEFAULT_SETTINGS;
  return cache.get(workspaceId) ?? DEFAULT_SETTINGS;
}

/**
 * Drop the cached settings for a workspace (e.g. after editing on a settings
 * page). Next read triggers a refetch.
 */
export function invalidateWorkspaceSettings(workspaceId: string): void {
  cache.delete(workspaceId);
  inflight.delete(workspaceId);
  notify();
}

/**
 * Subscribe to per-workspace `workspace_settings`. Returns sane defaults
 * (entity noun "Account", all modules on) until the row resolves.
 */
export function useWorkspaceSettings(): WorkspaceSettings {
  const workspaceId = useCurrentWorkspaceId();
  const settings = useSyncExternalStore(
    subscribe,
    () => getSnapshotFor(workspaceId),
    () => DEFAULT_SETTINGS,
  );

  useEffect(() => {
    if (!workspaceId) return;
    loadIfNeeded(workspaceId);
  }, [workspaceId]);

  return settings;
}

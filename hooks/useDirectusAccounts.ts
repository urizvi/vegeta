'use client';

import { useEffect, useState } from 'react';
import { useTerritoryStore } from '@/store/territoryStore';
import {
  getAccounts,
  getFieldDefinitions,
  getMembers,
  getGeoNodes,
  getTeams,
  getHierarchyLevels,
  getPipelineStages,
  getContacts,
  getActivities,
  getTasks,
} from '@/lib/directus';
import { useAuth } from '@/hooks/useAuth';
import { useCurrentWorkspaceId } from '@/hooks/useCurrentWorkspaceId';
import { useEntitlements } from '@/hooks/useEntitlements';
import { shouldFetch } from '@/lib/hydrationPlan';
import { getEntitlementSnapshot } from '@/lib/entitlementsClient';

interface State {
  status: 'idle' | 'loading' | 'ready' | 'error' | 'unauthenticated';
  error: Error | null;
}

/**
 * Fetches accounts, field definitions, teams, the members mirror, and the geo
 * tree from Directus once on mount and hydrates the Zustand store. Every read
 * selector in the app continues to work unchanged — this hook is the only
 * write path for hydration.
 */
export function useDirectusAccounts(): State {
  const { status: authStatus } = useAuth();
  const workspaceId = useCurrentWorkspaceId();
  const { tasks: tasksEntitled, territory: territoryEntitled } = useEntitlements();
  const [fetchState, setFetchState] = useState<State>({ status: 'loading', error: null });

  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    if (!workspaceId) return; // Wait for the workspace resolver to settle.
    const ents = getEntitlementSnapshot(workspaceId);
    let cancelled = false;
    (async () => {
      try {
        const [accounts, fieldDefs, members, geo, teams, levels, stages, contacts, activities, tasks] = await Promise.all([
          getAccounts(),
          getFieldDefinitions(),
          getMembers(),
          // Geo is a newer collection; tolerate missing read permission so the
          // rest of the app still loads. Run scripts/bootstrap-directus.mjs to
          // grant access, then reload.
          (shouldFetch('geo_nodes', ents) ? getGeoNodes() : Promise.resolve({ nodes: [], order: [] })).catch((err: unknown) => {
            console.warn(
              '[directus] getGeoNodes failed — falling back to empty Geo tree. ' +
              'Re-run scripts/bootstrap-directus.mjs to grant geo_nodes permissions.',
              err,
            );
            return { nodes: [], order: [] };
          }),
          (shouldFetch('teams', ents) ? getTeams() : Promise.resolve({ teams: [], order: [] })).catch((err: unknown) => {
            console.warn(
              '[directus] getTeams failed — falling back to empty teams list. ' +
              'Re-run scripts/bootstrap-directus.mjs to create the teams collection.',
              err,
            );
            return { teams: [], order: [] };
          }),
          (shouldFetch('hierarchy_levels', ents) ? getHierarchyLevels() : Promise.resolve({ levels: [], order: [] })).catch((err: unknown) => {
            console.warn(
              '[directus] getHierarchyLevels failed — falling back to empty level set. ' +
              'Re-run scripts/bootstrap-directus.mjs to create the hierarchy_levels collection.',
              err,
            );
            return { levels: [], order: [] };
          }),
          getPipelineStages().catch((err: unknown) => {
            console.warn(
              '[directus] getPipelineStages failed — falling back to empty pipeline. ' +
              'Re-run scripts/bootstrap-directus.mjs to create the pipeline_stages collection.',
              err,
            );
            return { stages: [], order: [] };
          }),
          // Phase 3 collections: tolerate missing tables so pre-3.1 instances
          // keep loading. Re-run bootstrap to materialize.
          getContacts().catch((err: unknown) => {
            console.warn(
              '[directus] getContacts failed — falling back to empty contacts list. ' +
              'Re-run scripts/bootstrap-directus.mjs to create the contacts collection.',
              err,
            );
            return [];
          }),
          getActivities().catch((err: unknown) => {
            console.warn(
              '[directus] getActivities failed — falling back to empty activity list. ' +
              'Re-run scripts/bootstrap-directus.mjs to create the activities collection.',
              err,
            );
            return [];
          }),
          (shouldFetch('tasks', ents) ? getTasks() : Promise.resolve([])).catch((err: unknown) => {
            console.warn(
              '[directus] getTasks failed — falling back to empty tasks list. ' +
              'Re-run scripts/bootstrap-directus.mjs to create the tasks collection.',
              err,
            );
            return [];
          }),
        ]);
        if (cancelled) return;
        const {
          hydrateAccounts, hydrateFieldDefs, hydrateMembers, hydrateGeoNodes, hydrateTeams, hydrateLevels, hydrateStages,
          hydrateContacts, hydrateActivities, hydrateTasks,
        } = useTerritoryStore.getState();
        hydrateFieldDefs(fieldDefs);
        // Levels must hydrate before members so member.level ids resolve at first paint.
        hydrateLevels(levels.levels, levels.order);
        // Stages must hydrate before accounts so account.stageId resolves at first paint.
        hydrateStages(stages.stages, stages.order);
        // Teams must hydrate before members so memberIds reattach to the right teams.
        hydrateTeams(teams.teams, teams.order);
        hydrateMembers(members);
        hydrateAccounts(accounts);
        hydrateGeoNodes(geo.nodes, geo.order);
        // Phase 3: contacts/activities/tasks reference accounts.id, so they
        // hydrate after accounts. No FK enforcement in the store — selectors
        // tolerate dangling ids.
        hydrateContacts(contacts);
        hydrateActivities(activities);
        hydrateTasks(tasks);
        setFetchState({ status: 'ready', error: null });
      } catch (err) {
        if (cancelled) return;
        setFetchState({ status: 'error', error: err as Error });
      }
    })();
    return () => { cancelled = true; };
  }, [authStatus, workspaceId, tasksEntitled, territoryEntitled]);

  if (authStatus === 'unauthenticated') return { status: 'unauthenticated', error: null };
  if (authStatus === 'loading') return { status: 'loading', error: null };
  return fetchState;
}

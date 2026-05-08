import type { MapUiSlice } from './slices/mapUiSlice';
import type { TeamsSlice } from './slices/teamsSlice';
import type { MembersSlice } from './slices/membersSlice';
import type { RegionsSlice } from './slices/regionsSlice';
import type { SubregionsSlice } from './slices/subregionsSlice';
import type { AssignmentsSlice } from './slices/assignmentsSlice';
import type { GeoSlice } from './slices/geoSlice';
import type { AccountsSlice } from './slices/accountsSlice';
import type { HierarchyLevelsSlice } from './slices/hierarchyLevelsSlice';
import type { PipelineStagesSlice } from './slices/pipelineStagesSlice';
import type { ContactsSlice } from './slices/contactsSlice';
import type { ActivitiesSlice } from './slices/activitiesSlice';
import type { TasksSlice } from './slices/tasksSlice';
import type { SelectionSlice } from './slices/selectionSlice';

export interface RootActions {
  exportState: () => string;
  importState: (json: string) => void;
}

export type TerritoryStore =
  & MapUiSlice
  & TeamsSlice
  & MembersSlice
  & RegionsSlice
  & SubregionsSlice
  & AssignmentsSlice
  & GeoSlice
  & AccountsSlice
  & HierarchyLevelsSlice
  & PipelineStagesSlice
  & ContactsSlice
  & ActivitiesSlice
  & TasksSlice
  & SelectionSlice
  & RootActions;

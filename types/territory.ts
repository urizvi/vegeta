import type { MapThemeId } from '@/lib/mapThemes';
import type { FieldDefinition } from '@/lib/accountFields';
import type { Account } from './account';
export type { MapThemeId };
export type { Account };

/**
 * Foreign-key handle to an entry in `hierarchy_levels`. Post-1.1c this is a
 * uuid (the row's PK); the human-readable identifier lives on
 * `HierarchyLevelDef.slug` and is used for display only.
 */
export type HierarchyLevel = string;

export interface HierarchyLevelDef {
  id: string;     // uuid PK
  slug: string;   // human-readable identifier, unique per workspace
  label: string;  // display name
  color: string;  // hex e.g. "#e0e7ff"
  sort: number;   // ordering for column sequence in the org-grid table
}

export interface PipelineStage {
  id: string;     // uuid PK
  slug: string;   // human-readable identifier, unique per workspace
  label: string;  // display name
  color: string;  // hex
  sort: number;   // column order on the kanban
  isWon: boolean;
  isLost: boolean;
}

export interface Member {
  id: string;
  name: string;
  email: string;
  role: string;
  level: HierarchyLevel;
}

export interface SalesTeam {
  id: string;
  name: string;
  color: string; // hex e.g. "#3b82f6"
  memberIds: string[];
  parentId: string | null;     // null = root team
  leadMemberId: string | null; // designated lead; null = none assigned yet
}

export type CanonicalRegion = 'AMERICAS' | 'EMEA' | 'APAC' | 'LATAM' | 'MENA' | 'CUSTOM';

export interface Region {
  id: string;
  name: string;
  canonicalKey: CanonicalRegion;
  countryCodes: string[]; // ISO 3166-1 alpha-2
}

export interface Subregion {
  id: string;
  name: string;
  parentRegionId: string;
  stateCodes: string[]; // iso_3166_2 codes e.g. "US-CA", "GB-ENG"
  /** @deprecated Map coloring now flows through GeoNode. Field retained for one release while data migrates. */
  teamId: string | null;
}

export type AssignmentEntityType = 'country' | 'state';

export interface Assignment {
  id: string;
  entityType: AssignmentEntityType;
  entityCode: string; // ISO2 for country; "{countryISO2}:{stateCode}" for state
  entityName: string;
  /** @deprecated Map coloring now flows through GeoNode. Field retained for one release while data migrates. */
  teamId: string;
  assignedAt: number;
}

/**
 * GeoNode — node in the territory hierarchy that owns countries/states and provides map fill color.
 * Tree of arbitrary depth, reconstructed from `parentId` (null = root).
 */
export interface GeoNode {
  id: string;
  name: string;
  color: string | null;     // null = inherit from nearest ancestor with a color
  parentId: string | null;
  countryCodes: string[];   // ISO2 country codes directly assigned at this node
  stateCodes: string[];     // "US:US-CA"-format state codes directly assigned at this node
}

export interface TerritoryStoreState {
  // Persisted
  teams: Record<string, SalesTeam>;
  members: Record<string, Member>;
  regions: Record<string, Region>;
  subregions: Record<string, Subregion>;
  assignments: Record<string, Assignment>; // key = entityCode
  teamOrder: string[];
  regionOrder: string[];
  subregionOrder: string[];
  // Hierarchy levels (user-managed)
  hierarchyLevels: Record<string, HierarchyLevelDef>;
  hierarchyLevelOrder: string[];
  // Pipeline stages (user-managed)
  pipelineStages: Record<string, PipelineStage>;
  pipelineStageOrder: string[];
  // Geo hierarchy
  geoNodes: Record<string, GeoNode>;
  geoNodeOrder: string[];
  // Accounts
  accounts: Record<string, Account>;
  accountOrder: string[];
  fieldDefs: FieldDefinition[];
  showAccounts: boolean;
  mapAccountMetric: string; // field id or 'count'
  // UI-only
  activeView: 'map' | 'spreadsheet';
  activePaintGeoId: string | null;
  mapThemeId: MapThemeId;
  drillDownCountryCode: string | null;
  selectedEntityCode: string | null;
  hoveredEntityCode: string | null;
  hoveredEntityIso: string | null; // ISO2 or "US:US-CA" for account tooltip lookup
}

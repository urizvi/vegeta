export type HierarchyLevel = 'IC' | 'Lead' | 'Manager' | 'Director' | 'VP' | 'CRO';

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
}

export type CanonicalRegion = 'AMERICAS' | 'EMEA' | 'APAC' | 'LATAM' | 'MENA' | 'CUSTOM';

export interface Region {
  id: string;
  name: string;
  canonicalKey: CanonicalRegion;
  countryCodes: string[]; // ISO 3166-1 alpha-2
}

export type AssignmentEntityType = 'country' | 'state';

export interface Assignment {
  id: string;
  entityType: AssignmentEntityType;
  entityCode: string; // ISO2 for country; "{countryISO2}:{stateCode}" for state
  entityName: string;
  teamId: string;
  assignedAt: number;
}

export interface TerritoryStoreState {
  // Persisted
  teams: Record<string, SalesTeam>;
  members: Record<string, Member>;
  regions: Record<string, Region>;
  assignments: Record<string, Assignment>; // key = entityCode
  teamOrder: string[];
  regionOrder: string[];
  // UI-only
  activeView: 'map' | 'spreadsheet';
  drillDownCountryCode: string | null;
  selectedEntityCode: string | null;
  hoveredEntityCode: string | null;
}

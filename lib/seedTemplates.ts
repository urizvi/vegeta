/**
 * Seed templates — what a fresh workspace gets at creation time.
 *
 * Each template defines the full starter kit: workspace_settings (entity/owner
 * nouns + module flags), pipeline_stages, hierarchy_levels, and
 * field_definitions. `createWorkspace(name, templateId)` and the bootstrap
 * script's `seedWorkspaceDefaults` both consume from here.
 *
 * Adding a template: append to the union in `SeedTemplateId`, add an entry to
 * `SEED_TEMPLATES`, and mirror the constants in
 * `scripts/bootstrap-directus.mjs` (keep them in sync — `.mjs` can't import
 * `.ts` at runtime).
 */

import type { FieldDefinition, FieldEntity } from './accountFields';

export type SeedTemplateId = 'blank' | 'sales' | 'agency' | 'real-estate';

export interface PipelineStageSeed {
  slug: string;
  label: string;
  color: string;
  sort: number;
  is_won: boolean;
  is_lost: boolean;
}

export interface HierarchyLevelSeed {
  slug: string;
  label: string;
  color: string;
  sort: number;
}

export interface ModulesEnabledSeed {
  territory: boolean;
  contacts: boolean;
  activities: boolean;
  tasks: boolean;
}

export interface WorkspaceSettingsSeed {
  entity_noun_singular: string;
  entity_noun_plural: string;
  owner_noun: string;
  modules_enabled: ModulesEnabledSeed;
}

export interface SeedTemplate {
  id: SeedTemplateId;
  label: string;
  settings: WorkspaceSettingsSeed;
  stages: PipelineStageSeed[];
  levels: HierarchyLevelSeed[];
  fieldDefs: FieldDefSeed[];
}

export type FieldDefSeed = Omit<FieldDefinition, 'id' | 'entity'> & { entity?: FieldEntity };

const ALL_MODULES_ON: ModulesEnabledSeed = {
  territory: true,
  contacts: true,
  activities: true,
  tasks: true,
};

const TERRITORY_OFF: ModulesEnabledSeed = {
  territory: false,
  contacts: true,
  activities: true,
  tasks: true,
};

export const SEED_TEMPLATES: Record<SeedTemplateId, SeedTemplate> = {
  blank: {
    id: 'blank',
    label: 'Blank',
    settings: {
      entity_noun_singular: 'Record',
      entity_noun_plural: 'Records',
      owner_noun: 'Owner',
      modules_enabled: TERRITORY_OFF,
    },
    stages: [
      { slug: 'active',   label: 'Active',   color: '#dbeafe', sort: 0, is_won: false, is_lost: false },
      { slug: 'archived', label: 'Archived', color: '#e5e7eb', sort: 1, is_won: false, is_lost: false },
    ],
    levels: [
      { slug: 'ic',      label: 'IC',      color: '#e5e7eb', sort: 0 },
      { slug: 'manager', label: 'Manager', color: '#e0e7ff', sort: 1 },
    ],
    fieldDefs: [],
  },
  sales: {
    id: 'sales',
    label: 'Sales',
    settings: {
      entity_noun_singular: 'Account',
      entity_noun_plural: 'Accounts',
      owner_noun: 'Rep',
      modules_enabled: ALL_MODULES_ON,
    },
    stages: [
      { slug: 'prospect',    label: 'Prospect',    color: '#e5e7eb', sort: 0, is_won: false, is_lost: false },
      { slug: 'lead',        label: 'Lead',        color: '#dbeafe', sort: 1, is_won: false, is_lost: false },
      { slug: 'opportunity', label: 'Opportunity', color: '#fef3c7', sort: 2, is_won: false, is_lost: false },
      { slug: 'customer',    label: 'Customer',    color: '#dcfce7', sort: 3, is_won: true,  is_lost: false },
      { slug: 'churned',     label: 'Churned',     color: '#fee2e2', sort: 4, is_won: false, is_lost: true  },
    ],
    levels: [
      { slug: 'ic',       label: 'IC',       color: '#e5e7eb', sort: 0 },
      { slug: 'lead',     label: 'Lead',     color: '#dbeafe', sort: 1 },
      { slug: 'manager',  label: 'Manager',  color: '#e0e7ff', sort: 2 },
      { slug: 'director', label: 'Director', color: '#ede9fe', sort: 3 },
      { slug: 'vp',       label: 'VP',       color: '#fef3c7', sort: 4 },
      { slug: 'cro',      label: 'CRO',      color: '#fee2e2', sort: 5 },
    ],
    fieldDefs: [
      { label: 'Segment',   type: 'categorical', options: ['SMB', 'Mid-Market', 'Enterprise'], aliases: ['market segment', 'customer segment', 'company segment'] },
      { label: 'Industry',  type: 'categorical', options: ['SaaS', 'FinTech', 'Healthcare', 'E-commerce', 'Manufacturing', 'Education', 'Media', 'Government', 'Other'], aliases: ['vertical', 'sector', 'industry vertical'] },
      { label: 'Tier',      type: 'categorical', options: ['Tier 1', 'Tier 2', 'Tier 3', 'Untiered'], aliases: ['account tier', 'priority tier', 'customer tier'] },
      { label: 'ARR',       type: 'metric',      isCurrency: true, aliases: ['annual revenue', 'annual_revenue', 'contract value', 'acv', 'annual contract value'] },
      { label: 'MRR',       type: 'metric',      isCurrency: true, aliases: ['monthly revenue', 'monthly_revenue', 'monthly recurring revenue'] },
      { label: 'Headcount', type: 'metric',      aliases: ['employees', 'head count', 'employee count', 'num employees', 'company size'] },
    ],
  },
  agency: {
    id: 'agency',
    label: 'Agency',
    settings: {
      entity_noun_singular: 'Client',
      entity_noun_plural: 'Clients',
      owner_noun: 'Account Manager',
      modules_enabled: TERRITORY_OFF,
    },
    stages: [
      { slug: 'prospect',  label: 'Prospect',  color: '#e5e7eb', sort: 0, is_won: false, is_lost: false },
      { slug: 'pitching',  label: 'Pitching',  color: '#fef3c7', sort: 1, is_won: false, is_lost: false },
      { slug: 'active',    label: 'Active',    color: '#dcfce7', sort: 2, is_won: true,  is_lost: false },
      { slug: 'paused',    label: 'Paused',    color: '#fee2e2', sort: 3, is_won: false, is_lost: false },
      { slug: 'completed', label: 'Completed', color: '#dbeafe', sort: 4, is_won: true,  is_lost: false },
    ],
    levels: [
      { slug: 'am',       label: 'Account Manager', color: '#e5e7eb', sort: 0 },
      { slug: 'director', label: 'Director',        color: '#e0e7ff', sort: 1 },
      { slug: 'partner',  label: 'Partner',         color: '#fef3c7', sort: 2 },
    ],
    fieldDefs: [
      { label: 'Industry',     type: 'categorical', options: ['SaaS', 'CPG', 'Financial Services', 'Healthcare', 'Retail', 'Other'] },
      { label: 'Service Type', type: 'categorical', options: ['Branding', 'Performance', 'Creative', 'Strategy', 'Full-service'] },
      { label: 'Retainer',     type: 'metric',      isCurrency: true },
    ],
  },
  'real-estate': {
    id: 'real-estate',
    label: 'Real Estate',
    settings: {
      entity_noun_singular: 'Property',
      entity_noun_plural: 'Properties',
      owner_noun: 'Agent',
      modules_enabled: ALL_MODULES_ON,
    },
    stages: [
      { slug: 'listed',         label: 'Listed',         color: '#dbeafe', sort: 0, is_won: false, is_lost: false },
      { slug: 'showing',        label: 'Showing',        color: '#fef3c7', sort: 1, is_won: false, is_lost: false },
      { slug: 'under-contract', label: 'Under Contract', color: '#e0e7ff', sort: 2, is_won: false, is_lost: false },
      { slug: 'sold',           label: 'Sold',           color: '#dcfce7', sort: 3, is_won: true,  is_lost: false },
      { slug: 'withdrawn',      label: 'Withdrawn',      color: '#fee2e2', sort: 4, is_won: false, is_lost: true  },
    ],
    levels: [
      { slug: 'agent',  label: 'Agent',  color: '#e5e7eb', sort: 0 },
      { slug: 'broker', label: 'Broker', color: '#e0e7ff', sort: 1 },
      { slug: 'owner',  label: 'Owner',  color: '#fef3c7', sort: 2 },
    ],
    fieldDefs: [
      { label: 'Property Type', type: 'categorical', options: ['Single Family', 'Condo', 'Townhouse', 'Multi-Family', 'Commercial', 'Land'] },
      { label: 'List Price',    type: 'metric',      isCurrency: true },
      { label: 'Bedrooms',      type: 'metric' },
      { label: 'Bathrooms',     type: 'metric' },
      { label: 'Square Feet',   type: 'metric' },
    ],
  },
};

export function getSeedTemplate(id: SeedTemplateId): SeedTemplate {
  return SEED_TEMPLATES[id];
}

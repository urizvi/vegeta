import { parseNumber } from '@/lib/csvParser';
import { resolveCountryIso2 } from '@/lib/countryNameToIso2';
import { normalizeOption, type FieldDefinition, type FieldType } from '@/lib/accountFields';
import { inferField } from '@/lib/fileParser';

export const NAME_ALIASES    = ['name', 'account', 'company', 'account name', 'company name', 'account_name', 'company_name'];
export const COUNTRY_ALIASES = ['country', 'country code', 'country_code', 'iso2', 'iso'];
export const STATE_ALIASES   = ['state', 'province', 'state/province', 'state_province'];
export const GEO_ALIASES     = ['geo', 'geo node', 'geo_node', 'territory', 'geography', 'region group'];
export const REP_ALIASES     = ['rep', 'sales rep', 'owner', 'account owner', 'assigned to', 'assigned_to', 'sales_rep'];

export type ColumnRole      = 'name' | 'country' | 'state' | 'geo' | 'rep' | 'field' | 'skip';
export type FieldTypeChoice = 'text' | 'number' | 'currency' | 'dropdown';

export interface ColumnConfig {
  role: ColumnRole;
  /** Required when role === 'field'. */
  type?: FieldTypeChoice;
  /** When role === 'field' and header matches an existing fieldDef, lock to it. */
  existingFieldId?: string;
}

export type ColumnConfigMap = Record<string, ColumnConfig>;

export interface PreviewRow {
  name: string;
  country: string;
  countryIso2: string | null;
  firstFieldVal: string;
  valid: boolean;
}

export interface ImportRow {
  name: string;
  country?: string;
  state?: string;
  geoNodeId?: string | null;
  repId: string | null;
  fields: Record<string, string | number>;
}

// ── Type-choice <-> FieldDefinition conversion ────────────────────────────────

export function fieldTypeChoiceFromDef(def: { type: FieldType; isCurrency?: boolean }): FieldTypeChoice {
  if (def.type === 'metric')      return def.isCurrency ? 'currency' : 'number';
  if (def.type === 'categorical') return 'dropdown';
  return 'text';
}

function uniqueOptions(rows: Record<string, string>[], header: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const row of rows) {
    const v = (row[header] ?? '').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// ── Default inference ─────────────────────────────────────────────────────────

const ROLE_ALIASES: Record<'name' | 'country' | 'state' | 'geo' | 'rep', string[]> = {
  name:    NAME_ALIASES,
  country: COUNTRY_ALIASES,
  state:   STATE_ALIASES,
  geo:     GEO_ALIASES,
  rep:     REP_ALIASES,
};

/** Suggest a {role, type, existingFieldId} for every header. Caller may override. */
export function inferDefaultConfigs(
  headers: string[],
  rows: Record<string, string>[],
  fieldDefs: FieldDefinition[],
): ColumnConfigMap {
  const used = new Set<string>();
  const configs: ColumnConfigMap = {};
  const sample = rows.slice(0, 100);

  for (const header of headers) {
    const h = header.toLowerCase().trim();

    // Critical role first (one column per role)
    let role: ColumnRole | null = null;
    for (const r of ['name', 'country', 'state', 'geo', 'rep'] as const) {
      if (!used.has(r) && ROLE_ALIASES[r].includes(h)) { role = r; break; }
    }
    if (role) { configs[header] = { role }; used.add(role); continue; }

    // Existing field def match (label, id, or saved alias) → lock to it
    const existing = fieldDefs.find(
      (d) =>
        d.label.toLowerCase() === h ||
        d.id.toLowerCase() === h ||
        (d.aliases?.includes(h) ?? false),
    );
    if (existing) {
      configs[header] = {
        role: 'field',
        type: fieldTypeChoiceFromDef(existing),
        existingFieldId: existing.id,
      };
      continue;
    }

    // New field — type suggested by inference
    const values = sample.map((r) => r[h] ?? '');
    const inferred = inferField(header, values);
    configs[header] = { role: 'field', type: fieldTypeChoiceFromDef(inferred) };
  }
  return configs;
}

// ── Validation ────────────────────────────────────────────────────────────────

export interface ConfigValidation {
  ok: boolean;
  missing: ('name')[];
  duplicateRoles: string[];
}

export function validateConfigs(configs: ColumnConfigMap): ConfigValidation {
  const counts: Record<string, number> = { name: 0, country: 0, state: 0, geo: 0, rep: 0 };
  for (const cfg of Object.values(configs)) {
    if (cfg.role in counts) counts[cfg.role]++;
  }
  const missing: ('name')[] = [];
  if (counts.name === 0) missing.push('name');
  const duplicateRoles = Object.entries(counts).filter(([, n]) => n > 1).map(([r]) => r);
  return { ok: missing.length === 0 && duplicateRoles.length === 0, missing, duplicateRoles };
}

// ── Materialise configs → FieldDefinitions to add ────────────────────────────

export interface NewFieldDefSpec {
  header: string;
  def: Omit<FieldDefinition, 'id'>;
}

export function configsToNewFieldDefs(
  configs: ColumnConfigMap,
  rows: Record<string, string>[],
): NewFieldDefSpec[] {
  const out: NewFieldDefSpec[] = [];
  for (const [header, cfg] of Object.entries(configs)) {
    if (cfg.role !== 'field' || cfg.existingFieldId || !cfg.type) continue;
    const h = header.toLowerCase().trim();
    if (cfg.type === 'text') {
      out.push({ header, def: { label: header, type: 'text', entity: 'account' } });
    } else if (cfg.type === 'number') {
      out.push({ header, def: { label: header, type: 'metric', isCurrency: false, entity: 'account' } });
    } else if (cfg.type === 'currency') {
      out.push({ header, def: { label: header, type: 'metric', isCurrency: true, entity: 'account' } });
    } else if (cfg.type === 'dropdown') {
      out.push({ header, def: { label: header, type: 'categorical', options: uniqueOptions(rows, h), entity: 'account' } });
    }
  }
  return out;
}

/** Existing fieldDefs not referenced by any config — candidates for removal. */
export function getOrphanFieldDefs(
  configs: ColumnConfigMap,
  fieldDefs: FieldDefinition[],
): FieldDefinition[] {
  const used = new Set<string>();
  for (const cfg of Object.values(configs)) {
    if (cfg.role === 'field' && cfg.existingFieldId) used.add(cfg.existingFieldId);
  }
  return fieldDefs.filter((d) => !used.has(d.id));
}

// ── Build colMap from configs (after fieldDefs are updated in store) ─────────

export function buildColMapFromConfigs(
  configs: ColumnConfigMap,
  fieldDefs: FieldDefinition[],
): Record<string, string> {
  const map: Record<string, string> = { name: '', country: '', state: '', geo: '', rep: '' };
  for (const [header, cfg] of Object.entries(configs)) {
    if (cfg.role === 'name' || cfg.role === 'country' || cfg.role === 'state' || cfg.role === 'geo' || cfg.role === 'rep') {
      map[cfg.role] = header;
    } else if (cfg.role === 'field') {
      let id = cfg.existingFieldId;
      if (!id) {
        const h = header.toLowerCase().trim();
        const def = fieldDefs.find(
          (d) => d.label.toLowerCase() === h || (d.aliases?.includes(h) ?? false),
        );
        if (def) id = def.id;
      }
      if (id) map[id] = header;
    }
  }
  return map;
}

// ── Preview / import row builders (unchanged) ────────────────────────────────

export function buildPreviewRows(
  rows: Record<string, string>[],
  colMap: Record<string, string>,
  fieldDefs: FieldDefinition[],
): PreviewRow[] {
  const firstDef = fieldDefs[0];
  return rows.slice(0, 200).map((row) => {
    const name        = colMap.name    ? (row[colMap.name]    ?? '') : '';
    const rawCountry  = colMap.country ? (row[colMap.country] ?? '') : '';
    const countryIso2 = resolveCountryIso2(rawCountry);
    const firstFieldVal = firstDef && colMap[firstDef.id] ? (row[colMap[firstDef.id]] ?? '') : '';
    return { name, country: rawCountry, countryIso2, firstFieldVal, valid: !!name };
  });
}

export function buildImportRows(
  rows: Record<string, string>[],
  colMap: Record<string, string>,
  fieldDefs: FieldDefinition[],
  membersByNameEmail: Record<string, string>,
  geosByName: Record<string, string> = {},
): ImportRow[] {
  return rows.flatMap((row) => {
    const name        = colMap.name    ? (row[colMap.name]    ?? '') : '';
    const rawCountry  = colMap.country ? (row[colMap.country] ?? '') : '';
    const countryIso2 = resolveCountryIso2(rawCountry);
    if (!name) return [];

    const rawState = colMap.state ? (row[colMap.state] ?? '') : '';
    const state    = countryIso2 && rawState
      ? `${countryIso2}:${rawState.trim().toUpperCase()}`
      : undefined;

    const repRaw = colMap.rep ? (row[colMap.rep] ?? '').toLowerCase() : '';
    const repId  = repRaw ? (membersByNameEmail[repRaw] ?? null) : null;

    const geoRaw    = colMap.geo ? (row[colMap.geo] ?? '').trim().toLowerCase() : '';
    const geoNodeId = geoRaw ? (geosByName[geoRaw] ?? null) : null;

    const fields: Record<string, string | number> = {};
    fieldDefs.forEach((def) => {
      const header = colMap[def.id] ?? '';
      const rawVal = header ? (row[header] ?? '') : '';
      if (def.type === 'metric') {
        fields[def.id] = rawVal ? parseNumber(rawVal) : 0;
      } else if (def.type === 'categorical') {
        fields[def.id] = rawVal
          ? normalizeOption(rawVal, def.options ?? [], def.options?.[0] ?? '')
          : (def.options?.[0] ?? '');
      } else {
        fields[def.id] = rawVal;
      }
    });

    return [{ name: name.trim(), country: countryIso2 ?? undefined, state, geoNodeId, repId, fields }];
  });
}

import type { TerritoryStoreState, GeoNode, Member, SalesTeam } from '@/types/territory';
import { teamDescendantsOf } from '@/lib/teamTree';
import { defaultColorForGeoId } from '@/lib/territoryPalette';

export type EntityTeamIndex = Record<string, string>;
export type EntityGeoIndex = Record<string, string>;

export interface EntityStats {
  count: number;
  byField: Record<string, number>;
}
export type AccountStatsByEntity = Record<string, EntityStats>;

function computeEntityTeamIndex(s: TerritoryStoreState): EntityTeamIndex {
  const idx: EntityTeamIndex = {};

  // State codes ("US:US-CA") — populated from subregion stateCodes; first subregion (by order) wins.
  for (const sid of s.subregionOrder) {
    const sub = s.subregions[sid];
    if (!sub?.teamId) continue;
    for (const code of sub.stateCodes) {
      if (idx[code] === undefined) idx[code] = sub.teamId;
    }
  }

  // Country priority 1: any subregion with at least one state inside this country.
  for (const sid of s.subregionOrder) {
    const sub = s.subregions[sid];
    if (!sub?.teamId) continue;
    for (const code of sub.stateCodes) {
      const country = code.split(':')[0];
      if (country && idx[country] === undefined) idx[country] = sub.teamId;
    }
  }

  // Country priority 2: region rollup — first subregion with a team inside the same region.
  const regionTeam: Record<string, string> = {};
  for (const sid of s.subregionOrder) {
    const sub = s.subregions[sid];
    if (!sub?.teamId) continue;
    if (regionTeam[sub.parentRegionId] === undefined) regionTeam[sub.parentRegionId] = sub.teamId;
  }
  for (const rid of s.regionOrder) {
    const region = s.regions[rid];
    const teamId = regionTeam[rid];
    if (!region || !teamId) continue;
    for (const country of region.countryCodes) {
      if (idx[country] === undefined) idx[country] = teamId;
    }
  }

  // Country priority 3: direct entity assignment.
  for (const code in s.assignments) {
    if (idx[code] === undefined) idx[code] = s.assignments[code].teamId;
  }

  return idx;
}

function computeAccountStats(s: TerritoryStoreState): AccountStatsByEntity {
  const byEntity: AccountStatsByEntity = {};
  const metricIds = s.fieldDefs.filter((f) => f.type === 'metric').map((f) => f.id);

  function bucket(key: string): EntityStats {
    let b = byEntity[key];
    if (!b) {
      const byField: Record<string, number> = {};
      metricIds.forEach((fid) => { byField[fid] = 0; });
      b = byEntity[key] = { count: 0, byField };
    }
    return b;
  }

  for (const aid of s.accountOrder) {
    const a = s.accounts[aid];
    if (!a || !a.country) continue;
    const c = bucket(a.country);
    c.count++;
    for (const fid of metricIds) c.byField[fid] += Number(a.fields[fid]) || 0;
    if (a.state) {
      const sb = bucket(a.state);
      sb.count++;
      for (const fid of metricIds) sb.byField[fid] += Number(a.fields[fid]) || 0;
    }
  }
  return byEntity;
}

// Module-level memoization on source slice references. A single store instance
// means a single cache; selectors re-run cheaply when refs are unchanged.

let teKey: unknown[] | null = null;
let teValue: EntityTeamIndex = {};
export function getEntityTeamIndex(s: TerritoryStoreState): EntityTeamIndex {
  const k = [s.subregions, s.subregionOrder, s.regions, s.regionOrder, s.assignments];
  if (teKey && k.every((v, i) => v === teKey![i])) return teValue;
  teKey = k;
  teValue = computeEntityTeamIndex(s);
  return teValue;
}

let asKey: unknown[] | null = null;
let asValue: AccountStatsByEntity = {};
export function getAccountStatsByEntity(s: TerritoryStoreState): AccountStatsByEntity {
  const k = [s.accounts, s.accountOrder, s.fieldDefs];
  if (asKey && k.every((v, i) => v === asKey![i])) return asValue;
  asKey = k;
  asValue = computeAccountStats(s);
  return asValue;
}

// ── Geo entity index ─────────────────────────────────────────────────────────
// For each entity code (country ISO2 or "{country}:{state}"), returns the
// owning GeoNode id. Resolution priority:
//   1. Direct state assignment on a GeoNode.
//   2. Direct country assignment on a GeoNode.
//   3. For a state code: the country's owning node (i.e. inherit from country).
// Geo node ordering breaks ties (first-by-order wins).

function computeEntityGeoIndex(s: TerritoryStoreState): EntityGeoIndex {
  const idx: EntityGeoIndex = {};

  // Pass 1: direct state assignments.
  for (const id of s.geoNodeOrder) {
    const n = s.geoNodes[id];
    if (!n) continue;
    for (const code of n.stateCodes) {
      if (idx[code] === undefined) idx[code] = id;
    }
  }

  // Pass 2: direct country assignments.
  for (const id of s.geoNodeOrder) {
    const n = s.geoNodes[id];
    if (!n) continue;
    for (const code of n.countryCodes) {
      if (idx[code] === undefined) idx[code] = id;
    }
  }

  // Pass 3: states inherit from their country if not directly assigned.
  // (We can only fill states we've already seen referenced — which in the map
  // happens at render time via lookup, so no eager fill is needed here.)

  return idx;
}

let geKey: unknown[] | null = null;
let geValue: EntityGeoIndex = {};
export function getEntityGeoIndex(s: TerritoryStoreState): EntityGeoIndex {
  const k = [s.geoNodes, s.geoNodeOrder];
  if (geKey && k.every((v, i) => v === geKey![i])) return geValue;
  geKey = k;
  geValue = computeEntityGeoIndex(s);
  return geValue;
}

/**
 * Returns the effective color for an entity by resolving:
 *   entity → owning GeoNode → walk up parents until a node has a color.
 * Returns null if the entity is unassigned or no ancestor has a color.
 *
 * For state codes, falls back to the parent country's owning node when the
 * state itself has no direct assignment.
 */
export function getEntityGeoColor(s: TerritoryStoreState, entityCode: string): string | null {
  const idx = getEntityGeoIndex(s);
  let nodeId = idx[entityCode];
  if (!nodeId && entityCode.includes(':')) {
    // Inherit from country
    const country = entityCode.split(':')[0];
    nodeId = idx[country];
  }
  if (!nodeId) return null;
  return resolveGeoColor(s.geoNodes, nodeId);
}

function resolveGeoColor(nodes: Record<string, GeoNode>, startId: string): string | null {
  let cur: string | null = startId;
  let rootId = startId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const n: GeoNode | undefined = nodes[cur];
    if (!n) return null;
    if (n.color) return n.color;
    rootId = cur;
    cur = n.parentId;
  }
  // No ancestor has an explicit color — derive a stable default from the
  // top-most ancestor so all descendants of the same root share a hue.
  return defaultColorForGeoId(rootId);
}

export function getEntityMetricVal(stats: EntityStats | undefined, metric: string): number {
  if (!stats) return 0;
  if (metric === 'count') return stats.count;
  return stats.byField[metric] ?? 0;
}

// ── Account roll-ups by member / team ────────────────────────────────────────

export type AccountsByMember = Record<string, string[]>;

function computeAccountsByMember(s: TerritoryStoreState): AccountsByMember {
  const idx: AccountsByMember = {};
  for (const aid of s.accountOrder) {
    const a = s.accounts[aid];
    if (!a?.repId) continue;
    (idx[a.repId] ??= []).push(aid);
  }
  return idx;
}

let abmKey: unknown[] | null = null;
let abmValue: AccountsByMember = {};
export function getAccountsByMember(s: TerritoryStoreState): AccountsByMember {
  const k = [s.accounts, s.accountOrder];
  if (abmKey && k.every((v, i) => v === abmKey![i])) return abmValue;
  abmKey = k;
  abmValue = computeAccountsByMember(s);
  return abmValue;
}

// memberId → teamId (the team that owns this member)
type MemberTeamIndex = Record<string, string>;

function computeMemberTeamIndex(s: TerritoryStoreState): MemberTeamIndex {
  const idx: MemberTeamIndex = {};
  for (const tid of s.teamOrder) {
    const t = s.teams[tid];
    if (!t) continue;
    for (const mid of t.memberIds) idx[mid] = tid;
  }
  return idx;
}

let mtiKey: unknown[] | null = null;
let mtiValue: MemberTeamIndex = {};
function getMemberTeamIndex(s: TerritoryStoreState): MemberTeamIndex {
  const k = [s.teams, s.teamOrder];
  if (mtiKey && k.every((v, i) => v === mtiKey![i])) return mtiValue;
  mtiKey = k;
  mtiValue = computeMemberTeamIndex(s);
  return mtiValue;
}

/**
 * Returns the owner chain for a rep: [rep, lead-of-rep's-team, lead-of-parent-team, …, root-lead].
 * Skips a level if the rep IS the team's lead, to avoid duplicates.
 * Returns an empty array if repId is null/missing.
 */
export function getOwnerChain(s: TerritoryStoreState, repId: string | null): Member[] {
  if (!repId) return [];
  const rep = s.members[repId];
  if (!rep) return [];
  const out: Member[] = [rep];
  const memberTeam = getMemberTeamIndex(s);
  let teamId: string | null = memberTeam[repId] ?? null;
  const seenTeams = new Set<string>();
  let lastEmitted = repId;
  while (teamId && !seenTeams.has(teamId)) {
    seenTeams.add(teamId);
    const team: SalesTeam | undefined = s.teams[teamId];
    if (!team) break;
    if (team.leadMemberId && team.leadMemberId !== lastEmitted) {
      const lead = s.members[team.leadMemberId];
      if (lead) {
        out.push(lead);
        lastEmitted = lead.id;
      }
    }
    teamId = team.parentId;
  }
  return out;
}

export interface RollupCount {
  direct: number;
  total: number;
}

function computeAccountCountByTeam(s: TerritoryStoreState): Record<string, RollupCount> {
  const accountsByMember = getAccountsByMember(s);
  // direct count per team = sum of accounts owned by members of that team
  const direct: Record<string, number> = {};
  for (const tid of s.teamOrder) {
    const t = s.teams[tid];
    if (!t) continue;
    let n = 0;
    for (const mid of t.memberIds) n += accountsByMember[mid]?.length ?? 0;
    direct[tid] = n;
  }
  // total = sum over self + descendants
  const out: Record<string, RollupCount> = {};
  for (const tid of s.teamOrder) {
    const desc = teamDescendantsOf(s.teams, tid);
    let total = 0;
    desc.forEach((d) => { total += direct[d] ?? 0; });
    out[tid] = { direct: direct[tid] ?? 0, total };
  }
  return out;
}

let actKey: unknown[] | null = null;
let actValue: Record<string, RollupCount> = {};
export function getAccountCountByTeam(s: TerritoryStoreState): Record<string, RollupCount> {
  const k = [s.accounts, s.accountOrder, s.teams, s.teamOrder];
  if (actKey && k.every((v, i) => v === actKey![i])) return actValue;
  actKey = k;
  actValue = computeAccountCountByTeam(s);
  return actValue;
}

function computeAccountCountByMember(s: TerritoryStoreState): Record<string, RollupCount> {
  const accountsByMember = getAccountsByMember(s);
  const out: Record<string, RollupCount> = {};

  for (const mid of Object.keys(s.members)) {
    const direct = accountsByMember[mid]?.length ?? 0;
    let total = direct;

    // A rep R rolls up to M iff M appears in R's owner chain — i.e. M is the lead
    // of R's team or any ancestor team. So: for every team M leads, count accounts
    // of all members in that team and every descendant team (excluding M's own
    // direct accounts to avoid double-counting).
    const ledTeams = s.teamOrder.filter((tid) => s.teams[tid]?.leadMemberId === mid);
    const rolledTeams = new Set<string>();
    for (const lt of ledTeams) {
      teamDescendantsOf(s.teams, lt).forEach((d) => rolledTeams.add(d));
    }
    for (const tid of rolledTeams) {
      const t = s.teams[tid];
      if (!t) continue;
      for (const otherMid of t.memberIds) {
        if (otherMid === mid) continue;
        total += accountsByMember[otherMid]?.length ?? 0;
      }
    }

    out[mid] = { direct, total };
  }
  return out;
}

let acmKey: unknown[] | null = null;
let acmValue: Record<string, RollupCount> = {};
export function getAccountCountByMember(s: TerritoryStoreState): Record<string, RollupCount> {
  const k = [s.accounts, s.accountOrder, s.teams, s.teamOrder, s.members];
  if (acmKey && k.every((v, i) => v === acmKey![i])) return acmValue;
  acmKey = k;
  acmValue = computeAccountCountByMember(s);
  return acmValue;
}

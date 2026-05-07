export interface Account {
  id: string;
  name: string;
  country?: string;  // ISO2 — optional; if absent the account doesn't show on the map
  state?: string;    // "US:US-CA"
  geoNodeId?: string | null; // direct, most-granular Geo assignment; otherwise inferred from country/state
  repId: string | null;
  /** Pipeline stage slug (FK to pipeline_stages.id). Null = unstaged. */
  stageId: string | null;
  fields: Record<string, string | number>;
}

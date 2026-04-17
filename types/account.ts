export interface Account {
  id: string;
  name: string;
  country: string;   // ISO2
  state?: string;    // "US:US-CA"
  repId: string | null;
  fields: Record<string, string | number>;
}

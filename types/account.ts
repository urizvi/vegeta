export interface Account {
  id: string;
  name: string;
  country: string; // ISO2 code (normalized on import)
  state?: string;  // "US:US-CA" format — optional
  arr: number;     // 0 if not provided
}

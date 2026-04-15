import type {
  AccountStage, AccountSegment, AccountTier, AccountIndustry, MapAccountMetric,
} from '@/lib/accountFields';

export type { AccountStage, AccountSegment, AccountTier, AccountIndustry, MapAccountMetric };

export interface Account {
  id: string;
  name: string;
  country: string;   // ISO2
  state?: string;    // "US:US-CA"
  // Metrics
  arr:       number;
  mrr:       number;
  headcount: number;
  // Categories (predetermined dropdown values)
  industry: AccountIndustry;
  stage:    AccountStage;
  segment:  AccountSegment;
  tier:     AccountTier;
  // Assignment
  repId: string | null;
}

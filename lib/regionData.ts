import type { CanonicalRegion } from '@/types/territory';

// ISO 3166-1 alpha-2 → canonical region
export const ISO2_TO_REGION: Record<string, CanonicalRegion> = {
  // Americas (North + Central)
  US: 'AMERICAS', CA: 'AMERICAS', MX: 'AMERICAS', GT: 'AMERICAS', BZ: 'AMERICAS',
  SV: 'AMERICAS', HN: 'AMERICAS', NI: 'AMERICAS', CR: 'AMERICAS', PA: 'AMERICAS',
  CU: 'AMERICAS', JM: 'AMERICAS', HT: 'AMERICAS', DO: 'AMERICAS', PR: 'AMERICAS',
  TT: 'AMERICAS', BB: 'AMERICAS', LC: 'AMERICAS', VC: 'AMERICAS', GD: 'AMERICAS',
  AG: 'AMERICAS', DM: 'AMERICAS', KN: 'AMERICAS', BS: 'AMERICAS',
  // LATAM (South America)
  BR: 'LATAM', AR: 'LATAM', CL: 'LATAM', CO: 'LATAM', VE: 'LATAM', PE: 'LATAM',
  EC: 'LATAM', BO: 'LATAM', PY: 'LATAM', UY: 'LATAM', GY: 'LATAM', SR: 'LATAM',
  // EMEA — Europe
  GB: 'EMEA', DE: 'EMEA', FR: 'EMEA', IT: 'EMEA', ES: 'EMEA', PT: 'EMEA',
  NL: 'EMEA', BE: 'EMEA', LU: 'EMEA', CH: 'EMEA', AT: 'EMEA', SE: 'EMEA',
  NO: 'EMEA', DK: 'EMEA', FI: 'EMEA', IS: 'EMEA', IE: 'EMEA', PL: 'EMEA',
  CZ: 'EMEA', SK: 'EMEA', HU: 'EMEA', RO: 'EMEA', BG: 'EMEA', HR: 'EMEA',
  SI: 'EMEA', RS: 'EMEA', BA: 'EMEA', ME: 'EMEA', MK: 'EMEA', AL: 'EMEA',
  GR: 'EMEA', CY: 'EMEA', MT: 'EMEA', EE: 'EMEA', LV: 'EMEA', LT: 'EMEA',
  UA: 'EMEA', MD: 'EMEA', BY: 'EMEA', RU: 'EMEA', TR: 'EMEA', GE: 'EMEA',
  AM: 'EMEA', AZ: 'EMEA',
  // EMEA — Africa
  ZA: 'EMEA', NG: 'EMEA', EG: 'EMEA', KE: 'EMEA', GH: 'EMEA', ET: 'EMEA',
  TZ: 'EMEA', UG: 'EMEA', RW: 'EMEA', MZ: 'EMEA', ZM: 'EMEA', ZW: 'EMEA',
  AO: 'EMEA', CM: 'EMEA', CI: 'EMEA', SN: 'EMEA', ML: 'EMEA', BF: 'EMEA',
  NE: 'EMEA', TD: 'EMEA', SD: 'EMEA', SO: 'EMEA', LY: 'EMEA', TN: 'EMEA',
  DZ: 'EMEA', MA: 'EMEA', MG: 'EMEA',
  // MENA
  SA: 'MENA', AE: 'MENA', QA: 'MENA', KW: 'MENA', BH: 'MENA', OM: 'MENA',
  YE: 'MENA', IQ: 'MENA', IR: 'MENA', SY: 'MENA', LB: 'MENA', JO: 'MENA',
  IL: 'MENA', PS: 'MENA',
  // APAC
  CN: 'APAC', JP: 'APAC', KR: 'APAC', IN: 'APAC', AU: 'APAC', NZ: 'APAC',
  ID: 'APAC', MY: 'APAC', SG: 'APAC', TH: 'APAC', VN: 'APAC', PH: 'APAC',
  MM: 'APAC', KH: 'APAC', LA: 'APAC', BD: 'APAC', PK: 'APAC', LK: 'APAC',
  NP: 'APAC', MN: 'APAC', KZ: 'APAC', UZ: 'APAC', TW: 'APAC', HK: 'APAC',
  MO: 'APAC', FJ: 'APAC', PG: 'APAC', SB: 'APAC', VU: 'APAC',
};

export const REGION_LABELS: Record<CanonicalRegion, string> = {
  AMERICAS: 'Americas',
  LATAM: 'Latin America',
  EMEA: 'EMEA',
  MENA: 'MENA',
  APAC: 'APAC',
  CUSTOM: 'Custom',
};

export const BUILT_IN_REGIONS: Array<{ key: CanonicalRegion; name: string; countryCodes: string[] }> = (
  ['AMERICAS', 'LATAM', 'EMEA', 'MENA', 'APAC'] as CanonicalRegion[]
).map((key) => ({
  key,
  name: REGION_LABELS[key],
  countryCodes: Object.entries(ISO2_TO_REGION)
    .filter(([, r]) => r === key)
    .map(([iso]) => iso),
}));

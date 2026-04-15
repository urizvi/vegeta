/**
 * Case-insensitive country name / alias → ISO2 lookup.
 * Used when importing CSVs where the country column contains full names.
 */
const NAME_MAP: Record<string, string> = {
  'afghanistan': 'AF', 'albania': 'AL', 'algeria': 'DZ', 'andorra': 'AD',
  'angola': 'AO', 'antigua and barbuda': 'AG', 'argentina': 'AR', 'armenia': 'AM',
  'australia': 'AU', 'austria': 'AT', 'azerbaijan': 'AZ',
  'bahamas': 'BS', 'the bahamas': 'BS', 'bahrain': 'BH', 'bangladesh': 'BD',
  'barbados': 'BB', 'belarus': 'BY', 'belgium': 'BE', 'belize': 'BZ', 'benin': 'BJ',
  'bhutan': 'BT', 'bolivia': 'BO', 'bosnia and herzegovina': 'BA', 'botswana': 'BW',
  'brazil': 'BR', 'brasil': 'BR', 'brunei': 'BN', 'brunei darussalam': 'BN',
  'bulgaria': 'BG', 'burkina faso': 'BF', 'burundi': 'BI',
  'cabo verde': 'CV', 'cape verde': 'CV', 'cambodia': 'KH', 'cameroon': 'CM',
  'canada': 'CA', 'central african republic': 'CF', 'chad': 'TD', 'chile': 'CL',
  'china': 'CN', "people's republic of china": 'CN', 'prc': 'CN',
  'colombia': 'CO', 'comoros': 'KM', 'congo': 'CG', 'democratic republic of the congo': 'CD',
  'dr congo': 'CD', 'drc': 'CD', 'costa rica': 'CR', 'croatia': 'HR', 'cuba': 'CU',
  'cyprus': 'CY', 'czech republic': 'CZ', 'czechia': 'CZ',
  'denmark': 'DK', 'djibouti': 'DJ', 'dominica': 'DM', 'dominican republic': 'DO',
  'ecuador': 'EC', 'egypt': 'EG', 'el salvador': 'SV', 'equatorial guinea': 'GQ',
  'eritrea': 'ER', 'estonia': 'EE', 'eswatini': 'SZ', 'swaziland': 'SZ',
  'ethiopia': 'ET',
  'fiji': 'FJ', 'finland': 'FI', 'france': 'FR',
  'gabon': 'GA', 'gambia': 'GM', 'the gambia': 'GM', 'georgia': 'GE', 'germany': 'DE',
  'ghana': 'GH', 'greece': 'GR', 'grenada': 'GD', 'guatemala': 'GT', 'guinea': 'GN',
  'guinea-bissau': 'GW', 'guyana': 'GY',
  'haiti': 'HT', 'honduras': 'HN', 'hungary': 'HU',
  'iceland': 'IS', 'india': 'IN', 'indonesia': 'ID', 'iran': 'IR',
  'islamic republic of iran': 'IR', 'iraq': 'IQ', 'ireland': 'IE', 'israel': 'IL',
  'italy': 'IT',
  'jamaica': 'JM', 'japan': 'JP', 'jordan': 'JO',
  'kazakhstan': 'KZ', 'kenya': 'KE', 'kiribati': 'KI', 'kosovo': 'XK',
  'kuwait': 'KW', 'kyrgyzstan': 'KG',
  'laos': 'LA', "lao people's democratic republic": 'LA', 'latvia': 'LV', 'lebanon': 'LB',
  'lesotho': 'LS', 'liberia': 'LR', 'libya': 'LY', 'liechtenstein': 'LI',
  'lithuania': 'LT', 'luxembourg': 'LU',
  'madagascar': 'MG', 'malawi': 'MW', 'malaysia': 'MY', 'maldives': 'MV', 'mali': 'ML',
  'malta': 'MT', 'marshall islands': 'MH', 'mauritania': 'MR', 'mauritius': 'MU',
  'mexico': 'MX', 'méxico': 'MX', 'micronesia': 'FM', 'moldova': 'MD', 'monaco': 'MC',
  'mongolia': 'MN', 'montenegro': 'ME', 'morocco': 'MA', 'mozambique': 'MZ',
  'myanmar': 'MM', 'burma': 'MM',
  'namibia': 'NA', 'nauru': 'NR', 'nepal': 'NP', 'netherlands': 'NL', 'holland': 'NL',
  'new zealand': 'NZ', 'nicaragua': 'NI', 'niger': 'NE', 'nigeria': 'NG',
  'north korea': 'KP', "democratic people's republic of korea": 'KP',
  'north macedonia': 'MK', 'macedonia': 'MK', 'norway': 'NO',
  'oman': 'OM',
  'pakistan': 'PK', 'palau': 'PW', 'palestine': 'PS', 'panama': 'PA',
  'papua new guinea': 'PG', 'paraguay': 'PY', 'peru': 'PE', 'philippines': 'PH',
  'poland': 'PL', 'portugal': 'PT',
  'qatar': 'QA',
  'romania': 'RO', 'russia': 'RU', 'russian federation': 'RU', 'rwanda': 'RW',
  'saint kitts and nevis': 'KN', 'saint lucia': 'LC',
  'saint vincent and the grenadines': 'VC', 'samoa': 'WS', 'san marino': 'SM',
  'sao tome and principe': 'ST', 'saudi arabia': 'SA', 'senegal': 'SN', 'serbia': 'RS',
  'seychelles': 'SC', 'sierra leone': 'SL', 'singapore': 'SG', 'slovakia': 'SK',
  'slovenia': 'SI', 'solomon islands': 'SB', 'somalia': 'SO', 'south africa': 'ZA',
  'south korea': 'KR', 'republic of korea': 'KR', 'south sudan': 'SS', 'spain': 'ES',
  'sri lanka': 'LK', 'sudan': 'SD', 'suriname': 'SR', 'sweden': 'SE', 'switzerland': 'CH',
  'syria': 'SY', 'syrian arab republic': 'SY',
  'taiwan': 'TW', 'republic of china': 'TW', 'tajikistan': 'TJ', 'tanzania': 'TZ',
  'thailand': 'TH', 'timor-leste': 'TL', 'east timor': 'TL', 'togo': 'TG', 'tonga': 'TO',
  'trinidad and tobago': 'TT', 'tunisia': 'TN', 'turkey': 'TR', 'türkiye': 'TR',
  'turkmenistan': 'TM', 'tuvalu': 'TV',
  'uganda': 'UG', 'ukraine': 'UA', 'united arab emirates': 'AE', 'uae': 'AE',
  'united kingdom': 'GB', 'uk': 'GB', 'great britain': 'GB', 'england': 'GB',
  'united states': 'US', 'united states of america': 'US', 'usa': 'US', 'u.s.': 'US',
  'u.s.a.': 'US', 'america': 'US', 'uruguay': 'UY', 'uzbekistan': 'UZ',
  'vanuatu': 'VU', 'vatican city': 'VA', 'holy see': 'VA',
  'venezuela': 'VE', 'vietnam': 'VN', 'viet nam': 'VN',
  'yemen': 'YE',
  'zambia': 'ZM', 'zimbabwe': 'ZW',
};

/**
 * Resolve a country string (ISO2 code or display name) to an uppercase ISO2 code.
 * Returns null if unrecognised.
 */
export function resolveCountryIso2(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Already an ISO2 code (2 uppercase letters)
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();

  // ISO3 codes — map common ones
  const iso3: Record<string, string> = {
    USA: 'US', GBR: 'GB', DEU: 'DE', FRA: 'FR', CAN: 'CA', AUS: 'AU',
    CHN: 'CN', JPN: 'JP', IND: 'IN', BRA: 'BR', RUS: 'RU', KOR: 'KR',
    MEX: 'MX', IDN: 'ID', SAU: 'SA', TUR: 'TR', NLD: 'NL', CHE: 'CH',
    ARG: 'AR', SWE: 'SE', NOR: 'NO', DNK: 'DK', FIN: 'FI', POL: 'PL',
    ESP: 'ES', ITA: 'IT', PRT: 'PT', BEL: 'BE', AUT: 'AT', NZL: 'NZ',
    ZAF: 'ZA', EGY: 'EG', NGA: 'NG', KEN: 'KE', SGP: 'SG', MYS: 'MY',
    THA: 'TH', VNM: 'VN', PHL: 'PH', PAK: 'PK', BGD: 'BD', UKR: 'UA',
    IRN: 'IR', IRQ: 'IQ', ISR: 'IL', ARE: 'AE', QAT: 'QA', KWT: 'KW',
  };
  if (/^[A-Za-z]{3}$/.test(trimmed)) {
    const mapped = iso3[trimmed.toUpperCase()];
    if (mapped) return mapped;
  }

  // Name lookup
  return NAME_MAP[trimmed.toLowerCase()] ?? null;
}

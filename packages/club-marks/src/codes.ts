/**
 * Three-letter club codes (spec step 3): an override, else the club's standard
 * abbreviation — the broadcast codes for well-known clubs, else a rule. Codes must
 * be unique within a season book; duplicates go to review. Client-safe.
 */

/** Standard abbreviations a rule would get wrong, keyed by a name stripped of accents and case. */
const STANDARD: Record<string, string> = {
  'manchester united': 'MUN', 'manchester city': 'MCI', 'tottenham hotspur': 'TOT', 'west ham united': 'WHU',
  'west bromwich albion': 'WBA', 'wolverhampton wanderers': 'WOL', 'sheffield united': 'SHU', 'sheffield wednesday': 'SHW',
  'queens park rangers': 'QPR', 'nottingham forest': 'NFO', 'crystal palace': 'CRY', 'aston villa': 'AVL',
  'real madrid': 'RMA', 'atletico madrid': 'ATM', 'athletic bilbao': 'ATH', 'real sociedad': 'RSO', 'real betis': 'BET',
  'real zaragoza': 'ZAR', 'zaragoza': 'ZAR', 'deportivo la coruna': 'DEP', 'racing santander': 'RAC', 'rayo vallecano': 'RAY',
  'celta vigo': 'CEL', 'real murcia': 'MUR', 'real valladolid': 'VLL', 'valladolid': 'VLL', 'espanyol': 'ESP', 'real mallorca': 'MLL', 'mallorca': 'MLL',
  'internazionale': 'INT', 'inter milan': 'INT', 'milan': 'MIL', 'ac milan': 'MIL', 'roma': 'ROM', 'lazio': 'LAZ',
  'bayern munich': 'BAY', 'borussia dortmund': 'BVB', 'borussia monchengladbach': 'BMG', 'bayer leverkusen': 'B04',
  'hamburger sv': 'HSV', 'werder bremen': 'SVW', 'schalke 04': 'S04', 'vfb stuttgart': 'VFB', 'vfl wolfsburg': 'WOB',
  'hertha bsc': 'BSC', 'hansa rostock': 'FCH', '1860 munchen': 'M60', '1. fc kaiserslautern': 'FCK', '1. fc koln': 'KOE',
  '1. fc nurnberg': 'FCN', 'eintracht frankfurt': 'SGE', 'sc freiburg': 'SCF', 'vfl bochum': 'BOC', 'hannover 96': 'H96',
  'paris saint-germain': 'PSG', 'olympique lyonnais': 'LYO', 'olympique de marseille': 'MAR', 'as monaco': 'ASM',
  'girondins de bordeaux': 'BOR', 'losc lille metropole': 'LIL', 'rc lens': 'RCL', 'stade rennais': 'REN', 'fc nantes': 'NAN',
}

const STRIP = /^(1\.|fc|cf|afc|sc|ac|as|ss|us|sv|vfl|vfb|tsg|rc|rcd|cd|ud|sd|ca|ad|sl|sk|fk|nk|hnk|ks|ogc|aj|ea|losc|sco|ssc|acf|bsv|spvgg|fsv|tsv|sv)$/i
const GENERIC = /^(united|city|town|county|rovers|athletic|wanderers|albion|hotspur|fc|f\.c\.|calcio|club|de|del|la|le|les|di|the|and|&|cf|sc)$/i

export const nameKey = (name: string) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/** The standard code for a club name: the list above, else the first distinctive word's first three letters. */
export function standardCode(name: string): string {
  const known = STANDARD[nameKey(name)]
  if (known) return known
  const words = nameKey(name).replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  const distinctive = words.filter(w => !STRIP.test(w) && !GENERIC.test(w) && !/^\d+$/.test(w))
  const pick = distinctive[0] ?? words.find(w => !/^\d+$/.test(w)) ?? 'clb'
  return pick.replace(/[^a-z]/g, '').padEnd(3, 'x').slice(0, 3).toUpperCase()
}

export function isValidCode(code: string): boolean {
  return /^[A-Z0-9]{2,3}$/.test(code)
}

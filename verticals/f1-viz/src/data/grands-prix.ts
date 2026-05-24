/**
 * Bundled Grand Prix palette for f1:race-card. Maps a GP slug (or display
 * name like "Monaco Grand Prix") to its host country, ISO-3166-1 alpha-2
 * code, circuit name, and an accent color used for card chrome.
 *
 * Flags are sourced from flagcdn.com (CC0 / public-domain SVG/PNG set)
 * via `flagUrl(code)` so we don't have to bundle binary assets.
 */

export interface GrandPrixEntry {
  /** Display name, e.g. "Monaco Grand Prix". */
  name: string
  /** Host country display name. */
  country: string
  /** ISO-3166-1 alpha-2 lowercase, used as the flagcdn slug. */
  code: string
  /** Circuit name, shown in the kicker line on portrait/horizontal layouts. */
  circuit: string
  /** Accent hex used for the card border, score text, and watermark fill. */
  accent: string
}

export const GRANDS_PRIX: Record<string, GrandPrixEntry> = {
  bahrain: {
    name: 'Bahrain Grand Prix',
    country: 'Bahrain',
    code: 'bh',
    circuit: 'Bahrain International Circuit',
    accent: '#E10600',
  },
  'saudi-arabian': {
    name: 'Saudi Arabian Grand Prix',
    country: 'Saudi Arabia',
    code: 'sa',
    circuit: 'Jeddah Corniche Circuit',
    accent: '#00A859',
  },
  australian: {
    name: 'Australian Grand Prix',
    country: 'Australia',
    code: 'au',
    circuit: 'Albert Park Circuit',
    accent: '#00843D',
  },
  japanese: {
    name: 'Japanese Grand Prix',
    country: 'Japan',
    code: 'jp',
    circuit: 'Suzuka International Racing Course',
    accent: '#BC002D',
  },
  chinese: {
    name: 'Chinese Grand Prix',
    country: 'China',
    code: 'cn',
    circuit: 'Shanghai International Circuit',
    accent: '#DE2910',
  },
  miami: {
    name: 'Miami Grand Prix',
    country: 'United States',
    code: 'us',
    circuit: 'Miami International Autodrome',
    accent: '#FF1493',
  },
  'emilia-romagna': {
    name: 'Emilia Romagna Grand Prix',
    country: 'Italy',
    code: 'it',
    circuit: 'Autodromo Enzo e Dino Ferrari',
    accent: '#008C45',
  },
  monaco: {
    name: 'Monaco Grand Prix',
    country: 'Monaco',
    code: 'mc',
    circuit: 'Circuit de Monaco',
    accent: '#CE1126',
  },
  canadian: {
    name: 'Canadian Grand Prix',
    country: 'Canada',
    code: 'ca',
    circuit: 'Circuit Gilles Villeneuve',
    accent: '#FF0000',
  },
  spanish: {
    name: 'Spanish Grand Prix',
    country: 'Spain',
    code: 'es',
    circuit: 'Circuit de Barcelona-Catalunya',
    accent: '#AA151B',
  },
  // Some seasons OpenF1 publishes the Catalunya round as "Barcelona Grand
  // Prix" rather than "Spanish Grand Prix" — alias to the same circuit/flag/
  // accent so the calendar row still gets country chrome.
  barcelona: {
    name: 'Barcelona Grand Prix',
    country: 'Spain',
    code: 'es',
    circuit: 'Circuit de Barcelona-Catalunya',
    accent: '#AA151B',
  },
  austrian: {
    name: 'Austrian Grand Prix',
    country: 'Austria',
    code: 'at',
    circuit: 'Red Bull Ring',
    accent: '#ED2939',
  },
  british: {
    name: 'British Grand Prix',
    country: 'United Kingdom',
    code: 'gb',
    circuit: 'Silverstone Circuit',
    accent: '#012169',
  },
  hungarian: {
    name: 'Hungarian Grand Prix',
    country: 'Hungary',
    code: 'hu',
    circuit: 'Hungaroring',
    accent: '#CE2939',
  },
  belgian: {
    name: 'Belgian Grand Prix',
    country: 'Belgium',
    code: 'be',
    circuit: 'Circuit de Spa-Francorchamps',
    accent: '#FAE042',
  },
  dutch: {
    name: 'Dutch Grand Prix',
    country: 'Netherlands',
    code: 'nl',
    circuit: 'Circuit Zandvoort',
    accent: '#FF6900',
  },
  italian: {
    name: 'Italian Grand Prix',
    country: 'Italy',
    code: 'it',
    circuit: 'Autodromo Nazionale Monza',
    accent: '#008C45',
  },
  azerbaijan: {
    name: 'Azerbaijan Grand Prix',
    country: 'Azerbaijan',
    code: 'az',
    circuit: 'Baku City Circuit',
    accent: '#00B5E2',
  },
  singapore: {
    name: 'Singapore Grand Prix',
    country: 'Singapore',
    code: 'sg',
    circuit: 'Marina Bay Street Circuit',
    accent: '#ED2939',
  },
  'united-states': {
    name: 'United States Grand Prix',
    country: 'United States',
    code: 'us',
    circuit: 'Circuit of the Americas',
    accent: '#B22234',
  },
  'mexico-city': {
    name: 'Mexico City Grand Prix',
    country: 'Mexico',
    code: 'mx',
    circuit: 'Autódromo Hermanos Rodríguez',
    accent: '#006847',
  },
  'sao-paulo': {
    name: 'São Paulo Grand Prix',
    country: 'Brazil',
    code: 'br',
    circuit: 'Autódromo José Carlos Pace',
    accent: '#009B3A',
  },
  'las-vegas': {
    name: 'Las Vegas Grand Prix',
    country: 'United States',
    code: 'us',
    circuit: 'Las Vegas Strip Circuit',
    accent: '#FFB81C',
  },
  qatar: {
    name: 'Qatar Grand Prix',
    country: 'Qatar',
    code: 'qa',
    circuit: 'Lusail International Circuit',
    accent: '#8A1538',
  },
  'abu-dhabi': {
    name: 'Abu Dhabi Grand Prix',
    country: 'United Arab Emirates',
    code: 'ae',
    circuit: 'Yas Marina Circuit',
    accent: '#00732F',
  },
}

/** Slugify a GP display name so YAML can pass `grandPrix: "Monaco Grand Prix"`. */
function gpSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/\bgrand prix\b/g, '')
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export function findGrandPrix(slugOrName: string): GrandPrixEntry | null {
  const direct = GRANDS_PRIX[slugOrName]
  if (direct) return direct
  return GRANDS_PRIX[gpSlug(slugOrName)] ?? null
}

/** flagcdn.com URL — CC0 / public-domain flags, no API key needed. */
export function flagUrl(code: string, width: 80 | 160 | 320 | 640 = 320): string {
  return `https://flagcdn.com/w${width}/${code.toLowerCase()}.png`
}

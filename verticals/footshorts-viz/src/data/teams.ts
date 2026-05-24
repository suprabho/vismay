/**
 * Bundled team palette for fs:match-card. Maps slugs to display name, primary
 * brand color, and a short monogram for the inline-SVG crest placeholder.
 *
 * Keeping crests inline (rather than fetching from a third-party CDN) gives
 * the card a deterministic look in catalog previews, social-share renders,
 * and offline dev. Authors can still override per-fixture via YAML
 * (`homeColor`, `awayColor`, `homeCrestUrl`, `awayCrestUrl`).
 */

export interface TeamEntry {
  name: string
  /** Display name preferred for tight layouts (e.g. "Man City", "PSG"). Falls back to `name`. */
  shortName?: string
  /** Primary brand hex. Used for background fills + accents. */
  color: string
  /** Secondary brand hex, for two-tone treatments (text-on-color, stripes). */
  secondary: string
  /** 2–3 char monogram drawn into the crest placeholder. */
  monogram: string
}

export const TEAMS: Record<string, TeamEntry> = {
  arsenal: { name: 'Arsenal', color: '#EF0107', secondary: '#FFFFFF', monogram: 'AFC' },
  chelsea: { name: 'Chelsea', color: '#034694', secondary: '#FFFFFF', monogram: 'CFC' },
  liverpool: { name: 'Liverpool', color: '#C8102E', secondary: '#F6EB61', monogram: 'LFC' },
  'manchester-city': {
    name: 'Manchester City',
    shortName: 'Man City',
    color: '#6CABDD',
    secondary: '#1C2C5B',
    monogram: 'MCI',
  },
  'manchester-united': {
    name: 'Manchester United',
    shortName: 'Man Utd',
    color: '#DA291C',
    secondary: '#FBE122',
    monogram: 'MUN',
  },
  tottenham: { name: 'Tottenham Hotspur', shortName: 'Tottenham', color: '#132257', secondary: '#FFFFFF', monogram: 'TOT' },
  'real-madrid': {
    name: 'Real Madrid',
    shortName: 'Madrid',
    color: '#FEBE10',
    secondary: '#00529F',
    monogram: 'RMA',
  },
  barcelona: { name: 'FC Barcelona', shortName: 'Barça', color: '#A50044', secondary: '#004D98', monogram: 'FCB' },
  'atletico-madrid': {
    name: 'Atlético Madrid',
    shortName: 'Atléti',
    color: '#CB3524',
    secondary: '#FFFFFF',
    monogram: 'ATM',
  },
  psg: { name: 'Paris Saint-Germain', shortName: 'PSG', color: '#004170', secondary: '#DA291C', monogram: 'PSG' },
  bayern: {
    name: 'Bayern Munich',
    shortName: 'Bayern',
    color: '#DC052D',
    secondary: '#0066B2',
    monogram: 'FCB',
  },
  juventus: { name: 'Juventus', color: '#000000', secondary: '#FFFFFF', monogram: 'JUV' },
  inter: { name: 'Inter Milan', color: '#0068A8', secondary: '#000000', monogram: 'INT' },
  milan: { name: 'AC Milan', color: '#FB090B', secondary: '#000000', monogram: 'ACM' },
  napoli: { name: 'Napoli', color: '#12A0D7', secondary: '#FFFFFF', monogram: 'NAP' },
  dortmund: {
    name: 'Borussia Dortmund',
    color: '#FDE100',
    secondary: '#000000',
    monogram: 'BVB',
  },
  ajax: { name: 'Ajax', color: '#D2122E', secondary: '#FFFFFF', monogram: 'AJX' },
  porto: { name: 'FC Porto', color: '#004A99', secondary: '#FFFFFF', monogram: 'POR' },
  benfica: { name: 'Benfica', color: '#E20020', secondary: '#FFFFFF', monogram: 'SLB' },
}

/** Slugify a display name so YAML can pass `home: "Arsenal"` and we still find the entry. */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** Lookup with display-name fallback. Returns `null` if no bundled entry matches. */
export function findTeam(slugOrName: string): TeamEntry | null {
  const direct = TEAMS[slugOrName]
  if (direct) return direct
  const slug = slugify(slugOrName)
  return TEAMS[slug] ?? null
}

/** Resolve the display color for a team — YAML override wins, then bundled, then fallback. */
export function resolveTeamColor(slugOrName: string, override?: string): string {
  if (override) return override
  return findTeam(slugOrName)?.color ?? '#404040'
}

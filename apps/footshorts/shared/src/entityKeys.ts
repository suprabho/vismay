/**
 * Entity-name keys shared by everything that has to match a club/league label
 * from one provider against our `entities` rows:
 *
 *   - the worker's entity resolver (Gemini article tags, theanalyst labels),
 *   - the admin's ESPN cup fixtures (ESPN display names → entity crest/color),
 *   - the story hydrator (author-typed YAML like `home: Spurs`).
 *
 * Before this lived here, each caller slugified on its own and only the worker
 * knew the aliases — so a card written as `Tottenham` never found
 * `tottenham-hotspur` and fell through to the bundled palette. Keep the alias
 * table in one place so a fix for one caller fixes them all.
 */

/** Lowercase, strip accents, collapse non-alphanumerics to single dashes. The
 * same rule `entity_aliases.alias_slug` is stored with. */
export function normalizeEntityKey(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Common aliases — extend as you find misses in the worker's [entity-miss] logs.
// Slugs on the right must match canonical entity slugs produced by seed.ts commonName().
export const ENTITY_ALIASES: Record<string, string> = {
  // teams — English
  'man-utd': 'manchester-united',
  'man-united': 'manchester-united',
  'man-city': 'manchester-city',
  'spurs': 'tottenham-hotspur',
  'tottenham': 'tottenham-hotspur',
  'wolves': 'wolverhampton-wanderers',
  'brighton': 'brighton-hove-albion',
  // teams — Spanish
  'barca': 'barcelona',
  'real': 'real-madrid',
  'atleti': 'club-atletico-de-madrid',
  'atletico': 'club-atletico-de-madrid',
  'atletico-madrid': 'club-atletico-de-madrid',
  'betis': 'real-betis-balompie',
  // teams — German
  'bayern': 'bayern-munchen',
  'bayern-munich': 'bayern-munchen',
  // teams — Italian
  'juve': 'juventus',
  'inter': 'internazionale-milano',
  'inter-milan': 'internazionale-milano',
  'verona': 'hellas-verona',
  // official forms with glued acronyms, in case Gemini echoes them verbatim
  'acf-fiorentina': 'fiorentina',
  'atalanta-bc': 'atalanta',
  'genoa-cfc': 'genoa',
  // teams — French
  'psg': 'paris-saint-germain',
  'paris-sg': 'paris-saint-germain',   // theanalyst.com's spelling
  'lyon': 'olympique-lyonnais',
  'marseille': 'olympique-de-marseille',
  // teams — theanalyst.com's Championship short forms (verified live 2026-09-09;
  // these have no token in common with the official name, so per-word
  // teamKeyVariants can't bridge them)
  'qpr': 'queens-park-rangers',
  'sheff-utd': 'sheffield-united',
  'sheff-wed': 'sheffield-wednesday',
  'bristol-c': 'bristol-city',
  'west-brom': 'west-bromwich-albion',
  'nottm-forest': 'nottingham-forest',
  // teams — long official names → common names
  'sporting': 'sporting-clube-de-portugal',   // theanalyst.com's "Sporting"; "sporting" alone is a noise token in teamKeyVariants
  'newcastle': 'newcastle-united',
  'real-betis': 'real-betis-balompie',
  // leagues — renames Gemini uses vs official seed names
  'epl': 'premier-league',
  'ucl': 'champions-league',
  'uel': 'europa-league',
  'la-liga': 'primera-division',
  'laliga': 'primera-division',
  'euros': 'european-championship',
  'euro': 'european-championship',
  'world-cup': 'fifa-world-cup',     // seed stores "FIFA World Cup"; Gemini says "World Cup"
  'brasileirao': 'campeonato-brasileiro-serie-a',
  'serie-a': 'serie-a',
  'ligue-1': 'ligue-1',
  'bundesliga': 'bundesliga',
};

/** Strip the official "FC"/"AFC" club affix that football-data.org names carry
 * ("Sunderland AFC", "AFC Bournemouth") and that seed.ts commonName() drops
 * from the slug. */
function stripClubAffix(slug: string): string {
  return slug.replace(/^a?fc-/, '').replace(/-a?fc$/, '');
}

// Normalization + alias mapping for callers that compare team labels from two
// providers directly (e.g. theanalyst match discovery matching scraped team
// names against fixtures) — both sides of a comparison collapse to one key.
export function canonicalTeamKey(name: string): string {
  const slug = stripClubAffix(normalizeEntityKey(name));
  return ENTITY_ALIASES[slug] ?? slug;
}

/**
 * Every `entities.slug` a team label could be stored under, most literal
 * first: the label as typed ("tottenham-hotspur-fc"), with the club affix
 * dropped ("tottenham-hotspur"), and the alias of either ("spurs" →
 * "tottenham-hotspur"). Callers query `entities` with `slug in (...)` and take
 * the first candidate that exists, so a literal hit always beats an alias.
 */
export function teamLookupSlugs(name: string): string[] {
  const raw = normalizeEntityKey(name);
  const stripped = stripClubAffix(raw);
  const out: string[] = [];
  for (const key of [raw, stripped, ENTITY_ALIASES[raw], ENTITY_ALIASES[stripped]]) {
    if (key && !out.includes(key)) out.push(key);
  }
  return out;
}

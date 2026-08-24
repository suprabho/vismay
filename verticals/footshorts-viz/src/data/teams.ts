/**
 * Bundled team palette for fs:* modules. Maps slugs to display name, primary
 * brand color, a short monogram for the inline-SVG crest placeholder, and an
 * optional crest image URL.
 *
 * The monogram keeps a deterministic look in catalog previews, social-share
 * renders, and offline dev. When a `crest` URL is present it's used as the
 * real badge (with the monogram as the load-failure fallback — see Crest.tsx).
 * Crest URLs come from football-data.org, the same source the live Footshorts
 * worker seeds `entities.crest_url` from. Authors can still override per-fixture
 * via YAML (`homeColor`, `awayColor`, `homeCrestUrl`, `awayCrestUrl`).
 *
 * NOTE: the football-data.org team ids below are best-effort and should be
 * reconciled against the live `entities` table; a wrong id degrades to the
 * monogram (Crest.tsx handles the <img> onError), never a broken image.
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
  /** Optional crest image URL (football-data.org). Monogram is the fallback. */
  crest?: string
}

/** football-data.org public crest CDN. */
const fd = (id: number) => `https://crests.football-data.org/${id}.png`

/** flagcdn.com flag URL (CC0, same source as f1-viz) — national teams badge
 *  with their flag, not a crest; football-data.org serves national "crests"
 *  inconsistently (.svg only, some 404). Codes are ISO-3166-1 alpha-2 plus
 *  flagcdn's gb-eng/gb-sct/gb-wls subdivisions. */
const flag = (code: string) => `https://flagcdn.com/w320/${code}.png`

export const TEAMS: Record<string, TeamEntry> = {
  arsenal: { name: 'Arsenal', color: '#EF0107', secondary: '#FFFFFF', monogram: 'AFC', crest: fd(57) },
  chelsea: { name: 'Chelsea', color: '#034694', secondary: '#FFFFFF', monogram: 'CFC', crest: fd(61) },
  liverpool: { name: 'Liverpool', color: '#C8102E', secondary: '#F6EB61', monogram: 'LFC', crest: fd(64) },
  'manchester-city': {
    name: 'Manchester City',
    shortName: 'Man City',
    color: '#6CABDD',
    secondary: '#1C2C5B',
    monogram: 'MCI',
    crest: fd(65),
  },
  'manchester-united': {
    name: 'Manchester United',
    shortName: 'Man Utd',
    color: '#DA291C',
    secondary: '#FBE122',
    monogram: 'MUN',
    crest: fd(66),
  },
  tottenham: { name: 'Tottenham Hotspur', shortName: 'Tottenham', color: '#132257', secondary: '#FFFFFF', monogram: 'TOT', crest: fd(73) },
  'real-madrid': {
    name: 'Real Madrid',
    shortName: 'Madrid',
    color: '#FEBE10',
    secondary: '#00529F',
    monogram: 'RMA',
    crest: fd(86),
  },
  barcelona: { name: 'FC Barcelona', shortName: 'Barça', color: '#A50044', secondary: '#004D98', monogram: 'BAR', crest: fd(81) },
  'atletico-madrid': {
    name: 'Atlético Madrid',
    shortName: 'Atléti',
    color: '#CB3524',
    secondary: '#FFFFFF',
    monogram: 'ATM',
    crest: fd(78),
  },
  psg: { name: 'Paris Saint-Germain', shortName: 'PSG', color: '#004170', secondary: '#DA291C', monogram: 'PSG', crest: fd(524) },
  monaco: { name: 'AS Monaco', shortName: 'Monaco', color: '#CE3524', secondary: '#FFFFFF', monogram: 'ASM', crest: fd(548) },
  bayern: {
    name: 'Bayern Munich',
    shortName: 'Bayern',
    color: '#DC052D',
    secondary: '#0066B2',
    monogram: 'FCB',
    crest: fd(5),
  },
  leverkusen: { name: 'Bayer Leverkusen', shortName: 'Leverkusen', color: '#E32219', secondary: '#000000', monogram: 'B04', crest: fd(3) },
  dortmund: {
    name: 'Borussia Dortmund',
    shortName: 'Dortmund',
    color: '#FDE100',
    secondary: '#000000',
    monogram: 'BVB',
    crest: fd(4),
  },
  juventus: { name: 'Juventus', color: '#000000', secondary: '#FFFFFF', monogram: 'JUV', crest: fd(109) },
  inter: { name: 'Inter Milan', shortName: 'Inter', color: '#0068A8', secondary: '#000000', monogram: 'INT', crest: fd(108) },
  milan: { name: 'AC Milan', shortName: 'Milan', color: '#FB090B', secondary: '#000000', monogram: 'ACM', crest: fd(98) },
  napoli: { name: 'Napoli', color: '#12A0D7', secondary: '#FFFFFF', monogram: 'NAP', crest: fd(113) },
  atalanta: { name: 'Atalanta', color: '#1E71B8', secondary: '#000000', monogram: 'ATA', crest: fd(102) },
  newcastle: { name: 'Newcastle United', shortName: 'Newcastle', color: '#241F20', secondary: '#FFFFFF', monogram: 'NEW', crest: fd(67) },
  'aston-villa': { name: 'Aston Villa', shortName: 'Villa', color: '#670E36', secondary: '#95BFE5', monogram: 'AVL', crest: fd(58) },
  brighton: { name: 'Brighton & Hove Albion', shortName: 'Brighton', color: '#0057B8', secondary: '#FFFFFF', monogram: 'BHA', crest: fd(397) },
  fulham: { name: 'Fulham', color: '#000000', secondary: '#FFFFFF', monogram: 'FUL', crest: fd(63) },
  'west-ham': { name: 'West Ham United', shortName: 'West Ham', color: '#7A263A', secondary: '#1BB1E7', monogram: 'WHU', crest: fd(563) },
  everton: { name: 'Everton', color: '#003399', secondary: '#FFFFFF', monogram: 'EVE', crest: fd(62) },
  'crystal-palace': { name: 'Crystal Palace', shortName: 'Palace', color: '#1B458F', secondary: '#C4122E', monogram: 'CRY', crest: fd(354) },
  bournemouth: { name: 'AFC Bournemouth', shortName: 'Bournemouth', color: '#DA291C', secondary: '#000000', monogram: 'BOU', crest: fd(1044) },
  leeds: { name: 'Leeds United', shortName: 'Leeds', color: '#1D428A', secondary: '#FFCD00', monogram: 'LEE', crest: fd(341) },
  brentford: { name: 'Brentford', color: '#E30613', secondary: '#FFFFFF', monogram: 'BRE', crest: fd(402) },
  sunderland: { name: 'Sunderland', color: '#EB172B', secondary: '#FFFFFF', monogram: 'SUN', crest: fd(71) },
  'nottingham-forest': { name: 'Nottingham Forest', shortName: 'Forest', color: '#DD0000', secondary: '#FFFFFF', monogram: 'NFO', crest: fd(351) },
  wolves: { name: 'Wolverhampton Wanderers', shortName: 'Wolves', color: '#FDB913', secondary: '#231F20', monogram: 'WOL', crest: fd(76) },
  burnley: { name: 'Burnley', color: '#6C1D45', secondary: '#99D6EA', monogram: 'BUR', crest: fd(328) },
  brest: { name: 'Stade Brestois', shortName: 'Brest', color: '#E2001A', secondary: '#FFFFFF', monogram: 'BRE', crest: fd(512) },
  lille: { name: 'Lille', color: '#E01E13', secondary: '#FFFFFF', monogram: 'LIL', crest: fd(521) },
  ajax: { name: 'Ajax', color: '#D2122E', secondary: '#FFFFFF', monogram: 'AJX', crest: fd(678) },
  psv: { name: 'PSV Eindhoven', shortName: 'PSV', color: '#ED1C24', secondary: '#FFFFFF', monogram: 'PSV', crest: fd(674) },
  feyenoord: { name: 'Feyenoord', color: '#E20E0E', secondary: '#FFFFFF', monogram: 'FEY', crest: fd(675) },
  porto: { name: 'FC Porto', color: '#004A99', secondary: '#FFFFFF', monogram: 'POR', crest: fd(503) },
  benfica: { name: 'Benfica', color: '#E20020', secondary: '#FFFFFF', monogram: 'SLB', crest: fd(1903) },
  sporting: { name: 'Sporting CP', shortName: 'Sporting', color: '#008057', secondary: '#FFFFFF', monogram: 'SCP', crest: fd(498) },
  'club-brugge': { name: 'Club Brugge', shortName: 'Brugge', color: '#0066B3', secondary: '#000000', monogram: 'CLB', crest: fd(851) },
  celtic: { name: 'Celtic', color: '#018749', secondary: '#FFFFFF', monogram: 'CEL', crest: fd(732) },

  // ——— League blocks below cover every competition the footshorts worker seeds
  // (top-5 leagues, Eredivisie, Primeira Liga, EFL Championship, Brazil Série A),
  // as the union of the 2025-26 and 2026-27 rosters (2025 + 2026 for Brazil).
  // Entries without `crest` are clubs whose football-data.org id we haven't
  // verified — they render the monogram (a wrong id could show another club's
  // badge, which is worse) until an id is confirmed or Supabase hydration
  // supplies the crest in production.

  // La Liga
  espanyol: { name: 'Espanyol', color: '#007FC8', secondary: '#FFFFFF', monogram: 'RCD', crest: fd(80) },
  sevilla: { name: 'Sevilla', color: '#D8121A', secondary: '#FFFFFF', monogram: 'SEV', crest: fd(559) },
  'real-betis': { name: 'Real Betis', shortName: 'Betis', color: '#00954C', secondary: '#FFFFFF', monogram: 'BET', crest: fd(90) },
  'real-sociedad': { name: 'Real Sociedad', shortName: 'La Real', color: '#0067B1', secondary: '#FFFFFF', monogram: 'RSO', crest: fd(92) },
  'athletic-club': { name: 'Athletic Club', shortName: 'Athletic', color: '#EE2523', secondary: '#FFFFFF', monogram: 'ATH', crest: fd(77) },
  valencia: { name: 'Valencia', color: '#F18E00', secondary: '#000000', monogram: 'VCF', crest: fd(95) },
  villarreal: { name: 'Villarreal', color: '#FFE114', secondary: '#005187', monogram: 'VIL', crest: fd(94) },
  'celta-vigo': { name: 'Celta Vigo', shortName: 'Celta', color: '#8AC3EE', secondary: '#E5254E', monogram: 'CEL', crest: fd(558) },
  getafe: { name: 'Getafe', color: '#005999', secondary: '#FFFFFF', monogram: 'GET', crest: fd(82) },
  osasuna: { name: 'Osasuna', color: '#D91A21', secondary: '#0A346F', monogram: 'OSA', crest: fd(79) },
  girona: { name: 'Girona', color: '#DA291C', secondary: '#FFFFFF', monogram: 'GIR', crest: fd(298) },
  mallorca: { name: 'Mallorca', color: '#E20613', secondary: '#FFED00', monogram: 'MLL', crest: fd(89) },
  'rayo-vallecano': { name: 'Rayo Vallecano', shortName: 'Rayo', color: '#E53027', secondary: '#FFFFFF', monogram: 'RAY', crest: fd(87) },
  alaves: { name: 'Alavés', color: '#0761AF', secondary: '#FFFFFF', monogram: 'ALA', crest: fd(263) },
  levante: { name: 'Levante', color: '#B4053F', secondary: '#005CA9', monogram: 'LEV', crest: fd(88) },
  elche: { name: 'Elche', color: '#05642C', secondary: '#FFFFFF', monogram: 'ELC', crest: fd(285) },
  'real-oviedo': { name: 'Real Oviedo', shortName: 'Oviedo', color: '#0053A0', secondary: '#FFFFFF', monogram: 'OVI' },
  'racing-santander': { name: 'Racing Santander', shortName: 'Racing', color: '#009540', secondary: '#FFFFFF', monogram: 'RAC' },
  'deportivo-la-coruna': { name: 'Deportivo La Coruña', shortName: 'Depor', color: '#007BC4', secondary: '#FFFFFF', monogram: 'DEP' },
  malaga: { name: 'Málaga', color: '#2C5AA9', secondary: '#FFFFFF', monogram: 'MAL' },

  // Serie A
  fiorentina: { name: 'Fiorentina', color: '#582C83', secondary: '#FFFFFF', monogram: 'FIO', crest: fd(99) },
  roma: { name: 'Roma', color: '#8E1F2F', secondary: '#F0BC42', monogram: 'ROM', crest: fd(100) },
  bologna: { name: 'Bologna', color: '#1A2F48', secondary: '#A21C26', monogram: 'BOL', crest: fd(103) },
  cagliari: { name: 'Cagliari', color: '#AD002A', secondary: '#00205B', monogram: 'CAG', crest: fd(104) },
  genoa: { name: 'Genoa', color: '#AD1919', secondary: '#00205B', monogram: 'GEN', crest: fd(107) },
  lazio: { name: 'Lazio', color: '#87D8F7', secondary: '#FFFFFF', monogram: 'LAZ', crest: fd(110) },
  parma: { name: 'Parma', color: '#004B93', secondary: '#FFE500', monogram: 'PAR', crest: fd(112) },
  udinese: { name: 'Udinese', color: '#000000', secondary: '#FFFFFF', monogram: 'UDI', crest: fd(115) },
  'hellas-verona': { name: 'Hellas Verona', shortName: 'Verona', color: '#FFCD00', secondary: '#002F6C', monogram: 'VER', crest: fd(450) },
  sassuolo: { name: 'Sassuolo', color: '#00A752', secondary: '#000000', monogram: 'SAS', crest: fd(471) },
  torino: { name: 'Torino', color: '#8B2332', secondary: '#FFFFFF', monogram: 'TOR', crest: fd(586) },
  como: { name: 'Como', color: '#002D62', secondary: '#FFFFFF', monogram: 'COM', crest: fd(7397) },
  lecce: { name: 'Lecce', color: '#FCD116', secondary: '#E11C23', monogram: 'LEC', crest: fd(5890) },
  cremonese: { name: 'Cremonese', color: '#B12028', secondary: '#6D6E71', monogram: 'CRE', crest: fd(457) },
  pisa: { name: 'Pisa', color: '#123D8B', secondary: '#000000', monogram: 'PIS' },
  venezia: { name: 'Venezia', color: '#000000', secondary: '#F0741E', monogram: 'VEN', crest: fd(454) },
  frosinone: { name: 'Frosinone', color: '#FFDD00', secondary: '#005CA9', monogram: 'FRO', crest: fd(470) },
  monza: { name: 'Monza', color: '#EE0E36', secondary: '#FFFFFF', monogram: 'MON', crest: fd(5911) },

  // Bundesliga
  leipzig: { name: 'RB Leipzig', shortName: 'Leipzig', color: '#E4003A', secondary: '#001F47', monogram: 'RBL', crest: fd(721) },
  frankfurt: { name: 'Eintracht Frankfurt', shortName: 'Frankfurt', color: '#E1000F', secondary: '#000000', monogram: 'SGE', crest: fd(19) },
  freiburg: { name: 'SC Freiburg', shortName: 'Freiburg', color: '#E32221', secondary: '#000000', monogram: 'SCF', crest: fd(17) },
  mainz: { name: 'Mainz 05', shortName: 'Mainz', color: '#C3141E', secondary: '#FFFFFF', monogram: 'M05', crest: fd(15) },
  gladbach: { name: 'Borussia Mönchengladbach', shortName: 'Gladbach', color: '#000000', secondary: '#009540', monogram: 'BMG', crest: fd(18) },
  stuttgart: { name: 'VfB Stuttgart', shortName: 'Stuttgart', color: '#E30613', secondary: '#FFFFFF', monogram: 'VFB', crest: fd(10) },
  wolfsburg: { name: 'VfL Wolfsburg', shortName: 'Wolfsburg', color: '#65B32E', secondary: '#FFFFFF', monogram: 'WOB', crest: fd(11) },
  augsburg: { name: 'FC Augsburg', shortName: 'Augsburg', color: '#BA3733', secondary: '#46714D', monogram: 'FCA', crest: fd(16) },
  'werder-bremen': { name: 'Werder Bremen', shortName: 'Bremen', color: '#1D9053', secondary: '#FFFFFF', monogram: 'SVW', crest: fd(12) },
  heidenheim: { name: 'Heidenheim', color: '#003E7E', secondary: '#E30613', monogram: 'FCH', crest: fd(44) },
  'st-pauli': { name: 'St. Pauli', color: '#624738', secondary: '#FFFFFF', monogram: 'STP', crest: fd(20) },
  'union-berlin': { name: 'Union Berlin', color: '#EB1923', secondary: '#FFDD00', monogram: 'FCU', crest: fd(28) },
  hoffenheim: { name: 'Hoffenheim', color: '#1961B5', secondary: '#FFFFFF', monogram: 'TSG', crest: fd(2) },
  koln: { name: 'Köln', color: '#ED1C24', secondary: '#FFFFFF', monogram: 'KOE', crest: fd(1) },
  hamburg: { name: 'Hamburger SV', shortName: 'Hamburg', color: '#003087', secondary: '#FFFFFF', monogram: 'HSV', crest: fd(7) },
  schalke: { name: 'Schalke 04', shortName: 'Schalke', color: '#004D9D', secondary: '#FFFFFF', monogram: 'S04', crest: fd(6) },
  elversberg: { name: 'Elversberg', color: '#005CA9', secondary: '#FFDD00', monogram: 'SVE' },
  paderborn: { name: 'Paderborn', color: '#005CA9', secondary: '#000000', monogram: 'PAD' },

  // Ligue 1
  marseille: { name: 'Marseille', color: '#2FAEE0', secondary: '#FFFFFF', monogram: 'OM', crest: fd(516) },
  lyon: { name: 'Lyon', color: '#DA001A', secondary: '#1B449C', monogram: 'OL', crest: fd(523) },
  nice: { name: 'Nice', color: '#CE0E2D', secondary: '#000000', monogram: 'NIC', crest: fd(522) },
  lens: { name: 'Lens', color: '#EC1C24', secondary: '#FFD500', monogram: 'RCL', crest: fd(546) },
  rennes: { name: 'Rennes', color: '#E13327', secondary: '#000000', monogram: 'REN', crest: fd(529) },
  strasbourg: { name: 'Strasbourg', color: '#009FE3', secondary: '#FFFFFF', monogram: 'RCS', crest: fd(576) },
  toulouse: { name: 'Toulouse', color: '#4F2D7F', secondary: '#FFFFFF', monogram: 'TFC', crest: fd(511) },
  nantes: { name: 'Nantes', color: '#FCD405', secondary: '#008D3F', monogram: 'FCN', crest: fd(543) },
  auxerre: { name: 'Auxerre', color: '#003D7C', secondary: '#FFFFFF', monogram: 'AJA', crest: fd(519) },
  angers: { name: 'Angers', color: '#000000', secondary: '#FFFFFF', monogram: 'SCO', crest: fd(532) },
  'le-havre': { name: 'Le Havre', color: '#0F1F63', secondary: '#77C3EC', monogram: 'HAC', crest: fd(533) },
  metz: { name: 'Metz', color: '#861A22', secondary: '#FFFFFF', monogram: 'FCM', crest: fd(545) },
  lorient: { name: 'Lorient', color: '#F36F21', secondary: '#000000', monogram: 'FCL', crest: fd(525) },
  'paris-fc': { name: 'Paris FC', color: '#1B2B57', secondary: '#FFFFFF', monogram: 'PFC' },
  troyes: { name: 'Troyes', color: '#1560AC', secondary: '#FFFFFF', monogram: 'TRO', crest: fd(531) },
  'le-mans': { name: 'Le Mans', color: '#C8102E', secondary: '#FFB81C', monogram: 'LEM' },

  // Eredivisie
  az: { name: 'AZ Alkmaar', shortName: 'AZ', color: '#DD1029', secondary: '#FFFFFF', monogram: 'AZ', crest: fd(682) },
  twente: { name: 'FC Twente', shortName: 'Twente', color: '#E70011', secondary: '#FFFFFF', monogram: 'TWE', crest: fd(666) },
  utrecht: { name: 'FC Utrecht', shortName: 'Utrecht', color: '#E00025', secondary: '#FFFFFF', monogram: 'UTR', crest: fd(676) },
  heerenveen: { name: 'Heerenveen', color: '#0051A2', secondary: '#FFFFFF', monogram: 'HEE', crest: fd(673) },
  groningen: { name: 'FC Groningen', shortName: 'Groningen', color: '#009344', secondary: '#FFFFFF', monogram: 'GRO', crest: fd(677) },
  'sparta-rotterdam': { name: 'Sparta Rotterdam', shortName: 'Sparta', color: '#E30613', secondary: '#FFFFFF', monogram: 'SPA' },
  nec: { name: 'NEC Nijmegen', shortName: 'NEC', color: '#CE0F0F', secondary: '#006B3F', monogram: 'NEC' },
  'fortuna-sittard': { name: 'Fortuna Sittard', shortName: 'Fortuna', color: '#F9C925', secondary: '#007A3D', monogram: 'FSI' },
  'go-ahead-eagles': { name: 'Go Ahead Eagles', color: '#E30613', secondary: '#FFDD00', monogram: 'GAE' },
  'pec-zwolle': { name: 'PEC Zwolle', shortName: 'Zwolle', color: '#0072BC', secondary: '#FFFFFF', monogram: 'PEC' },
  'nac-breda': { name: 'NAC Breda', shortName: 'NAC', color: '#FFDD00', secondary: '#000000', monogram: 'NAC' },
  'heracles-almelo': { name: 'Heracles Almelo', shortName: 'Heracles', color: '#000000', secondary: '#FFFFFF', monogram: 'HER' },
  excelsior: { name: 'Excelsior', color: '#E30613', secondary: '#000000', monogram: 'EXC' },
  volendam: { name: 'FC Volendam', shortName: 'Volendam', color: '#F58220', secondary: '#000000', monogram: 'VOL' },
  telstar: { name: 'Telstar', color: '#1D1D1B', secondary: '#FFFFFF', monogram: 'TEL' },
  'ado-den-haag': { name: 'ADO Den Haag', shortName: 'ADO', color: '#FFDD00', secondary: '#009540', monogram: 'ADO' },
  cambuur: { name: 'Cambuur', color: '#FFDD00', secondary: '#003D8F', monogram: 'SCC' },
  'willem-ii': { name: 'Willem II', color: '#D5212E', secondary: '#063573', monogram: 'WIL', crest: fd(665) },

  // Primeira Liga
  braga: { name: 'SC Braga', shortName: 'Braga', color: '#E10514', secondary: '#FFFFFF', monogram: 'SCB', crest: fd(5613) },
  'vitoria-sc': { name: 'Vitória SC', shortName: 'Vitória', color: '#000000', secondary: '#FFFFFF', monogram: 'VSC' },
  moreirense: { name: 'Moreirense', color: '#007A33', secondary: '#FFFFFF', monogram: 'MOR' },
  famalicao: { name: 'Famalicão', color: '#1D3C8F', secondary: '#FFFFFF', monogram: 'FAM' },
  'casa-pia': { name: 'Casa Pia', color: '#000000', secondary: '#FFFFFF', monogram: 'CAS' },
  'rio-ave': { name: 'Rio Ave', color: '#008542', secondary: '#FFFFFF', monogram: 'RAV' },
  nacional: { name: 'Nacional', color: '#000000', secondary: '#FFFFFF', monogram: 'CDN' },
  arouca: { name: 'Arouca', color: '#FFD200', secondary: '#00539F', monogram: 'ARO' },
  estoril: { name: 'Estoril Praia', shortName: 'Estoril', color: '#FFDF1B', secondary: '#004B8D', monogram: 'EST' },
  'gil-vicente': { name: 'Gil Vicente', color: '#C8102E', secondary: '#002D72', monogram: 'GVC' },
  'estrela-amadora': { name: 'Estrela da Amadora', shortName: 'Estrela', color: '#C8102E', secondary: '#007A3D', monogram: 'ESA' },
  'santa-clara': { name: 'Santa Clara', color: '#E30613', secondary: '#FFFFFF', monogram: 'STC' },
  avs: { name: 'AVS', color: '#C8102E', secondary: '#FFFFFF', monogram: 'AVS' },
  tondela: { name: 'Tondela', color: '#FFD200', secondary: '#00703C', monogram: 'TON' },
  alverca: { name: 'Alverca', color: '#E30613', secondary: '#FFFFFF', monogram: 'ALV' },
  maritimo: { name: 'Marítimo', color: '#C8102E', secondary: '#007A3D', monogram: 'CSM' },
  'academico-viseu': { name: 'Académico de Viseu', shortName: 'Ac. Viseu', color: '#1D1D1B', secondary: '#FFFFFF', monogram: 'ACV' },

  // EFL Championship (Coventry / Ipswich / Hull are 2026-27 Premier League;
  // Wolves / Burnley / West Ham, relegated into it, are listed with the PL block above)
  'birmingham-city': { name: 'Birmingham City', shortName: 'Birmingham', color: '#14509E', secondary: '#FFFFFF', monogram: 'BIR', crest: fd(332) },
  'blackburn-rovers': { name: 'Blackburn Rovers', shortName: 'Blackburn', color: '#009EE0', secondary: '#FFFFFF', monogram: 'BLB', crest: fd(59) },
  'bristol-city': { name: 'Bristol City', color: '#E21A23', secondary: '#FFFFFF', monogram: 'BRC', crest: fd(387) },
  'charlton-athletic': { name: 'Charlton Athletic', shortName: 'Charlton', color: '#E31B23', secondary: '#FFFFFF', monogram: 'CHA', crest: fd(348) },
  'coventry-city': { name: 'Coventry City', shortName: 'Coventry', color: '#37B7E4', secondary: '#FFFFFF', monogram: 'COV', crest: fd(1076) },
  'derby-county': { name: 'Derby County', shortName: 'Derby', color: '#1D1D1B', secondary: '#FFFFFF', monogram: 'DER', crest: fd(342) },
  'hull-city': { name: 'Hull City', shortName: 'Hull', color: '#F18A01', secondary: '#000000', monogram: 'HUL', crest: fd(322) },
  'ipswich-town': { name: 'Ipswich Town', shortName: 'Ipswich', color: '#103F8F', secondary: '#FFFFFF', monogram: 'IPS', crest: fd(349) },
  'leicester-city': { name: 'Leicester City', shortName: 'Leicester', color: '#003090', secondary: '#FDBE11', monogram: 'LEI', crest: fd(338) },
  middlesbrough: { name: 'Middlesbrough', shortName: 'Boro', color: '#DC1E2D', secondary: '#FFFFFF', monogram: 'MID', crest: fd(343) },
  millwall: { name: 'Millwall', color: '#001D5E', secondary: '#FFFFFF', monogram: 'MIL', crest: fd(384) },
  'norwich-city': { name: 'Norwich City', shortName: 'Norwich', color: '#FFF200', secondary: '#00A650', monogram: 'NOR', crest: fd(68) },
  'oxford-united': { name: 'Oxford United', shortName: 'Oxford', color: '#FFF200', secondary: '#002147', monogram: 'OXF' },
  portsmouth: { name: 'Portsmouth', shortName: 'Pompey', color: '#001489', secondary: '#FFFFFF', monogram: 'POM', crest: fd(325) },
  'preston-north-end': { name: 'Preston North End', shortName: 'Preston', color: '#232D62', secondary: '#FFFFFF', monogram: 'PNE', crest: fd(1081) },
  qpr: { name: 'Queens Park Rangers', shortName: 'QPR', color: '#005CAB', secondary: '#FFFFFF', monogram: 'QPR', crest: fd(69) },
  'sheffield-united': { name: 'Sheffield United', shortName: 'Sheff Utd', color: '#EE2737', secondary: '#000000', monogram: 'SHU', crest: fd(356) },
  'sheffield-wednesday': { name: 'Sheffield Wednesday', shortName: 'Sheff Wed', color: '#0066B3', secondary: '#FFFFFF', monogram: 'SHW', crest: fd(345) },
  southampton: { name: 'Southampton', shortName: 'Saints', color: '#D71920', secondary: '#FFFFFF', monogram: 'SOU', crest: fd(340) },
  'stoke-city': { name: 'Stoke City', shortName: 'Stoke', color: '#E03A3E', secondary: '#FFFFFF', monogram: 'STK', crest: fd(70) },
  'swansea-city': { name: 'Swansea City', shortName: 'Swansea', color: '#121212', secondary: '#FFFFFF', monogram: 'SWA', crest: fd(72) },
  watford: { name: 'Watford', color: '#FBEE23', secondary: '#ED2127', monogram: 'WAT', crest: fd(346) },
  'west-brom': { name: 'West Bromwich Albion', shortName: 'West Brom', color: '#122F67', secondary: '#FFFFFF', monogram: 'WBA', crest: fd(74) },
  wrexham: { name: 'Wrexham', color: '#D2010D', secondary: '#FFFFFF', monogram: 'WXM' },
  'lincoln-city': { name: 'Lincoln City', shortName: 'Lincoln', color: '#E31B23', secondary: '#FFFFFF', monogram: 'LIN' },
  'cardiff-city': { name: 'Cardiff City', shortName: 'Cardiff', color: '#0070B5', secondary: '#D01E45', monogram: 'CAR', crest: fd(715) },
  'bolton-wanderers': { name: 'Bolton Wanderers', shortName: 'Bolton', color: '#263C7E', secondary: '#FFFFFF', monogram: 'BOL' },

  // Brazil Série A
  flamengo: { name: 'Flamengo', color: '#C52613', secondary: '#000000', monogram: 'FLA', crest: fd(1783) },
  palmeiras: { name: 'Palmeiras', color: '#006437', secondary: '#FFFFFF', monogram: 'PAL', crest: fd(1769) },
  botafogo: { name: 'Botafogo', color: '#000000', secondary: '#FFFFFF', monogram: 'BOT', crest: fd(1770) },
  fluminense: { name: 'Fluminense', color: '#870A28', secondary: '#00613C', monogram: 'FLU', crest: fd(1765) },
  'vasco-da-gama': { name: 'Vasco da Gama', shortName: 'Vasco', color: '#000000', secondary: '#FFFFFF', monogram: 'VAS', crest: fd(1780) },
  corinthians: { name: 'Corinthians', color: '#000000', secondary: '#FFFFFF', monogram: 'COR', crest: fd(1779) },
  'sao-paulo': { name: 'São Paulo', color: '#FE0000', secondary: '#000000', monogram: 'SAO', crest: fd(1776) },
  santos: { name: 'Santos', color: '#1D1D1B', secondary: '#FFFFFF', monogram: 'SAN' },
  gremio: { name: 'Grêmio', color: '#0D80BF', secondary: '#000000', monogram: 'GRE', crest: fd(1767) },
  internacional: { name: 'Internacional', shortName: 'Inter', color: '#E5050F', secondary: '#FFFFFF', monogram: 'SCI', crest: fd(6684) },
  'atletico-mineiro': { name: 'Atlético Mineiro', shortName: 'Galo', color: '#000000', secondary: '#FFFFFF', monogram: 'CAM', crest: fd(1766) },
  cruzeiro: { name: 'Cruzeiro', color: '#2F529E', secondary: '#FFFFFF', monogram: 'CRU', crest: fd(1771) },
  bahia: { name: 'Bahia', color: '#006CB5', secondary: '#ED3237', monogram: 'BAH', crest: fd(1777) },
  fortaleza: { name: 'Fortaleza', color: '#1C3C8C', secondary: '#D6221F', monogram: 'FOR' },
  ceara: { name: 'Ceará', color: '#000000', secondary: '#FFFFFF', monogram: 'CEA' },
  'sport-recife': { name: 'Sport Recife', shortName: 'Sport', color: '#D40019', secondary: '#000000', monogram: 'SPT', crest: fd(1778) },
  juventude: { name: 'Juventude', color: '#009846', secondary: '#FFFFFF', monogram: 'ECJ' },
  vitoria: { name: 'Vitória', color: '#D00027', secondary: '#000000', monogram: 'VIT' },
  mirassol: { name: 'Mirassol', color: '#FFD100', secondary: '#00703C', monogram: 'MIR' },
  bragantino: { name: 'RB Bragantino', shortName: 'Bragantino', color: '#E4003A', secondary: '#FFFFFF', monogram: 'RBB' },
  coritiba: { name: 'Coritiba', color: '#005A45', secondary: '#FFFFFF', monogram: 'CTB' },
  'athletico-paranaense': { name: 'Athletico Paranaense', shortName: 'Athletico-PR', color: '#D50032', secondary: '#000000', monogram: 'CAP' },
  chapecoense: { name: 'Chapecoense', shortName: 'Chape', color: '#009846', secondary: '#FFFFFF', monogram: 'CHP' },
  remo: { name: 'Remo', color: '#10316B', secondary: '#FFFFFF', monogram: 'REM' },

  // National teams — badge is the country flag (flagcdn), monogram is the FIFA
  // trigram, colors are the primary kit / association palette.
  argentina: { name: 'Argentina', color: '#6CACE4', secondary: '#FFFFFF', monogram: 'ARG', crest: flag('ar') },
  france: { name: 'France', color: '#0055A4', secondary: '#FFFFFF', monogram: 'FRA', crest: flag('fr') },
  brazil: { name: 'Brazil', color: '#FFDC02', secondary: '#009739', monogram: 'BRA', crest: flag('br') },
  england: { name: 'England', color: '#001E44', secondary: '#FFFFFF', monogram: 'ENG', crest: flag('gb-eng') },
  spain: { name: 'Spain', color: '#AA151B', secondary: '#F1BF00', monogram: 'ESP', crest: flag('es') },
  germany: { name: 'Germany', color: '#000000', secondary: '#DD0000', monogram: 'GER', crest: flag('de') },
  portugal: { name: 'Portugal', color: '#DA291C', secondary: '#046A38', monogram: 'POR', crest: flag('pt') },
  netherlands: { name: 'Netherlands', color: '#F36C21', secondary: '#FFFFFF', monogram: 'NED', crest: flag('nl') },
  italy: { name: 'Italy', color: '#0066BC', secondary: '#FFFFFF', monogram: 'ITA', crest: flag('it') },
  belgium: { name: 'Belgium', color: '#E30613', secondary: '#FDDA24', monogram: 'BEL', crest: flag('be') },
  croatia: { name: 'Croatia', color: '#ED1C24', secondary: '#FFFFFF', monogram: 'CRO', crest: flag('hr') },
  uruguay: { name: 'Uruguay', color: '#55B5E5', secondary: '#FFFFFF', monogram: 'URU', crest: flag('uy') },
  mexico: { name: 'Mexico', color: '#006847', secondary: '#FFFFFF', monogram: 'MEX', crest: flag('mx') },
  'united-states': {
    name: 'United States',
    shortName: 'USA',
    color: '#002868',
    secondary: '#BF0A30',
    monogram: 'USA',
    crest: flag('us'),
  },
  japan: { name: 'Japan', color: '#13294B', secondary: '#FFFFFF', monogram: 'JPN', crest: flag('jp') },
  algeria: { name: 'Algeria', color: '#006233', secondary: '#FFFFFF', monogram: 'ALG', crest: flag('dz') },
  austria: { name: 'Austria', color: '#EF3340', secondary: '#FFFFFF', monogram: 'AUT', crest: flag('at') },
  jordan: { name: 'Jordan', color: '#CE1126', secondary: '#FFFFFF', monogram: 'JOR', crest: flag('jo') },
  morocco: { name: 'Morocco', color: '#C1272D', secondary: '#006233', monogram: 'MAR', crest: flag('ma') },
  canada: { name: 'Canada', color: '#FF0000', secondary: '#FFFFFF', monogram: 'CAN', crest: flag('ca') },

  // 2026 World Cup qualifiers not already above — UEFA
  'czech-republic': { name: 'Czech Republic', shortName: 'Czechia', color: '#D7141A', secondary: '#11457E', monogram: 'CZE', crest: flag('cz') },
  'bosnia-and-herzegovina': {
    name: 'Bosnia and Herzegovina',
    shortName: 'Bosnia',
    color: '#002F6C',
    secondary: '#FECB00',
    monogram: 'BIH',
    crest: flag('ba'),
  },
  switzerland: { name: 'Switzerland', color: '#D52B1E', secondary: '#FFFFFF', monogram: 'SUI', crest: flag('ch') },
  scotland: { name: 'Scotland', color: '#003078', secondary: '#FFFFFF', monogram: 'SCO', crest: flag('gb-sct') },
  turkey: { name: 'Turkey', color: '#E30A17', secondary: '#FFFFFF', monogram: 'TUR', crest: flag('tr') },
  sweden: { name: 'Sweden', color: '#FECC02', secondary: '#006AA7', monogram: 'SWE', crest: flag('se') },
  norway: { name: 'Norway', color: '#C8102E', secondary: '#00205B', monogram: 'NOR', crest: flag('no') },

  // CAF
  'south-africa': { name: 'South Africa', color: '#FFB612', secondary: '#007749', monogram: 'RSA', crest: flag('za') },
  'ivory-coast': { name: 'Ivory Coast', color: '#FF8200', secondary: '#009A44', monogram: 'CIV', crest: flag('ci') },
  tunisia: { name: 'Tunisia', color: '#E70013', secondary: '#FFFFFF', monogram: 'TUN', crest: flag('tn') },
  egypt: { name: 'Egypt', color: '#CE1126', secondary: '#FFFFFF', monogram: 'EGY', crest: flag('eg') },
  'cape-verde': { name: 'Cape Verde', color: '#003893', secondary: '#CF2027', monogram: 'CPV', crest: flag('cv') },
  senegal: { name: 'Senegal', color: '#00853F', secondary: '#FDEF42', monogram: 'SEN', crest: flag('sn') },
  'dr-congo': { name: 'DR Congo', color: '#0085CA', secondary: '#F7D618', monogram: 'COD', crest: flag('cd') },
  ghana: { name: 'Ghana', color: '#CE1126', secondary: '#FCD116', monogram: 'GHA', crest: flag('gh') },

  // AFC
  'south-korea': { name: 'South Korea', color: '#E6002D', secondary: '#000000', monogram: 'KOR', crest: flag('kr') },
  qatar: { name: 'Qatar', color: '#8A1538', secondary: '#FFFFFF', monogram: 'QAT', crest: flag('qa') },
  australia: { name: 'Australia', color: '#FFCD00', secondary: '#00843D', monogram: 'AUS', crest: flag('au') },
  iran: { name: 'Iran', color: '#239F40', secondary: '#DA0000', monogram: 'IRN', crest: flag('ir') },
  'saudi-arabia': { name: 'Saudi Arabia', color: '#006C35', secondary: '#FFFFFF', monogram: 'KSA', crest: flag('sa') },
  iraq: { name: 'Iraq', color: '#007A3D', secondary: '#FFFFFF', monogram: 'IRQ', crest: flag('iq') },
  uzbekistan: { name: 'Uzbekistan', color: '#0099B5', secondary: '#FFFFFF', monogram: 'UZB', crest: flag('uz') },

  // CONCACAF
  haiti: { name: 'Haiti', color: '#00209F', secondary: '#D21034', monogram: 'HAI', crest: flag('ht') },
  curacao: { name: 'Curaçao', color: '#002B7F', secondary: '#F9E814', monogram: 'CUW', crest: flag('cw') },
  panama: { name: 'Panama', color: '#DA121A', secondary: '#005293', monogram: 'PAN', crest: flag('pa') },

  // CONMEBOL
  paraguay: { name: 'Paraguay', color: '#D52B1E', secondary: '#0038A8', monogram: 'PAR', crest: flag('py') },
  ecuador: { name: 'Ecuador', color: '#FFDD00', secondary: '#034EA2', monogram: 'ECU', crest: flag('ec') },
  colombia: { name: 'Colombia', color: '#FCD116', secondary: '#003893', monogram: 'COL', crest: flag('co') },

  // OFC
  'new-zealand': { name: 'New Zealand', color: '#000000', secondary: '#FFFFFF', monogram: 'NZL', crest: flag('nz') },
}

/**
 * Common non-canonical slugs/abbreviations → canonical `TEAMS` key. Hand-authored
 * demo data and some upstream feeds use short forms ("man-utd") that don't slugify
 * to the registry key ("manchester-united"); without this they'd silently degrade
 * to the monogram placeholder instead of the real crest. Keys must be in slugified
 * form (lowercase, hyphenated); values must be real `TEAMS` keys.
 */
const ALIASES: Record<string, string> = {
  'man-utd': 'manchester-united',
  'man-united': 'manchester-united',
  manutd: 'manchester-united',
  mufc: 'manchester-united',
  'man-city': 'manchester-city',
  mancity: 'manchester-city',
  mcfc: 'manchester-city',
  spurs: 'tottenham',
  'tottenham-hotspur': 'tottenham',
  barca: 'barcelona',
  'fc-barcelona': 'barcelona',
  atletico: 'atletico-madrid',
  atleti: 'atletico-madrid',
  villa: 'aston-villa',
  'newcastle-united': 'newcastle',
  'brighton-hove-albion': 'brighton',
  'brighton-and-hove-albion': 'brighton',
  'west-ham-united': 'west-ham',
  'afc-bournemouth': 'bournemouth',
  'leeds-united': 'leeds',
  'nottm-forest': 'nottingham-forest',
  'wolverhampton-wanderers': 'wolves',
  wolverhampton: 'wolves',
  'bayern-munich': 'bayern',
  'borussia-dortmund': 'dortmund',
  bvb: 'dortmund',
  'inter-milan': 'inter',
  'ac-milan': 'milan',
  'paris-saint-germain': 'psg',
  brugge: 'club-brugge',
  usa: 'united-states',
  'united-states-of-america': 'united-states',
  holland: 'netherlands',
  czechia: 'czech-republic',
  bosnia: 'bosnia-and-herzegovina',
  'bosnia-herzegovina': 'bosnia-and-herzegovina',
  turkiye: 'turkey', // slugify("Türkiye")
  'cote-d-ivoire': 'ivory-coast', // slugify("Côte d'Ivoire")
  'cote-divoire': 'ivory-coast',
  'cabo-verde': 'cape-verde',
  'congo-dr': 'dr-congo',
  'democratic-republic-of-the-congo': 'dr-congo',
  drc: 'dr-congo',
  'korea-republic': 'south-korea', // FIFA's official name
  korea: 'south-korea',
  'ir-iran': 'iran', // FIFA's official name
  ksa: 'saudi-arabia',

  // Official football-data.org entity names for clubs already above — feeds
  // carry the registered name ("FC Internazionale Milano"), articles the common
  // one. findTeam only strips a *trailing* FC/AFC, so leading/embedded club
  // tokens need explicit rows.
  'real-madrid-cf': 'real-madrid',
  'atletico-de-madrid': 'atletico-madrid',
  'club-atletico-de-madrid': 'atletico-madrid',
  'fc-internazionale-milano': 'inter',
  internazionale: 'inter',
  'atalanta-bc': 'atalanta',
  'ssc-napoli': 'napoli',
  'as-monaco': 'monaco',
  'fc-bayern-munchen': 'bayern',
  'bayern-munchen': 'bayern',
  'bayer-04-leverkusen': 'leverkusen',
  'lille-osc': 'lille',
  'stade-brestois-29': 'brest',
  'stade-brestois': 'brest',
  'afc-ajax': 'ajax',
  'psv-eindhoven': 'psv',
  'feyenoord-rotterdam': 'feyenoord',
  'fc-porto': 'porto',
  'sl-benfica': 'benfica',
  'sporting-cp': 'sporting',
  'sporting-clube-de-portugal': 'sporting',
  'club-brugge-kv': 'club-brugge',

  // La Liga
  'rcd-espanyol-de-barcelona': 'espanyol',
  'espanyol-de-barcelona': 'espanyol',
  'rcd-espanyol': 'espanyol',
  'sevilla-fc': 'sevilla',
  'real-betis-balompie': 'real-betis',
  betis: 'real-betis',
  'real-sociedad-de-futbol': 'real-sociedad',
  'athletic-bilbao': 'athletic-club',
  athletic: 'athletic-club',
  'valencia-cf': 'valencia',
  'villarreal-cf': 'villarreal',
  'rc-celta-de-vigo': 'celta-vigo',
  'celta-de-vigo': 'celta-vigo',
  celta: 'celta-vigo',
  'getafe-cf': 'getafe',
  'ca-osasuna': 'osasuna',
  'rcd-mallorca': 'mallorca',
  'rayo-vallecano-de-madrid': 'rayo-vallecano',
  rayo: 'rayo-vallecano',
  'deportivo-alaves': 'alaves',
  'levante-ud': 'levante',
  'elche-cf': 'elche',
  oviedo: 'real-oviedo',
  'real-racing-club': 'racing-santander',
  racing: 'racing-santander',
  'rc-deportivo-de-la-coruna': 'deportivo-la-coruna',
  'rc-deportivo-la-coruna': 'deportivo-la-coruna',
  deportivo: 'deportivo-la-coruna',
  depor: 'deportivo-la-coruna',
  'malaga-cf': 'malaga',

  // Serie A
  'acf-fiorentina': 'fiorentina',
  'as-roma': 'roma',
  'bologna-fc-1909': 'bologna',
  'cagliari-calcio': 'cagliari',
  'genoa-cfc': 'genoa',
  'ss-lazio': 'lazio',
  'parma-calcio-1913': 'parma',
  'udinese-calcio': 'udinese',
  verona: 'hellas-verona',
  'us-sassuolo-calcio': 'sassuolo',
  'como-1907': 'como',
  'us-lecce': 'lecce',
  'us-cremonese': 'cremonese',
  'pisa-sporting-club': 'pisa',
  'frosinone-calcio': 'frosinone',
  'ac-monza': 'monza',

  // Bundesliga
  'rb-leipzig': 'leipzig',
  'eintracht-frankfurt': 'frankfurt',
  'sc-freiburg': 'freiburg',
  '1-fsv-mainz-05': 'mainz',
  'fsv-mainz-05': 'mainz',
  'mainz-05': 'mainz',
  'borussia-monchengladbach': 'gladbach',
  monchengladbach: 'gladbach',
  'vfb-stuttgart': 'stuttgart',
  'vfl-wolfsburg': 'wolfsburg',
  'fc-augsburg': 'augsburg',
  'sv-werder-bremen': 'werder-bremen',
  bremen: 'werder-bremen',
  '1-fc-heidenheim-1846': 'heidenheim',
  'fc-st-pauli': 'st-pauli',
  '1-fc-union-berlin': 'union-berlin',
  'tsg-1899-hoffenheim': 'hoffenheim',
  '1-fc-koln': 'koln',
  'fc-koln': 'koln',
  'hamburger-sv': 'hamburg',
  hsv: 'hamburg',
  'fc-schalke-04': 'schalke',
  'schalke-04': 'schalke',
  'sv-elversberg': 'elversberg',
  'sc-paderborn-07': 'paderborn',

  // Ligue 1
  'olympique-de-marseille': 'marseille',
  'olympique-marseille': 'marseille',
  'olympique-lyonnais': 'lyon',
  'ogc-nice': 'nice',
  'rc-lens': 'lens',
  'stade-rennais-fc-1901': 'rennes',
  'stade-rennais': 'rennes',
  'rc-strasbourg-alsace': 'strasbourg',
  'rc-strasbourg': 'strasbourg',
  'fc-nantes': 'nantes',
  'aj-auxerre': 'auxerre',
  'angers-sco': 'angers',
  'le-havre-ac': 'le-havre',
  'fc-metz': 'metz',
  'fc-lorient': 'lorient',
  'es-troyes-ac': 'troyes',
  'troyes-ac': 'troyes',
  'le-mans-fc': 'le-mans',

  // Eredivisie
  'az-alkmaar': 'az',
  'fc-twente-65': 'twente',
  'fc-twente': 'twente',
  'fc-utrecht': 'utrecht',
  'sc-heerenveen': 'heerenveen',
  'fc-groningen': 'groningen',
  sparta: 'sparta-rotterdam',
  'nec-nijmegen': 'nec',
  nac: 'nac-breda',
  heracles: 'heracles-almelo',
  'excelsior-rotterdam': 'excelsior',
  'fc-volendam': 'volendam',
  'sc-telstar': 'telstar',
  ado: 'ado-den-haag',
  'sc-cambuur': 'cambuur',
  'willem-ii-tilburg': 'willem-ii',

  // Primeira Liga
  'sc-braga': 'braga',
  'vitoria-guimaraes': 'vitoria-sc',
  'vitoria-de-guimaraes': 'vitoria-sc',
  'fc-famalicao': 'famalicao',
  'casa-pia-ac': 'casa-pia',
  'cd-nacional': 'nacional',
  'fc-arouca': 'arouca',
  'gd-estoril-praia': 'estoril',
  'estoril-praia': 'estoril',
  'cf-estrela-da-amadora': 'estrela-amadora',
  'estrela-da-amadora': 'estrela-amadora',
  'cd-santa-clara': 'santa-clara',
  'avs-futebol-sad': 'avs',
  'cd-tondela': 'tondela',
  'fc-alverca': 'alverca',
  'cs-maritimo': 'maritimo',
  'academico-de-viseu': 'academico-viseu',

  // EFL Championship
  birmingham: 'birmingham-city',
  blackburn: 'blackburn-rovers',
  charlton: 'charlton-athletic',
  coventry: 'coventry-city',
  derby: 'derby-county',
  hull: 'hull-city',
  ipswich: 'ipswich-town',
  leicester: 'leicester-city',
  norwich: 'norwich-city',
  preston: 'preston-north-end',
  'queens-park-rangers': 'qpr',
  stoke: 'stoke-city',
  swansea: 'swansea-city',
  'west-bromwich-albion': 'west-brom',
  wba: 'west-brom',
  cardiff: 'cardiff-city',
  bolton: 'bolton-wanderers',
  lincoln: 'lincoln-city',

  // Brazil Série A (football-data.org registered names)
  'cr-flamengo': 'flamengo',
  'se-palmeiras': 'palmeiras',
  'botafogo-fr': 'botafogo',
  'cr-vasco-da-gama': 'vasco-da-gama',
  vasco: 'vasco-da-gama',
  'sc-corinthians-paulista': 'corinthians',
  'sport-club-corinthians-paulista': 'corinthians',
  'gremio-fbpa': 'gremio',
  'sc-internacional': 'internacional',
  'ca-mineiro': 'atletico-mineiro',
  'atletico-mg': 'atletico-mineiro',
  'cruzeiro-ec': 'cruzeiro',
  'ec-bahia': 'bahia',
  'fortaleza-ec': 'fortaleza',
  'ceara-sc': 'ceara',
  'sport-club-do-recife': 'sport-recife',
  'ec-juventude': 'juventude',
  'ec-vitoria': 'vitoria',
  'rb-bragantino': 'bragantino',
  'red-bull-bragantino': 'bragantino',
  'coritiba-fbc': 'coritiba',
  'ca-paranaense': 'athletico-paranaense',
  'athletico-pr': 'athletico-paranaense',
  'chapecoense-af': 'chapecoense',
  'clube-do-remo': 'remo',
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

/**
 * Lookup with display-name + alias fallback. Tries the raw key, then the
 * slugified form, then the alias map — and retries all three with a trailing
 * "FC"/"AFC" stripped, since football-data.org entity names carry the suffix
 * ("Newcastle United FC") while the registry keys don't.
 * Returns `null` if no bundled entry matches.
 */
export function findTeam(slugOrName: string): TeamEntry | null {
  const direct = TEAMS[slugOrName]
  if (direct) return direct
  for (const slug of [slugify(slugOrName), slugify(slugOrName).replace(/-a?fc$/, '')]) {
    if (TEAMS[slug]) return TEAMS[slug]
    const aliased = ALIASES[slug]
    if (aliased && TEAMS[aliased]) return TEAMS[aliased]
  }
  return null
}

/** Resolve the display color for a team — YAML override wins, then bundled, then fallback. */
export function resolveTeamColor(slugOrName: string, override?: string): string {
  if (override) return override
  return findTeam(slugOrName)?.color ?? '#404040'
}

/** Bundled crest URL for a team (football-data.org), or undefined if we have none. */
export function teamCrestUrl(slugOrName: string): string | undefined {
  return findTeam(slugOrName)?.crest ?? undefined
}

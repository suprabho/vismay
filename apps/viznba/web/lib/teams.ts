/**
 * The 30 franchises. `id` is the NBA abbreviation lowercased (what the app
 * stores in the follow cookie and URLs); `espnAbbr` is what ESPN's API returns
 * where it differs (GS, NY, NO, SA, UTAH, WSH). `bg`/`fg` paint the round
 * badge; `dot` is a tint that reads on the dark background, used for calendar
 * dots, legend swatches and margin lines.
 */
export type Team = {
  id: string
  abbr: string
  espnAbbr: string
  espnId: string
  location: string
  name: string
  bg: string
  fg: string
  dot: string
}

export const TEAMS: Team[] = [
  { id: 'atl', abbr: 'ATL', espnAbbr: 'ATL', espnId: '1', location: 'Atlanta', name: 'Hawks', bg: '#C8102E', fg: '#FDB927', dot: '#ff6b6b' },
  { id: 'bos', abbr: 'BOS', espnAbbr: 'BOS', espnId: '2', location: 'Boston', name: 'Celtics', bg: '#007A33', fg: '#ffffff', dot: '#1f9d55' },
  { id: 'bkn', abbr: 'BKN', espnAbbr: 'BKN', espnId: '17', location: 'Brooklyn', name: 'Nets', bg: '#000000', fg: '#ffffff', dot: '#c9c9d1' },
  { id: 'cha', abbr: 'CHA', espnAbbr: 'CHA', espnId: '30', location: 'Charlotte', name: 'Hornets', bg: '#1D1160', fg: '#00788C', dot: '#2fb7c9' },
  { id: 'chi', abbr: 'CHI', espnAbbr: 'CHI', espnId: '4', location: 'Chicago', name: 'Bulls', bg: '#CE1141', fg: '#ffffff', dot: '#ff5577' },
  { id: 'cle', abbr: 'CLE', espnAbbr: 'CLE', espnId: '5', location: 'Cleveland', name: 'Cavaliers', bg: '#860038', fg: '#FDBB30', dot: '#e0457b' },
  { id: 'dal', abbr: 'DAL', espnAbbr: 'DAL', espnId: '6', location: 'Dallas', name: 'Mavericks', bg: '#00538C', fg: '#ffffff', dot: '#4aa3e8' },
  { id: 'den', abbr: 'DEN', espnAbbr: 'DEN', espnId: '7', location: 'Denver', name: 'Nuggets', bg: '#0E2240', fg: '#FEC524', dot: '#FEC524' },
  { id: 'det', abbr: 'DET', espnAbbr: 'DET', espnId: '8', location: 'Detroit', name: 'Pistons', bg: '#1D428A', fg: '#ffffff', dot: '#ef4b5f' },
  { id: 'gsw', abbr: 'GSW', espnAbbr: 'GS', espnId: '9', location: 'Golden State', name: 'Warriors', bg: '#1D428A', fg: '#FFC72C', dot: '#FFC72C' },
  { id: 'hou', abbr: 'HOU', espnAbbr: 'HOU', espnId: '10', location: 'Houston', name: 'Rockets', bg: '#CE1141', fg: '#ffffff', dot: '#ff4f6d' },
  { id: 'ind', abbr: 'IND', espnAbbr: 'IND', espnId: '11', location: 'Indiana', name: 'Pacers', bg: '#002D62', fg: '#FDBB30', dot: '#FDBB30' },
  { id: 'lac', abbr: 'LAC', espnAbbr: 'LAC', espnId: '12', location: 'LA', name: 'Clippers', bg: '#C8102E', fg: '#ffffff', dot: '#5b8def' },
  { id: 'lal', abbr: 'LAL', espnAbbr: 'LAL', espnId: '13', location: 'Los Angeles', name: 'Lakers', bg: '#552583', fg: '#FDB927', dot: '#a07ae0' },
  { id: 'mem', abbr: 'MEM', espnAbbr: 'MEM', espnId: '29', location: 'Memphis', name: 'Grizzlies', bg: '#5D76A9', fg: '#12173F', dot: '#8fa6d6' },
  { id: 'mia', abbr: 'MIA', espnAbbr: 'MIA', espnId: '14', location: 'Miami', name: 'Heat', bg: '#98002E', fg: '#F9A01B', dot: '#F9A01B' },
  { id: 'mil', abbr: 'MIL', espnAbbr: 'MIL', espnId: '15', location: 'Milwaukee', name: 'Bucks', bg: '#00471B', fg: '#EEE1C6', dot: '#3fae6a' },
  { id: 'min', abbr: 'MIN', espnAbbr: 'MIN', espnId: '16', location: 'Minnesota', name: 'Timberwolves', bg: '#0C2340', fg: '#78BE20', dot: '#78BE20' },
  { id: 'nop', abbr: 'NOP', espnAbbr: 'NO', espnId: '3', location: 'New Orleans', name: 'Pelicans', bg: '#0C2340', fg: '#C8102E', dot: '#c9a96a' },
  { id: 'nyk', abbr: 'NYK', espnAbbr: 'NY', espnId: '18', location: 'New York', name: 'Knicks', bg: '#006BB6', fg: '#ffffff', dot: '#F58426' },
  { id: 'okc', abbr: 'OKC', espnAbbr: 'OKC', espnId: '25', location: 'Oklahoma City', name: 'Thunder', bg: '#007AC1', fg: '#ffffff', dot: '#38a8f0' },
  { id: 'orl', abbr: 'ORL', espnAbbr: 'ORL', espnId: '19', location: 'Orlando', name: 'Magic', bg: '#0077C0', fg: '#ffffff', dot: '#4fb0ef' },
  { id: 'phi', abbr: 'PHI', espnAbbr: 'PHI', espnId: '20', location: 'Philadelphia', name: '76ers', bg: '#ED174C', fg: '#0b0d12', dot: '#ff4d73' },
  { id: 'phx', abbr: 'PHX', espnAbbr: 'PHX', espnId: '21', location: 'Phoenix', name: 'Suns', bg: '#1D1160', fg: '#E56020', dot: '#E56020' },
  { id: 'por', abbr: 'POR', espnAbbr: 'POR', espnId: '22', location: 'Portland', name: 'Trail Blazers', bg: '#E03A3E', fg: '#0b0d12', dot: '#ff5c60' },
  { id: 'sac', abbr: 'SAC', espnAbbr: 'SAC', espnId: '23', location: 'Sacramento', name: 'Kings', bg: '#5A2D81', fg: '#ffffff', dot: '#9b6bd1' },
  { id: 'sas', abbr: 'SAS', espnAbbr: 'SA', espnId: '24', location: 'San Antonio', name: 'Spurs', bg: '#C4CED4', fg: '#0b0d12', dot: '#C4CED4' },
  { id: 'tor', abbr: 'TOR', espnAbbr: 'TOR', espnId: '28', location: 'Toronto', name: 'Raptors', bg: '#CE1141', fg: '#ffffff', dot: '#ff4f6d' },
  { id: 'uta', abbr: 'UTA', espnAbbr: 'UTAH', espnId: '26', location: 'Utah', name: 'Jazz', bg: '#4E008E', fg: '#ffffff', dot: '#9d6bdc' },
  { id: 'was', abbr: 'WAS', espnAbbr: 'WSH', espnId: '27', location: 'Washington', name: 'Wizards', bg: '#002B5C', fg: '#E31837', dot: '#ff5266' },
]

const byId = new Map(TEAMS.map((t) => [t.id, t]))
const byEspnId = new Map(TEAMS.map((t) => [t.espnId, t]))
const byEspnAbbr = new Map(TEAMS.map((t) => [t.espnAbbr.toLowerCase(), t]))

const UNKNOWN: Team = {
  id: 'nba',
  abbr: 'TBD',
  espnAbbr: 'TBD',
  espnId: '0',
  location: '',
  name: 'TBD',
  bg: '#373b41',
  fg: '#f8f8f9',
  dot: '#a3a8b0',
}

export function teamById(id: string): Team | undefined {
  return byId.get(id.toLowerCase())
}

/**
 * ESPN puts exhibition opponents (international clubs in preseason, All-Star
 * squads) in the same feeds; those fall back to a neutral badge with ESPN's
 * own labels.
 */
export function teamFromEspn(espnId: string, abbr?: string, name?: string): Team {
  return (
    byEspnId.get(espnId) ??
    (abbr ? byEspnAbbr.get(abbr.toLowerCase()) : undefined) ?? {
      ...UNKNOWN,
      id: `x${espnId}`,
      abbr: (abbr ?? 'TBD').slice(0, 4).toUpperCase(),
      name: name ?? 'TBD',
    }
  )
}

/**
 * ESPN's CDN logo for one of the 30 franchises (the same art `seedRoster`
 * stores as `logo_url`), using the dark-background variant and resized
 * server-side to ~2x the rendered size. Null for exhibition / TBD sides,
 * which keep the lettered badge.
 */
export function teamLogo(team: Team, px: number): string | null {
  if (!byId.has(team.id)) return null
  const s = Math.round(px * 2)
  return `https://a.espncdn.com/combiner/i?img=/i/teamlogos/nba/500-dark/${team.espnAbbr.toLowerCase()}.png&w=${s}&h=${s}`
}

export const DEFAULT_FOLLOWED = ['lal', 'gsw', 'okc']

import type { MatchCardConfig } from './index'

export const sample: MatchCardConfig = {
  type: 'fs:match-card',
  layout: 'score',
  home: 'Argentina',
  away: 'France',
  score: '3 – 3 (4 – 2 pens)',
  kickoff: 'December 18, 2022',
  competition: 'FIFA World Cup · Final',
  cardColor: '#f4e9d8',
  borderColor: '#8a1538',
  textColor: '#1d2a4a',
}

export const sampleGrid: MatchCardConfig = {
  type: 'fs:match-card',
  layout: 'grid',
  columns: 2,
  // Showcase the shared image background (URL + dim + blur) behind the grid.
  backgroundImage: 'https://picsum.photos/seed/footshorts-pitch/1200/800',
  backgroundDim: 0.5,
  backgroundBlur: 3,
  // home/away mirror the first card (unused in grid render — see parseConfig).
  home: 'Arsenal',
  away: 'Chelsea',
  cards: [
    { home: 'Arsenal', away: 'Chelsea', score: '2 – 1', competition: 'Premier League' },
    { home: 'Liverpool', away: 'Man City', score: '1 – 1', competition: 'Premier League' },
    { home: 'Tottenham', away: 'Man Utd', score: '0 – 3', competition: 'Premier League' },
    { home: 'Newcastle', away: 'Aston Villa', score: '2 – 2', competition: 'Premier League' },
  ],
}

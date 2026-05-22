/**
 * Brand tokens for VizF1.
 *
 * Single-theme for now — tokens are also emitted as CSS variables via
 * Tailwind v4's `@theme` block in apps/vizf1/web/app/globals.css. This module
 * stays the type-level source of truth so consumers (vizmaya stories, future
 * mobile RN components) can read the same palette without importing CSS.
 */

export const F1_BRAND = {
  colors: {
    bg: '#0b0d12',
    surface: '#13161d',
    border: '#1f2330',
    text: '#f5f5f5',
    muted: '#8e8e99',
    accent: '#e10600', // F1 red
    accentText: '#ffffff',
  },
  /** Constructor accents — used by f1:position-chart lane colours. */
  constructors: {
    red_bull: '#3671C6',
    ferrari: '#E8002D',
    mercedes: '#27F4D2',
    mclaren: '#FF8000',
    aston_martin: '#229971',
    alpine: '#0093CC',
    williams: '#64C4FF',
    rb: '#6692FF',
    sauber: '#52E252',
    haas: '#B6BABD',
  },
  /**
   * Constructor logo URLs by `constructor_id` slug as the worker writes them
   * (slug(team_name) — see apps/vizf1/worker/src/ingestSessions.ts). Worker
   * pushes these into vizf1_constructors.logo_url on every upsert. UI reads
   * from the DB at runtime; this map is the seed/source-of-truth.
   *
   * URLs point at Wikimedia / Wikipedia for stability — swap to a private CDN
   * if licensing requires it. Missing entries are fine; UI falls back to the
   * abbreviation chip when logo_url is null.
   */
  constructorLogos: {
    red_bull_racing: 'https://upload.wikimedia.org/wikipedia/en/f/fa/Red_Bull_Racing_Logo_2026.svg',
    ferrari: 'https://upload.wikimedia.org/wikipedia/en/d/df/Scuderia_Ferrari_HP_logo_24.svg',
    mercedes:
      'https://upload.wikimedia.org/wikipedia/commons/f/fc/Mercedes-AMG_Petronas_F1_Team_logo_%282026%29.svg',
    mclaren: 'https://upload.wikimedia.org/wikipedia/en/6/66/McLaren_Racing_logo.svg',
    aston_martin: 'https://upload.wikimedia.org/wikipedia/en/1/15/Aston_Martin_Aramco_2024_logo.png',
    alpine: 'https://upload.wikimedia.org/wikipedia/commons/4/4a/BWT_Alpine_F1_Team_Logo.png',
    williams: 'https://upload.wikimedia.org/wikipedia/commons/1/12/Atlassian_Williams_F1_Team_logo.svg',
    rb: 'https://upload.wikimedia.org/wikipedia/en/2/2b/VCARB_F1_logo.svg',
    kick_sauber: 'https://upload.wikimedia.org/wikipedia/commons/9/94/Logo_sauber_2023.jpg',
    haas: 'https://upload.wikimedia.org/wikipedia/commons/1/18/TGR_Haas_F1_Team_Logo_%282026%29.svg',
  } as Record<string, string>,
} as const

export type F1Brand = typeof F1_BRAND
export type ConstructorId = keyof F1Brand['constructors']

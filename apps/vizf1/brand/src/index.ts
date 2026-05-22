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
    red_bull_racing: 'https://upload.wikimedia.org/wikipedia/en/c/c6/Red_Bull_Racing_logo.svg',
    ferrari: 'https://upload.wikimedia.org/wikipedia/commons/c/c0/Scuderia_Ferrari_Logo.svg',
    mercedes: 'https://upload.wikimedia.org/wikipedia/commons/9/90/Mercedes_AMG_Petronas_F1_Logo.svg',
    mclaren: 'https://upload.wikimedia.org/wikipedia/en/6/66/McLaren_Racing_logo.svg',
    aston_martin: 'https://upload.wikimedia.org/wikipedia/commons/c/c2/Aston_Martin_Cognizant_F1.svg',
    alpine: 'https://upload.wikimedia.org/wikipedia/commons/9/9d/Alpine_F1_Team_Logo.svg',
    williams: 'https://upload.wikimedia.org/wikipedia/en/4/49/Williams_Racing_2020.png',
    rb: 'https://upload.wikimedia.org/wikipedia/commons/c/c7/Visa_Cash_App_RB_F1_Team_logo.svg',
    kick_sauber: 'https://upload.wikimedia.org/wikipedia/commons/8/86/Stake_F1_Team_Kick_Sauber_logo.svg',
    haas: 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Haas_F1_Team_logo.svg',
  } as Record<string, string>,
} as const

export type F1Brand = typeof F1_BRAND
export type ConstructorId = keyof F1Brand['constructors']

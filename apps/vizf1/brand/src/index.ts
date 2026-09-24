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
    accent: '#ff4346', // VizF1 coral red (Figma "Vismay Brands" node 120-196)
    accentText: '#0b0d12', // near-black ink on accent — brand lockup is black-on-red
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
   * The 2026 marks are single-colour white glyphs bundled with the web app at
   * apps/vizf1/web/public/constructors/<id>.svg (vector, from the F1 CDN). Paths
   * are root-relative so they resolve against whichever origin serves the
   * app; render them on a dark or team-tinted surface, never on white.
   * OpenF1 has spelled some teams more than one way over time (e.g. "Haas"
   * vs "Haas F1 Team"), so both slug forms point at the same file.
   *
   * Missing entries are fine; UI falls back to the abbreviation chip when
   * logo_url is null.
   */
  constructorLogos: {
    red_bull_racing: '/constructors/red_bull_racing.svg',
    red_bull: '/constructors/red_bull_racing.svg',
    ferrari: '/constructors/ferrari.svg',
    mercedes: '/constructors/mercedes.svg',
    mclaren: '/constructors/mclaren.svg',
    aston_martin: '/constructors/aston_martin.svg',
    williams: '/constructors/williams.svg',
    haas: '/constructors/haas.svg',
    haas_f1_team: '/constructors/haas.svg',
    audi: '/constructors/audi.svg',
    cadillac: '/constructors/cadillac.svg',
    alpine: '/constructors/alpine.svg',
    // Racing Bulls have their own "RB" mark, distinct from the senior team's.
    rb: '/constructors/racing_bulls.svg',
    racing_bulls: '/constructors/racing_bulls.svg',
  } as Record<string, string>,
} as const

export type F1Brand = typeof F1_BRAND
export type ConstructorId = keyof F1Brand['constructors']

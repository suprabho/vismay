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
   * apps/vizf1/web/public/constructors/<id>.avif (48×48, transparent). Paths
   * are root-relative so they resolve against whichever origin serves the
   * app; render them on a dark or team-tinted surface, never on white.
   * OpenF1 has spelled some teams more than one way over time (e.g. "Haas"
   * vs "Haas F1 Team"), so both slug forms point at the same file.
   *
   * Missing entries are fine; UI falls back to the abbreviation chip when
   * logo_url is null.
   */
  constructorLogos: {
    red_bull_racing: '/constructors/red_bull_racing.avif',
    red_bull: '/constructors/red_bull_racing.avif',
    ferrari: '/constructors/ferrari.avif',
    mercedes: '/constructors/mercedes.avif',
    mclaren: '/constructors/mclaren.avif',
    aston_martin: '/constructors/aston_martin.avif',
    williams: '/constructors/williams.avif',
    haas: '/constructors/haas.avif',
    haas_f1_team: '/constructors/haas.avif',
    audi: '/constructors/audi.avif',
    cadillac: '/constructors/cadillac.avif',
    alpine: '/constructors/alpine.avif',
    // Racing Bulls share the bulls emblem with the senior team; the supplied
    // mark is the same glyph, kept as its own file so it can diverge later.
    rb: '/constructors/racing_bulls.avif',
    racing_bulls: '/constructors/racing_bulls.avif',
  } as Record<string, string>,
} as const

export type F1Brand = typeof F1_BRAND
export type ConstructorId = keyof F1Brand['constructors']

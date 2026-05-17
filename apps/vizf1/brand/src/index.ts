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
} as const

export type F1Brand = typeof F1_BRAND
export type ConstructorId = keyof F1Brand['constructors']

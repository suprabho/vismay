/**
 * Brand tokens for VizF1.
 *
 * Mirrors apps/footshort/brand. Theme provider, logo component, palette
 * tokens — to be filled in alongside the first real F1 stories.
 */

export const F1_BRAND = {
  // Placeholder palette. Will hold the racing-flag accent + track-tarmac
  // surface tokens used across the F1 web app.
  colors: {
    background: '#0b0d12',
    surface: '#13161d',
    accent: '#e10600', // F1 red placeholder
    text: '#f5f5f5',
  },
} as const

export type F1Theme = typeof F1_BRAND

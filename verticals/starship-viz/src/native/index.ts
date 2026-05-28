/**
 * Native (React Native / Expo) stub.
 *
 * The Starship vertical is WebGL-only — there is no native renderer. Stories
 * that include `starship:viewer` layers will render a placeholder on mobile
 * native targets. Keep this file so the package's `./native` export resolves
 * cleanly when imported from an Expo app that bundles all verticals.
 */

export const STARSHIP_NATIVE_PLACEHOLDER =
  'starship-viz is web-only; consider a poster image fallback for native.'

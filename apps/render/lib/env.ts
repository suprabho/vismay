/**
 * Env resolution for the brand-neutral render app. Surfaces are mounted from
 * `@vismay/render-surface`, which takes branding/runtime concerns as props so
 * the package stays app-agnostic. This module resolves them from env once per
 * server-render so the values reach the client through props, not the client
 * bundle — keeps the build deterministic when the URL differs per environment.
 */

const ADMIN_FALLBACK = 'https://vismay.xyz'

/** Public base URL of the admin app, used by editor surfaces to point save
 *  fetches at admin's API directly. Trailing slash stripped. */
export function adminBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_ADMIN_URL || ADMIN_FALLBACK).replace(/\/$/, '')
}

/** Mapbox token injected into map-backed surfaces. */
export function mapboxToken(): string {
  return process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
}

/**
 * Base URL of the public vizmaya.fyi site. Admin runs on its own domain
 * (admin.vizmaya.fyi in prod, a separate port in dev), so any link from admin
 * to a public-site route must be prefixed with this URL — a bare `/story/...`
 * would 404 against the admin domain.
 */
const FALLBACK = 'https://vizmaya.fyi'

export const vizmayaPublicUrl: string = (
  process.env.NEXT_PUBLIC_VIZMAYA_URL || FALLBACK
).replace(/\/$/, '')

export function vizmayaUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${vizmayaPublicUrl}${normalized}`
}

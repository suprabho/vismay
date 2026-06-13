/**
 * Build the catalog "embed" URL that renders one module from an arbitrary
 * config. Both `embed_url` (returns it) and `render_module_image` (screenshots
 * it) go through here, so there is a single rendering surface to keep in sync
 * with apps/catalog/app/embed/[type]/page.tsx.
 *
 * The config travels as a base64url-encoded JSON blob in the query string. That
 * survives URL encoding cleanly and keeps the route a plain GET (no server-side
 * state). Typical module configs are a few KB, well under any URL length limit;
 * if a real config ever exceeds ~8KB, switch to a POST-and-token scheme (see the
 * follow-up note in the package README).
 */

export type VizSlot = 'foreground' | 'background'

export function encodeConfig(config: unknown): string {
  const json = JSON.stringify(config ?? {})
  return Buffer.from(json, 'utf8').toString('base64url')
}

export function buildEmbedUrl(
  catalogBaseUrl: string,
  type: string,
  config: unknown,
  slot: VizSlot = 'foreground',
  // 'surface' paints the catalog surface behind the module; 'transparent' paints
  // nothing, so a screenshot with omitBackground yields an alpha PNG.
  bg: 'surface' | 'transparent' = 'surface',
): string {
  const base = catalogBaseUrl.replace(/\/+$/, '')
  const params = new URLSearchParams({
    config: encodeConfig(config),
    slot,
    bg,
  })
  return `${base}/embed/${encodeURIComponent(type)}?${params.toString()}`
}

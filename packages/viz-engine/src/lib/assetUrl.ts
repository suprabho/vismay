/**
 * Resolve a YAML asset reference to a fetchable URL.
 *
 * Supported reference shapes:
 *   - `assets://<key>`     → `<NEXT_PUBLIC_SUPABASE_URL>/storage/v1/object/public/story-assets/<key>`
 *   - `https://…` / `http://…` → pass through unchanged
 *   - `/anything`          → pass through unchanged (treated as a same-origin
 *                            public path, e.g. `/vizmaya-logo.svg`)
 *
 * Why URL composition instead of `supabase.storage.from(...).getPublicUrl()`?
 * The Supabase JS client pulls a non-trivial bundle for what is, on a public
 * bucket, a deterministic string concat. Composing the URL ourselves keeps
 * the asset-resolution path zero-cost for client components and works
 * identically server-side, in headless capture, and from the admin UI.
 */

const ASSETS_BUCKET = 'story-assets'
const ASSETS_SCHEME = 'assets://'

let cachedBase: string | null = null

function bucketBaseUrl(): string {
  if (cachedBase) return cachedBase
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) {
    throw new Error(
      'assetUrl: NEXT_PUBLIC_SUPABASE_URL is unset. The `assets://` scheme requires a public Supabase URL at build/runtime.'
    )
  }
  cachedBase = `${url.replace(/\/$/, '')}/storage/v1/object/public/${ASSETS_BUCKET}`
  return cachedBase
}

export function resolveAssetUrl(ref: string): string {
  if (ref.startsWith(ASSETS_SCHEME)) {
    const key = ref.slice(ASSETS_SCHEME.length).replace(/^\/+/, '')
    return `${bucketBaseUrl()}/${key}`
  }
  return ref
}

/** Build an `assets://<slug>/<filename>` reference. */
export function buildAssetRef(slug: string, filename: string): string {
  return `${ASSETS_SCHEME}${slug}/${filename}`
}

/** Parse an `assets://…` ref into its bucket key. Returns `null` for non-asset refs. */
export function assetRefToKey(ref: string): string | null {
  if (!ref.startsWith(ASSETS_SCHEME)) return null
  return ref.slice(ASSETS_SCHEME.length).replace(/^\/+/, '')
}

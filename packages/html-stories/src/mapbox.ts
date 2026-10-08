/**
 * The public Mapbox token HTML stories draw their maps with. One config, two
 * consumers: the agent brief (./brief) tells the agent how to use it, and the
 * served page (./branding) gets it injected as `window.MAPBOX_ACCESS_TOKEN`
 * before any of the story's own scripts run. A story reads the injected token
 * first and falls back to the one the brief gave it, so rotating the token
 * (or URL-restricting a new one) reaches every published map without a re-post.
 *
 * Config: HTML_STORIES_MAPBOX_TOKEN, a token just for stories (handy for one
 * restricted to the sites' URLs), else NEXT_PUBLIC_MAPBOX_TOKEN, the one the
 * sites' own map pages use. Only a public `pk.` token is ever used: the brief
 * is served publicly and the token sits in page source, so a secret `sk.`
 * token must never reach either.
 */

/** The global the platform sets on a served story. */
export const MAPBOX_TOKEN_GLOBAL = 'MAPBOX_ACCESS_TOKEN'

const PUBLIC_TOKEN = /^pk\.[A-Za-z0-9._-]+$/

/**
 * The configured public token, or null for none. `option` overrides the env:
 * a string is used if it is a public token, null means no Mapbox.
 */
export function storyMapboxToken(option?: string | null): string | null {
  const raw =
    option === undefined
      ? // Spelled out so Next inlines the public one into the admin preview's bundle.
        process.env.HTML_STORIES_MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN
      : option
  const token = raw?.trim()
  return token && PUBLIC_TOKEN.test(token) ? token : null
}

/**
 * The `<script>` that sets the token on a served story, or '' when there is no
 * token or the page doesn't use Mapbox (so other stories stay byte-for-byte).
 */
export function mapboxTokenScript(html: string, token: string | null): string {
  if (!token || !/mapbox/i.test(html)) return ''
  return `<script>window.${MAPBOX_TOKEN_GLOBAL}=${JSON.stringify(token)}</script>`
}

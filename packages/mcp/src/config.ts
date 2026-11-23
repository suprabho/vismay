/**
 * Environment configuration for the Vismay MCP server.
 *
 * The metadata tools (`list_verticals` / `list_modules`) need nothing here.
 * Rendering tools need a reachable Next dev server and (for video) Supabase:
 *   - render_module_image / embed_url  → CATALOG_BASE_URL (the @vismay/catalog app)
 *   - render_story_video               → VIZMAYA_BASE_URL + Supabase service creds
 *
 * Everything is read lazily so a client can use the metadata tools without any
 * env set, and only hits a "missing env" error when it actually invokes a tool
 * that needs the corresponding value.
 */

export interface VismayMcpConfig {
  /** Base URL of the running @vismay/catalog dev server, e.g. http://localhost:3100 */
  catalogBaseUrl: string
  /** Base URL of the running vizmaya-fyi dev server, e.g. http://localhost:3000 */
  vizmayaBaseUrl: string
  /** Monorepo root from VISMAY_REPO_ROOT, used as cwd when shelling out to the video pipeline; else derived there. */
  repoRoot: string | undefined
  /** Directory used when render_module_image is asked to return a file path. */
  screenshotDir: string
  /** Site that hosts vizmaya HTML stories and their publish API, e.g. https://vizmaya.fyi */
  htmlStoriesUrl: string
  /** Site that hosts footshorts HTML stories, e.g. https://footshorts.com */
  footshortsHtmlStoriesUrl: string
  /** Site that hosts vizf1 HTML stories, e.g. https://www.vizf1.com */
  vizf1HtmlStoriesUrl: string
  /** Site that hosts viznba HTML stories, e.g. https://nba.vizmaya.fyi */
  viznbaHtmlStoriesUrl: string
  /** Site that hosts travel HTML stories (each private to a trip), e.g. https://protrip.vismay.xyz */
  travelHtmlStoriesUrl: string
  /**
   * True for the public HTTP endpoint (./hosted.ts). The hosted server reads
   * no local files and takes each publish token from the caller's request,
   * not from its own env.
   */
  hosted: boolean
  /** The publish token for an app's site, or null: the env locally, the caller's headers when hosted. */
  tokenFor: (app: HtmlStoryApp) => string | null
}

/** The apps whose sites host HTML stories (mirrors @vismay/html-stories/apps). */
export type HtmlStoryApp = 'vizmaya-fyi' | 'footshorts' | 'vizf1' | 'viznba' | 'travel'

/** The env var that overrides each app's site URL, named in errors when a site redirects. */
export const SITE_URL_ENV: Record<HtmlStoryApp, string> = {
  'vizmaya-fyi': 'HTML_STORIES_URL',
  footshorts: 'FOOTSHORTS_HTML_STORIES_URL',
  vizf1: 'VIZF1_HTML_STORIES_URL',
  viznba: 'VIZNBA_HTML_STORIES_URL',
  travel: 'TRAVEL_HTML_STORIES_URL',
}

/** The hosting site for an app's HTML stories. */
export function htmlStoriesUrlFor(config: VismayMcpConfig, app: HtmlStoryApp): string {
  if (app === 'footshorts') return config.footshortsHtmlStoriesUrl
  if (app === 'vizf1') return config.vizf1HtmlStoriesUrl
  if (app === 'viznba') return config.viznbaHtmlStoriesUrl
  if (app === 'travel') return config.travelHtmlStoriesUrl
  return config.htmlStoriesUrl
}

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

export function loadConfig(): VismayMcpConfig {
  return {
    catalogBaseUrl: env('CATALOG_BASE_URL') ?? 'http://localhost:3100',
    vizmayaBaseUrl: env('VIZMAYA_BASE_URL') ?? 'http://localhost:3000',
    repoRoot: env('VISMAY_REPO_ROOT'),
    screenshotDir: env('SCREENSHOT_DIR') ?? '/tmp/vismay-mcp-screenshots',
    // www is canonical for both: the apex redirects to it, and a redirect to another host drops the
    // Authorization header, so an apex default turned every token call into "unauthorized" (siteFetch.ts).
    htmlStoriesUrl: (env('HTML_STORIES_URL') ?? 'https://www.vizmaya.fyi').replace(/\/$/, ''),
    footshortsHtmlStoriesUrl: (env('FOOTSHORTS_HTML_STORIES_URL') ?? 'https://www.footshorts.com').replace(/\/$/, ''),
    // www is canonical: the apex redirects, and a redirected POST loses its body.
    vizf1HtmlStoriesUrl: (env('VIZF1_HTML_STORIES_URL') ?? 'https://www.vizf1.com').replace(/\/$/, ''),
    // Placeholder until the VizNBA domain is live: set VIZNBA_HTML_STORIES_URL.
    viznbaHtmlStoriesUrl: (env('VIZNBA_HTML_STORIES_URL') ?? 'https://nba.vizmaya.fyi').replace(/\/$/, ''),
    travelHtmlStoriesUrl: (env('TRAVEL_HTML_STORIES_URL') ?? 'https://protrip.vismay.xyz').replace(/\/$/, ''),
    hosted: false,
    tokenFor: envHtmlStoriesToken,
  }
}

/** Whether CATALOG_BASE_URL is set; the hosted server offers the catalog tools only then. */
export function catalogConfigured(): boolean {
  return !!env('CATALOG_BASE_URL')
}

/**
 * The publish token for an app's HTML stories from this process's env, or null.
 * Each deployment has its own HTML_STORIES_TOKEN; footshorts' is
 * FOOTSHORTS_HTML_STORIES_TOKEN here, vizf1's VIZF1_HTML_STORIES_TOKEN,
 * viznba's VIZNBA_HTML_STORIES_TOKEN and travel's TRAVEL_HTML_STORIES_TOKEN,
 * each falling back to HTML_STORIES_TOKEN when the sites share one value.
 */
export function envHtmlStoriesToken(app: HtmlStoryApp): string | null {
  if (app === 'footshorts') return env('FOOTSHORTS_HTML_STORIES_TOKEN') ?? env('HTML_STORIES_TOKEN') ?? null
  if (app === 'vizf1') return env('VIZF1_HTML_STORIES_TOKEN') ?? env('HTML_STORIES_TOKEN') ?? null
  if (app === 'viznba') return env('VIZNBA_HTML_STORIES_TOKEN') ?? env('HTML_STORIES_TOKEN') ?? null
  if (app === 'travel') return env('TRAVEL_HTML_STORIES_TOKEN') ?? env('HTML_STORIES_TOKEN') ?? null
  return env('HTML_STORIES_TOKEN') ?? null
}

/** The request header the hosted server reads an app's own publish token from (else the bearer token). */
export const HOSTED_TOKEN_HEADERS: Record<Exclude<HtmlStoryApp, 'vizmaya-fyi'>, string> = {
  footshorts: 'x-footshorts-token',
  vizf1: 'x-vizf1-token',
  viznba: 'x-viznba-token',
  travel: 'x-travel-token',
}

const ENV_TOKEN_NAMES: Record<HtmlStoryApp, string> = {
  'vizmaya-fyi': 'HTML_STORIES_TOKEN',
  footshorts: 'FOOTSHORTS_HTML_STORIES_TOKEN',
  vizf1: 'VIZF1_HTML_STORIES_TOKEN',
  viznba: 'VIZNBA_HTML_STORIES_TOKEN',
  travel: 'TRAVEL_HTML_STORIES_TOKEN',
}

/**
 * Where an app's publish token has to come from, for error messages: the
 * server env locally, the caller's headers on the hosted server.
 */
export function tokenSource(config: VismayMcpConfig, app: HtmlStoryApp): string {
  if (config.hosted) {
    return app === 'vizmaya-fyi'
      ? 'the vizmaya-fyi publish token sent as "Authorization: Bearer <token>"'
      : `the ${app} publish token sent as "${HOSTED_TOKEN_HEADERS[app]}: <token>" (or as the bearer token, when the sites share one)`
  }
  const name = ENV_TOKEN_NAMES[app]
  return app === 'vizmaya-fyi'
    ? `${name} in the MCP server env (the same value as HTML_STORIES_TOKEN on the vizmaya-fyi deployment)`
    : `${name} (or HTML_STORIES_TOKEN) in the MCP server env (the same value as HTML_STORIES_TOKEN on the ${app} web deployment)`
}

/** The publish token for an app, or a descriptive error saying where to set it. */
export function requireHtmlStoriesToken(config: VismayMcpConfig, app: HtmlStoryApp = 'vizmaya-fyi'): { token: string } {
  const token = config.tokenFor(app)
  if (!token) {
    const tool = app === 'vizmaya-fyi' ? 'This tool' : `This tool, for ${app},`
    throw new Error(`${tool} needs ${tokenSource(config, app)}.`)
  }
  return { token }
}

/** Throws a descriptive error if the HeyGen API key is missing. */
export function requireHeygenEnv(): { apiKey: string } {
  const apiKey = env('HEYGEN_API_KEY')
  if (!apiKey) {
    throw new Error(
      'The HeyGen tools need HEYGEN_API_KEY in the MCP server env ' +
        '(set it in your MCP client config).',
    )
  }
  return { apiKey }
}

/** Throws a descriptive error if a required Supabase var is missing. */
export function requireSupabaseEnv(): { url: string; serviceKey: string } {
  const url = env('NEXT_PUBLIC_SUPABASE_URL')
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    throw new Error(
      'render_story_video needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY ' +
        'in the MCP server env (set them in your MCP client config).',
    )
  }
  return { url, serviceKey }
}

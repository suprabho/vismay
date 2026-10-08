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
  /** Monorepo root, used as cwd when shelling out to the video pipeline. */
  repoRoot: string
  /** Directory used when render_module_image is asked to return a file path. */
  screenshotDir: string
  /** Site that hosts vizmaya HTML stories and their publish API, e.g. https://vizmaya.fyi */
  htmlStoriesUrl: string
  /** Site that hosts footshorts HTML stories, e.g. https://footshorts.com */
  footshortsHtmlStoriesUrl: string
  /** Site that hosts vizf1 HTML stories, e.g. https://www.vizf1.com */
  vizf1HtmlStoriesUrl: string
  /** Site that hosts viznba HTML stories, e.g. https://viznba.com */
  viznbaHtmlStoriesUrl: string
}

/** The apps whose sites host HTML stories (mirrors @vismay/html-stories/apps). */
export type HtmlStoryApp = 'vizmaya-fyi' | 'footshorts' | 'vizf1' | 'viznba'

/** The hosting site for an app's HTML stories. */
export function htmlStoriesUrlFor(config: VismayMcpConfig, app: HtmlStoryApp): string {
  if (app === 'footshorts') return config.footshortsHtmlStoriesUrl
  if (app === 'vizf1') return config.vizf1HtmlStoriesUrl
  if (app === 'viznba') return config.viznbaHtmlStoriesUrl
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
    // packages/mcp/src/config.ts → up three dirs → monorepo root.
    repoRoot:
      env('VISMAY_REPO_ROOT') ??
      new URL('../../../', import.meta.url).pathname.replace(/\/$/, ''),
    screenshotDir: env('SCREENSHOT_DIR') ?? '/tmp/vismay-mcp-screenshots',
    htmlStoriesUrl: (env('HTML_STORIES_URL') ?? 'https://vizmaya.fyi').replace(/\/$/, ''),
    footshortsHtmlStoriesUrl: (env('FOOTSHORTS_HTML_STORIES_URL') ?? 'https://footshorts.com').replace(/\/$/, ''),
    // www is canonical: the apex redirects, and a redirected POST loses its body.
    vizf1HtmlStoriesUrl: (env('VIZF1_HTML_STORIES_URL') ?? 'https://www.vizf1.com').replace(/\/$/, ''),
    // Placeholder until the VizNBA domain is live: set VIZNBA_HTML_STORIES_URL.
    viznbaHtmlStoriesUrl: (env('VIZNBA_HTML_STORIES_URL') ?? 'https://viznba.com').replace(/\/$/, ''),
  }
}

/**
 * The publish token for an app's HTML stories, or null. Each deployment has its
 * own HTML_STORIES_TOKEN; footshorts' is FOOTSHORTS_HTML_STORIES_TOKEN here,
 * vizf1's VIZF1_HTML_STORIES_TOKEN and viznba's VIZNBA_HTML_STORIES_TOKEN,
 * each falling back to HTML_STORIES_TOKEN when the sites share one value.
 */
export function htmlStoriesToken(app: HtmlStoryApp): string | null {
  if (app === 'footshorts') return env('FOOTSHORTS_HTML_STORIES_TOKEN') ?? env('HTML_STORIES_TOKEN') ?? null
  if (app === 'vizf1') return env('VIZF1_HTML_STORIES_TOKEN') ?? env('HTML_STORIES_TOKEN') ?? null
  if (app === 'viznba') return env('VIZNBA_HTML_STORIES_TOKEN') ?? env('HTML_STORIES_TOKEN') ?? null
  return env('HTML_STORIES_TOKEN') ?? null
}

/** Throws a descriptive error if the HTML story publish token is missing. */
export function requireHtmlStoriesEnv(app: HtmlStoryApp = 'vizmaya-fyi'): { token: string } {
  const token = htmlStoriesToken(app)
  if (!token) {
    throw new Error(
      app === 'footshorts'
        ? 'publish_html_story for footshorts needs FOOTSHORTS_HTML_STORIES_TOKEN (or HTML_STORIES_TOKEN) in ' +
            'the MCP server env (the same value as HTML_STORIES_TOKEN on the footshorts web deployment).'
        : app === 'vizf1'
          ? 'publish_html_story for vizf1 needs VIZF1_HTML_STORIES_TOKEN (or HTML_STORIES_TOKEN) in ' +
              'the MCP server env (the same value as HTML_STORIES_TOKEN on the vizf1 web deployment).'
          : app === 'viznba'
            ? 'publish_html_story for viznba needs VIZNBA_HTML_STORIES_TOKEN (or HTML_STORIES_TOKEN) in ' +
                'the MCP server env (the same value as HTML_STORIES_TOKEN on the viznba web deployment).'
          : 'publish_html_story needs HTML_STORIES_TOKEN in the MCP server env ' +
            '(the same value as HTML_STORIES_TOKEN on the vizmaya-fyi deployment).',
    )
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

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
  }
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

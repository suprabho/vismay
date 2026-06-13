/**
 * Fetches module metadata from the running @vismay/catalog dev server's
 * /api/modules route. We read it over HTTP rather than importing viz-engine in
 * this raw Node process, because the viz-engine barrel transitively imports CSS
 * (mapbox-gl) and DOM code that only resolves inside Next's bundler.
 *
 * Results are cached for the lifetime of the process (the registry is static
 * per build); callers can force a refresh.
 */

export interface SerializedModule {
  type: string
  label: string
  vertical: string
  slots: string[]
  mountingMode: string
  readinessProfile: string | null
  regionPreferences: string[]
  adminForm: unknown
  configSchema: unknown
}

let cache: SerializedModule[] | null = null

export async function fetchModules(
  catalogBaseUrl: string,
  force = false,
): Promise<SerializedModule[]> {
  if (cache && !force) return cache
  const base = catalogBaseUrl.replace(/\/+$/, '')
  const url = `${base}/api/modules`
  let res: Response
  try {
    res = await fetch(url)
  } catch (e) {
    throw new Error(
      `Could not reach the catalog at ${url} (${e instanceof Error ? e.message : String(e)}). ` +
        'Start it with: PORT=3100 pnpm --filter @vismay/catalog dev',
    )
  }
  if (!res.ok) {
    throw new Error(`GET ${url} returned ${res.status} ${res.statusText}`)
  }
  const body = (await res.json()) as { modules?: SerializedModule[] }
  if (!body.modules) throw new Error(`Unexpected response from ${url}`)
  cache = body.modules
  return cache
}

export async function findModule(
  catalogBaseUrl: string,
  type: string,
): Promise<SerializedModule> {
  const modules = await fetchModules(catalogBaseUrl)
  const found = modules.find((m) => m.type === type)
  if (!found) {
    throw new Error(
      `Unknown module type '${type}'. Call list_modules to see registered types.`,
    )
  }
  return found
}

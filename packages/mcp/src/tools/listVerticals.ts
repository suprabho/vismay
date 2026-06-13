/**
 * Tools: `list_verticals` and `list_modules`.
 *
 * Both read module metadata from the catalog's /api/modules route (see
 * catalogClient). list_modules surfaces each module's config JSON Schema — the
 * key affordance for an orchestrator agent: it describes exactly what `config`
 * to pass to render_module_image / embed_url.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VismayMcpConfig } from '../config.js'
import { fetchModules, type SerializedModule } from '../catalogClient.js'

const VERTICAL_LABELS: Record<string, string> = {
  core: 'Core engine',
  f1: 'Formula 1',
  footshorts: 'Footshorts (football)',
  starship: 'SpaceX Starship',
  kidzovo: 'Kidzovo (kids)',
}

const VERTICAL_FILTER = ['core', 'f1', 'footshorts', 'starship', 'kidzovo'] as const

function stripSchema(m: SerializedModule): SerializedModule {
  return { ...m, configSchema: null }
}

export function registerListTools(server: McpServer, config: VismayMcpConfig): void {
  server.registerTool(
    'list_verticals',
    {
      title: 'List Vismay verticals',
      description:
        'List the Vismay viz verticals (domain-specific module collections) plus the core ' +
        'engine, with how many modules each contributes. Use list_modules for details. ' +
        '(Reads from the running @vismay/catalog dev server.)',
      inputSchema: {},
    },
    async () => {
      const modules = await fetchModules(config.catalogBaseUrl)
      const counts = new Map<string, number>()
      for (const m of modules) counts.set(m.vertical, (counts.get(m.vertical) ?? 0) + 1)
      const verticals = [...counts.keys()]
        .sort()
        .map((slug) => ({ slug, label: VERTICAL_LABELS[slug] ?? slug, moduleCount: counts.get(slug) ?? 0 }))
      const payload = { verticals, totalModules: modules.length }
      return { content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }] }
    },
  )

  server.registerTool(
    'list_modules',
    {
      title: 'List Vismay viz modules',
      description:
        'List registered Vismay viz modules with their slots, admin-form fields, and config ' +
        'JSON Schema. The configSchema tells you exactly what `config` to pass to ' +
        'render_module_image / embed_url. Optionally filter to one vertical.',
      inputSchema: {
        vertical: z
          .enum(VERTICAL_FILTER)
          .optional()
          .describe("Filter to one vertical, e.g. 'footshorts', or 'core' for engine modules."),
        includeSchema: z
          .boolean()
          .default(true)
          .describe('Include each module config JSON Schema (default true).'),
      },
    },
    async ({ vertical, includeSchema }) => {
      let modules = await fetchModules(config.catalogBaseUrl)
      if (vertical) modules = modules.filter((m) => m.vertical === vertical)
      if (includeSchema === false) modules = modules.map(stripSchema)
      return {
        content: [
          { type: 'text', text: JSON.stringify({ count: modules.length, modules }, null, 2) },
        ],
      }
    },
  )
}

/**
 * Tool: `embed_url`.
 *
 * Returns a live, iframe-able URL that renders a single module from the given
 * config (served by apps/catalog/app/embed/[type]). We confirm the module type
 * exists (via the catalog /api/modules route) and pick a default slot, then
 * build the URL. The catalog dev server must be running at CATALOG_BASE_URL.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VismayMcpConfig } from '../config.js'
import { buildEmbedUrl, type VizSlot } from '../catalogUrl.js'
import { findModule } from '../catalogClient.js'

/** Resolve the module and a sensible default slot. Shared with render_module_image. */
export async function resolveSlot(
  catalogBaseUrl: string,
  type: string,
): Promise<VizSlot> {
  const m = await findModule(catalogBaseUrl, type)
  return (m.slots[0] as VizSlot) ?? 'foreground'
}

export function registerEmbedUrlTool(server: McpServer, config: VismayMcpConfig): void {
  server.registerTool(
    'embed_url',
    {
      title: 'Live embed URL for a Vismay module',
      description:
        'Build a live, iframe-able URL that renders one Vismay viz module from the given ' +
        'config (served by the running @vismay/catalog dev server). Use render_module_image ' +
        'if you need a PNG instead of a URL.',
      inputSchema: {
        type: z.string().describe("Registered module type, e.g. 'fs:match-card'."),
        config: z
          .record(z.unknown())
          .describe('Module config object matching the module configSchema.'),
        slot: z
          .enum(['foreground', 'background'])
          .optional()
          .describe('Slot to render in; defaults to the module first declared slot.'),
      },
    },
    async ({ type, config: cfg, slot }) => {
      const defaultSlot = await resolveSlot(config.catalogBaseUrl, type)
      const url = buildEmbedUrl(config.catalogBaseUrl, type, cfg, slot ?? defaultSlot)
      return { content: [{ type: 'text', text: url }] }
    },
  )
}

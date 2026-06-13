/**
 * Tool: `render_module_image`.
 *
 * Renders one module from a config to a PNG by screenshotting the catalog embed
 * URL with headless Chromium. Returns the image inline (base64) by default, or
 * writes it to SCREENSHOT_DIR and returns the path. `transparent: true` yields
 * an alpha PNG — handy for handing a foreground layer to HeyGen to composite
 * over an avatar.
 *
 * Prereqs: the @vismay/catalog dev server running at CATALOG_BASE_URL and
 * Playwright Chromium installed (`npx playwright install chromium`).
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VismayMcpConfig } from '../config.js'
import { buildEmbedUrl } from '../catalogUrl.js'
import { screenshotModule } from '../browser.js'
import { resolveSlot } from './embedUrl.js'

export function registerRenderModuleImageTool(
  server: McpServer,
  config: VismayMcpConfig,
): void {
  server.registerTool(
    'render_module_image',
    {
      title: 'Render a Vismay module to a PNG',
      description:
        'Render one Vismay viz module from a config to a PNG image (via headless Chromium ' +
        'against the running @vismay/catalog dev server). Returns the image inline by default. ' +
        'Use transparent=true for an alpha PNG to overlay on a HeyGen avatar video.',
      inputSchema: {
        type: z.string().describe("Registered module type, e.g. 'fs:match-card'."),
        config: z
          .record(z.unknown())
          .describe('Module config object matching the module configSchema.'),
        slot: z.enum(['foreground', 'background']).optional(),
        width: z.number().int().min(64).max(4096).default(1280),
        height: z.number().int().min(64).max(4096).default(720),
        deviceScaleFactor: z.number().min(1).max(4).default(2),
        transparent: z
          .boolean()
          .default(false)
          .describe('Omit the page background for an alpha PNG.'),
        returnAs: z
          .enum(['base64', 'path'])
          .default('base64')
          .describe("'base64' returns the image inline; 'path' writes to SCREENSHOT_DIR."),
        timeoutMs: z.number().int().min(1000).max(180_000).default(30_000),
      },
    },
    async (args) => {
      const defaultSlot = await resolveSlot(config.catalogBaseUrl, args.type)
      const url = buildEmbedUrl(
        config.catalogBaseUrl,
        args.type,
        args.config,
        args.slot ?? defaultSlot,
        args.transparent ? 'transparent' : 'surface',
      )
      const png = await screenshotModule({
        url,
        width: args.width,
        height: args.height,
        deviceScaleFactor: args.deviceScaleFactor,
        transparent: args.transparent,
        readyTimeoutMs: args.timeoutMs,
      })

      if (args.returnAs === 'path') {
        await mkdir(config.screenshotDir, { recursive: true })
        const safe = args.type.replace(/[^a-zA-Z0-9_-]+/g, '_')
        const path = join(config.screenshotDir, `${safe}-${Date.now()}.png`)
        await writeFile(path, png)
        return { content: [{ type: 'text', text: path }] }
      }

      return {
        content: [{ type: 'image', data: png.toString('base64'), mimeType: 'image/png' }],
      }
    },
  )
}

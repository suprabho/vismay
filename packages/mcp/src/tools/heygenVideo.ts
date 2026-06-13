/**
 * Tools: `list_heygen_templates` and `generate_heygen_video`.
 *
 * Drive HeyGen's Template API directly (no shelling out — the client is pure
 * HTTP, unlike the ffmpeg/Chromium video pipeline `render_story_video` wraps).
 * The agent flow is: list templates → inspect one's variables → fill them →
 * generate. A template is the reusable layout you built in the HeyGen web UI;
 * its variables are the named text/image/video slots that change per render.
 *
 * Shares the exact client used by the CLI runner and the GitHub-dispatch path,
 * so behaviour matches across all three entry points. Needs HEYGEN_API_KEY in
 * the MCP server env.
 */

import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  listTemplates,
  getTemplate,
  generateFromTemplate,
  pollVideo,
  getVideoStatus,
  HeygenTimeoutError,
  type HeygenVariable,
} from '@vismay/content-source/heygenTemplate'
import type { VismayMcpConfig } from '../config.js'
import { requireHeygenEnv } from '../config.js'

/** zod shape for a single filled template variable. */
const variableSchema = z.object({
  name: z.string(),
  type: z
    .string()
    .describe("Slot type from the template, e.g. 'text', 'image', 'video', 'audio'."),
  properties: z
    .record(z.any())
    .describe(
      "Filled value: text → {content}; image/video/audio → {url} (or {asset_id}), optional {fit}.",
    ),
})

export function registerHeygenTools(
  server: McpServer,
  _config: VismayMcpConfig,
): void {
  server.registerTool(
    'list_heygen_templates',
    {
      title: 'List HeyGen templates (and inspect a template’s variables)',
      description:
        'List the HeyGen templates available to the account. Pass a template_id to ' +
        'instead return that template’s fillable variables (slot name → type), which ' +
        'tells you what to pass to generate_heygen_video. Requires HEYGEN_API_KEY.',
      inputSchema: {
        templateId: z
          .string()
          .optional()
          .describe('If set, return this template’s variables instead of the list.'),
      },
    },
    async ({ templateId }) => {
      const { apiKey } = requireHeygenEnv()

      if (templateId) {
        const detail = await getTemplate(templateId, { apiKey })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { template_id: templateId, variables: detail.variables },
                null,
                2,
              ),
            },
          ],
        }
      }

      const templates = await listTemplates({ apiKey })
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              templates.map((t) => ({ template_id: t.template_id, name: t.name })),
              null,
              2,
            ),
          },
        ],
      }
    },
  )

  server.registerTool(
    'generate_heygen_video',
    {
      title: 'Generate a HeyGen video from a template',
      description:
        'Render a HeyGen template by filling its variables. Use list_heygen_templates ' +
        '(with a template_id) first to learn the variable names/types. By default this ' +
        'does a free, watermarked test render and waits for the result — set test=false ' +
        'for a final paid render, and wait=false to return immediately with a video_id ' +
        'you can poll later. Requires HEYGEN_API_KEY.',
      inputSchema: {
        templateId: z.string().describe('HeyGen template ID.'),
        variables: z
          .record(variableSchema)
          .describe('Map of variable name → filled variable (keys must match the template).'),
        title: z.string().optional().describe('Dashboard title for the render.'),
        dimension: z
          .object({ width: z.number().int().positive(), height: z.number().int().positive() })
          .optional()
          .describe('Output pixel size. Omit to use the template’s own dimension.'),
        caption: z.boolean().default(false).describe('Burn in captions.'),
        test: z
          .boolean()
          .default(true)
          .describe('Free watermarked preview (no paid credits). Set false for a final render.'),
        wait: z
          .boolean()
          .default(true)
          .describe('Poll to completion and return the video URL. False = return video_id now.'),
      },
    },
    async ({ templateId, variables, title, dimension, caption, test, wait }) => {
      const { apiKey } = requireHeygenEnv()

      const { videoId } = await generateFromTemplate({
        apiKey,
        templateId,
        variables: variables as Record<string, HeygenVariable>,
        title,
        dimension,
        caption,
        test,
      })

      if (!wait) {
        const state = await getVideoStatus(videoId, { apiKey })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                { video_id: videoId, status: state.status, test }, null, 2,
              ),
            },
          ],
        }
      }

      try {
        const state = await pollVideo(videoId, { apiKey, timeoutMs: 8 * 60_000 })
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  video_id: videoId,
                  status: state.status,
                  video_url: state.videoUrl,
                  thumbnail_url: state.thumbnailUrl,
                  duration: state.duration,
                  test,
                },
                null,
                2,
              ),
            },
          ],
        }
      } catch (err) {
        // Timeout isn't a failure — the render is still going. Hand back the
        // video_id so the caller can poll again rather than re-generating.
        if (err instanceof HeygenTimeoutError) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    video_id: videoId,
                    status: 'processing',
                    note: 'Still rendering after 8 min. Re-check later with list/status by video_id.',
                  },
                  null,
                  2,
                ),
              },
            ],
          }
        }
        return {
          isError: true,
          content: [
            { type: 'text', text: `HeyGen render failed: ${(err as Error).message}` },
          ],
        }
      }
    },
  )
}

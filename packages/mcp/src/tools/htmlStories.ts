/**
 * Tools: `get_html_story_brief` and `publish_html_story`.
 *
 * The agent-authored HTML story pipeline (packages/html-stories): the agent
 * reads the brief, writes one self-contained HTML page, and publishes it to
 * vizmaya.fyi/s/<slug> through the token-gated publish API. Pure HTTP to the
 * deployed site, so no dev server is needed.
 */

import { readFile } from 'node:fs/promises'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { htmlStoryBrief } from '@vismay/html-stories/brief'
import { requireHtmlStoriesEnv, type VismayMcpConfig } from '../config.js'

export function registerHtmlStoryTools(server: McpServer, config: VismayMcpConfig): void {
  server.registerTool(
    'get_html_story_brief',
    {
      title: 'Get the vizmaya HTML story brief',
      description:
        'Read this before writing a vizmaya HTML story. It covers the hosting contract ' +
        '(one self-contained HTML file), the house design direction, chart rules, a ' +
        'self-check list, and how to publish. Pass randomStyle=true to swap the house style ' +
        'for a palette and fonts drawn at random from the existing stories.',
      inputSchema: {
        randomStyle: z
          .boolean()
          .default(false)
          .describe('Use a random palette + font trio from an existing story instead of the house style.'),
      },
    },
    async ({ randomStyle }) => {
      const houseBrief = () => htmlStoryBrief({ siteUrl: config.htmlStoriesUrl })
      if (!randomStyle) return { content: [{ type: 'text', text: houseBrief() }] }
      // The story themes live with the site's content, so ask the site for the
      // randomized brief rather than reading stories here.
      try {
        const res = await fetch(`${config.htmlStoriesUrl}/api/html-stories/brief?style=random`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return { content: [{ type: 'text', text: await res.text() }] }
      } catch (e) {
        const reason = e instanceof Error ? e.message : String(e)
        return {
          content: [
            { type: 'text', text: `(Random style unavailable: ${reason}. Using the house style.)\n\n${houseBrief()}` },
          ],
        }
      }
    },
  )

  server.registerTool(
    'publish_html_story',
    {
      title: 'Publish a vizmaya HTML story',
      description:
        'Publish one complete, self-contained HTML document to vizmaya.fyi/s/<slug>. Pass the ' +
        'document as `html` or as a local `filePath`. Without publish=true it saves as a draft ' +
        '(re-posting an already published slug keeps it live). Posting to an existing slug ' +
        'replaces it; earlier versions stay restorable in admin. Returns the URL and lint ' +
        'warnings: fix them and post again to the same slug.',
      inputSchema: {
        slug: z
          .string()
          .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase words joined by single hyphens')
          .max(80)
          .optional()
          .describe('URL slug, e.g. india-solar-boom-2026. Derived from <title> if omitted.'),
        html: z.string().optional().describe('The complete HTML document.'),
        filePath: z.string().optional().describe('Absolute path to a local .html file (instead of html).'),
        publish: z.boolean().default(false).describe('Make the story public now.'),
        title: z.string().optional().describe('Override the <title>-derived title.'),
        description: z.string().optional().describe('Override the meta description.'),
      },
    },
    async ({ slug, html, filePath, publish, title, description }) => {
      const { token } = requireHtmlStoriesEnv()
      if (!html && !filePath) throw new Error('Pass either html or filePath.')
      const doc = html ?? (await readFile(filePath!, 'utf8'))

      const res = await fetch(`${config.htmlStoriesUrl}/api/html-stories`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          html: doc,
          status: publish ? 'published' : undefined,
          title,
          description,
          source: 'mcp',
        }),
      })
      const body = await res.text()
      return {
        isError: !res.ok,
        content: [{ type: 'text', text: res.ok ? body : `Publish failed (HTTP ${res.status}): ${body}` }],
      }
    },
  )
}

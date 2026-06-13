/**
 * Tool: `render_story_video`.
 *
 * Wraps the existing vizmaya-fyi video pipeline. Rather than import an app
 * module across the package boundary, we shell out to the same CLI an admin
 * would run (`scripts/generate-video.ts`), which loads its own .env, renders via
 * Playwright + ffmpeg, uploads the MP4 to Supabase, and prints the public URL.
 * The resulting MP4 URL is the asset you hand to HeyGen.
 *
 * Prereqs (documented in the package README): the story must already have audio
 * generated, ffmpeg on PATH, Playwright Chromium, the vizmaya-fyi dev server
 * running at VIZMAYA_BASE_URL, and Supabase service creds in the env. Sub-range
 * (startMs/endMs) over the cumulative audio timeline = a section-level clip.
 */

import { spawn } from 'node:child_process'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { VismayMcpConfig } from '../config.js'
import { requireSupabaseEnv } from '../config.js'

interface RunResult {
  stdout: string
  stderr: string
  code: number | null
}

function run(
  cmd: string,
  args: string[],
  opts: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, env: opts.env })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ stdout, stderr, code }))
  })
}

/** Pull the last http(s) URL printed by the CLI (it logs the public_url last). */
function extractUrl(stdout: string): string | null {
  const matches = stdout.match(/https?:\/\/\S+\.mp4\b/g)
  return matches && matches.length ? (matches[matches.length - 1] ?? null) : null
}

export function registerRenderStoryVideoTool(
  server: McpServer,
  config: VismayMcpConfig,
): void {
  server.registerTool(
    'render_story_video',
    {
      title: 'Render a Vismay story to an MP4',
      description:
        'Render a Vismay story (by slug) to an MP4 via the autoplay video pipeline and return ' +
        'its public URL. Optionally render a section-level clip with startMs/endMs over the ' +
        'audio timeline. Requires audio already generated for the story. The returned MP4 URL ' +
        'is the asset to feed to HeyGen.',
      inputSchema: {
        slug: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+$/, 'slug must be alphanumeric/dash/underscore')
          .describe('Story slug.'),
        aspect: z.enum(['9:16', '16:9']).default('9:16'),
        startMs: z.number().int().min(0).optional().describe('Clip start (ms).'),
        endMs: z.number().int().min(1).optional().describe('Clip end (ms); must exceed startMs.'),
        force: z.boolean().default(false).describe('Bypass the render cache.'),
      },
    },
    async ({ slug, aspect, startMs, endMs, force }) => {
      // Fail fast with a clear message if creds are missing (the CLI also checks).
      requireSupabaseEnv()

      if (endMs !== undefined && endMs <= (startMs ?? 0)) {
        throw new Error('endMs must be greater than startMs.')
      }

      const args = [
        '--filter',
        'vizmaya-fyi',
        'exec',
        'tsx',
        'scripts/generate-video.ts',
        slug,
        aspect,
      ]
      if (force) args.push('--force')
      if (startMs !== undefined) args.push('--start-ms', String(startMs))
      if (endMs !== undefined) args.push('--end-ms', String(endMs))

      const env = { ...process.env, BASE_URL: config.vizmayaBaseUrl }
      const result = await run('pnpm', args, { cwd: config.repoRoot, env })

      if (result.code !== 0) {
        const tail = result.stderr.trim() || result.stdout.trim()
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `generate-video exited ${result.code}.\n${tail.slice(-2000)}`,
            },
          ],
        }
      }

      const url = extractUrl(result.stdout)
      if (!url) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `Render finished but no MP4 URL found in output.\n${result.stdout.slice(-2000)}`,
            },
          ],
        }
      }

      const cached = /Served from cache/.test(result.stdout)
      const range =
        startMs !== undefined || endMs !== undefined
          ? { startMs: startMs ?? 0, endMs: endMs ?? null }
          : null
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ public_url: url, aspect, cached, range }, null, 2),
          },
        ],
      }
    },
  )
}

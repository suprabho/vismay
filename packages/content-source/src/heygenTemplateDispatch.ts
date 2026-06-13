/**
 * Dispatch a HeyGen template render to GitHub Actions.
 *
 * A template render is not CPU-heavy (unlike the ffmpeg/Chromium video render
 * that `storyVideoDispatch` exists for) — it's a single API call followed by
 * minutes of *polling*. The reason to offload it to a runner is the same
 * serverless constraint: a Vercel-style function can't sit and poll HeyGen for
 * 5+ minutes without hitting its execution-time limit. When
 * `GITHUB_DISPATCH_TOKEN` is configured we fire a `workflow_dispatch` and let a
 * runner do the generate-and-poll; the synchronous `generateAndWait` path stays
 * the sane default for local dev and for the MCP tool.
 *
 * Required env (server only):
 *   GITHUB_DISPATCH_TOKEN  fine-grained PAT with `workflow` write on the repo
 *   GITHUB_DISPATCH_REPO   "owner/repo" (e.g. "suprabho/vismay")
 *   GITHUB_DISPATCH_REF    branch/tag the workflow runs from (default: "main")
 *
 * The runner needs HEYGEN_API_KEY in the workflow's environment secrets.
 */

import type { HeygenVariable } from './heygenTemplate'

export function isHeygenDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO,
  )
}

export interface DispatchHeygenRenderArgs {
  templateId: string
  /** Variable name → filled variable (same shape as the sync client). */
  variables: Record<string, HeygenVariable>
  title?: string
  dimension?: { width: number; height: number }
  /** Free, watermarked preview render (no paid credits). */
  test?: boolean
}

/**
 * Fire the `render-heygen.yml` workflow. `workflow_dispatch` inputs are
 * string-only, so the variables/dimension objects are JSON-encoded and the
 * runner's CLI parses them back (see `scripts/heygen-generate.ts`).
 */
export async function dispatchHeygenRenderJob(
  args: DispatchHeygenRenderArgs,
): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }

  const WORKFLOW_FILE = 'render-heygen.yml'

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ref,
        inputs: {
          template_id: args.templateId,
          variables: JSON.stringify(args.variables),
          title: args.title ?? '',
          dimension: args.dimension ? JSON.stringify(args.dimension) : '',
          test: args.test ? 'true' : 'false',
        },
      }),
    },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `GitHub workflow dispatch failed: ${res.status} ${body.slice(0, 300)}`,
    )
  }
  // 204 No Content on success — nothing to parse.
}

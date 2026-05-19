/**
 * Dispatch a video-render job to GitHub Actions.
 *
 * The render itself takes several minutes and needs ffmpeg + Chromium, which
 * Vercel-style serverless can't host. Instead, when `GITHUB_DISPATCH_TOKEN`
 * is configured we fire a `workflow_dispatch` and let a real Linux runner do
 * the work. The runner uploads the MP4 to the same `story-video` bucket the
 * sync path uses, so callers just keep polling the cache lookup until the
 * row appears.
 *
 * Required env (server only):
 *   GITHUB_DISPATCH_TOKEN  fine-grained PAT with `workflow` write on the repo
 *   GITHUB_DISPATCH_REPO   "owner/repo" (e.g. "suprabho/vizmaya-fyi")
 *   GITHUB_DISPATCH_REF    branch/tag the workflow runs from (default: "main")
 *
 * Without these set, the API route falls back to synchronous rendering — the
 * sane default for local dev.
 */

import type { VideoAspect, VideoRange } from '@vismay/content-source/storyVideo'

export function isDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO
  )
}

export async function dispatchRenderJob(args: {
  slug: string
  aspect: VideoAspect
  baseUrl: string
  /** Sub-range to render. Omit for a full render. */
  range?: VideoRange
}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }

  // Workflow file name is fixed — the route doesn't need to know about it
  // beyond this constant. Keeping it here means the route file stays generic.
  const WORKFLOW_FILE = 'render-video.yml'

  // workflow_dispatch inputs only support strings. Empty string = full render
  // on the runner side; the script reads them via process.env / argv.
  const startMsInput = args.range ? String(args.range.startMs) : ''
  const endMsInput = args.range ? String(args.range.endMs) : ''

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
          slug: args.slug,
          aspect: args.aspect,
          base_url: args.baseUrl,
          start_ms: startMsInput,
          end_ms: endMsInput,
        },
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `GitHub workflow dispatch failed: ${res.status} ${body.slice(0, 300)}`
    )
  }
  // 204 No Content on success — nothing to parse.
}

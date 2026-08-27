/**
 * Dispatch a freeform-project video-render job to GitHub Actions.
 *
 * Mirrors `@vismay/content-source/storyVideoDispatch`: the render needs ffmpeg
 * + Chromium, which Vercel-style serverless can't host, so when
 * `GITHUB_DISPATCH_TOKEN` is configured we fire a `workflow_dispatch` and let a
 * real Linux runner do the work + upload the MP4 to the shared `story-video`
 * bucket. Callers poll the render cache until the row appears.
 *
 * Required env (server only):
 *   GITHUB_DISPATCH_TOKEN  fine-grained PAT with `workflow` write on the repo
 *   GITHUB_DISPATCH_REPO   "owner/repo" (e.g. "suprabho/vismay")
 *   GITHUB_DISPATCH_REF    branch/tag the workflow runs from (default: "main")
 *
 * Without these set, the API route falls back to synchronous rendering — the
 * sane default for local dev.
 */

import type { VideoProjectAspect } from '@vismay/content-source/videoProjects'

export function isProjectVideoDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO,
  )
}

export async function dispatchProjectVideoRenderJob(args: {
  projectId: string
  aspect: VideoProjectAspect
  baseUrl: string
}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }

  const WORKFLOW_FILE = 'render-project-video.yml'

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
          project_id: args.projectId,
          aspect: args.aspect,
          base_url: args.baseUrl,
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

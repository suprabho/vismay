/**
 * Dispatch a compose-source extraction job to GitHub Actions.
 *
 * PDF sources are transcribed page-by-page by a vision model (Claude Sonnet,
 * Gemini fallback) — a long PDF blows past serverless function limits. So when
 * `GITHUB_DISPATCH_TOKEN` is configured we fire a `workflow_dispatch` and let a
 * real Linux runner do the work (see `.github/workflows/extract-compose-source.yml`);
 * the runner writes the extracted text straight back onto the `story_sources`
 * row and the compose UI polls `GET …/sources` until it flips to `extracted`.
 *
 * Without the env set, the upload route falls back to SYNCHRONOUS text
 * extraction (fast pdf-parse, no model) — the sane default for local dev.
 *
 * Required env (server only) — shared with the video/pdf/share render lanes:
 *   GITHUB_DISPATCH_TOKEN  fine-grained PAT with `workflow` write on the repo
 *   GITHUB_DISPATCH_REPO   "owner/repo" (e.g. "suprabho/vismay")
 *   GITHUB_DISPATCH_REF    branch/tag the workflow runs from (default: "main")
 */

export function isSourceExtractDispatchConfigured(): boolean {
  return Boolean(process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO)
}

export async function dispatchSourceExtractJob(args: {
  sourceId: string
  slug: string
}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }

  const WORKFLOW_FILE = 'extract-compose-source.yml'

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
        inputs: { source_id: args.sourceId, slug: args.slug },
      }),
    },
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GitHub workflow dispatch failed: ${res.status} ${body.slice(0, 300)}`)
  }
  // 204 No Content on success — nothing to parse.
}

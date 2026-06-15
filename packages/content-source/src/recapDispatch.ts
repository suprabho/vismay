/**
 * Dispatch a daily-recap job to GitHub Actions.
 *
 * Mirrors storyAudioDispatch.ts. The recap generator (`worker/src/recap.ts`)
 * needs Supabase + Gemini and self-gates on end-of-day, so it lives behind the
 * `footshorts-recap.yml` workflow rather than running inline in a serverless
 * function. This is the manual entry point used by the admin Recaps tab for
 * ad-hoc / forced re-runs filtered by competition and/or team.
 *
 * Required env (server only):
 *   GITHUB_DISPATCH_TOKEN  fine-grained PAT with `workflow` write on the repo
 *   GITHUB_DISPATCH_REPO   "owner/repo" (e.g. "suprabho/vismay")
 *   GITHUB_DISPATCH_REF    branch/tag the workflow runs from (default: "main")
 */

export function isRecapDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO
  )
}

export async function dispatchRecapJob(args: {
  /** Recap date (YYYY-MM-DD, UTC). Omit for today. */
  date?: string
  /** Competition slug to filter on. Omit / 'all' = every competition. */
  competition?: string
  /** Team slug to filter on. Omit for no team filter. */
  team?: string
  /** Generate even if some matches are still pending (skip the end-of-day gate). */
  force?: boolean
}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }

  const WORKFLOW_FILE = 'footshorts-recap.yml'

  // workflow_dispatch inputs only support strings. The workflow's shell step
  // drops empty / 'all' values when building the recap CLI args.
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
          date: args.date ?? '',
          competition: args.competition || 'all',
          team: args.team ?? '',
          force: args.force ? 'true' : 'false',
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

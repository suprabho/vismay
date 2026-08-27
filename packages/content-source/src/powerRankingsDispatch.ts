/**
 * Dispatch a Power Rankings scrape to GitHub Actions.
 *
 * Mirrors recapDispatch.ts. The scraper (`worker/src/theanalystPowerRankings.ts`)
 * needs Supabase + Gemini, so it lives behind the
 * `footshorts-theanalyst-power-rankings.yml` workflow rather than running
 * inline in a serverless function. This is the manual entry point used by the
 * admin Power rankings tab's "Run scrape" button; the workflow also runs on a
 * weekly cron.
 *
 * Required env (server only):
 *   GITHUB_DISPATCH_TOKEN  fine-grained PAT with `workflow` write on the repo
 *   GITHUB_DISPATCH_REPO   "owner/repo" (e.g. "suprabho/vismay")
 *   GITHUB_DISPATCH_REF    branch/tag the workflow runs from (default: "main")
 */

export function isPowerRankingsDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO
  )
}

export async function dispatchPowerRankingsJob(args: {
  /** Override the article URL to scrape. Blank = the workflow's default. */
  url?: string
} = {}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }

  const WORKFLOW_FILE = 'footshorts-theanalyst-power-rankings.yml'

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
          url: args.url ?? '',
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

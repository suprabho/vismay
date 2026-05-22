/**
 * Dispatch a share-render job to GitHub Actions. Mirrors storyPdfDispatch.ts.
 *
 * Two modes: render the curated card set for a demo, or render the cards
 * referenced by a single social post. The workflow takes both inputs and
 * branches on `mode` at the script level.
 */

export function isShareDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO
  )
}

export type ShareDispatchTarget =
  | { mode: 'demo'; demoId: number }
  | { mode: 'post'; postId: string }

export async function dispatchShareRenderJob(args: {
  target: ShareDispatchTarget
  baseUrl: string
}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }
  const WORKFLOW_FILE = 'render-share.yml'
  const inputs: Record<string, string> = {
    mode: args.target.mode,
    base_url: args.baseUrl,
    demo_id: args.target.mode === 'demo' ? String(args.target.demoId) : '',
    post_id: args.target.mode === 'post' ? args.target.postId : '',
  }
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
        inputs,
      }),
    }
  )
  if (!res.ok) {
    const body = await res.text()
    throw new Error(
      `GitHub workflow dispatch failed: ${res.status} ${body.slice(0, 300)}`
    )
  }
}

/**
 * Dispatch a share-render job to GitHub Actions. Mirrors lib/storyPdfDispatch.ts.
 */

export function isShareDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO
  )
}

export async function dispatchShareRenderJob(args: {
  demoId: number
  baseUrl: string
}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }
  const WORKFLOW_FILE = 'render-share.yml'
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
          demo_id: String(args.demoId),
          base_url: args.baseUrl,
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
}

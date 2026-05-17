/**
 * Dispatch a PDF-render job to GitHub Actions.
 *
 * Mirrors lib/storyVideoDispatch.ts. The PDF render needs Playwright
 * Chromium, which Vercel-style serverless can't host reliably (no system
 * libs for Chromium). When the dispatch envs are configured, we POST a
 * `workflow_dispatch` to render-pdf.yml and let a GitHub Actions runner do
 * the work. The runner uploads the PDF to the same `story-pdf` bucket the
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

import type { PdfFormat } from './storyPdf'

export function isPdfDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO
  )
}

export async function dispatchPdfRenderJob(args: {
  slug: string
  format: PdfFormat
  baseUrl: string
}): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }

  const WORKFLOW_FILE = 'render-pdf.yml'

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
          format: args.format,
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

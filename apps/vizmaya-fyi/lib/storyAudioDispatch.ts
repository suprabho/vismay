/**
 * Dispatch an audio-regeneration job to GitHub Actions.
 *
 * Mirrors lib/storyPdfDispatch.ts. The audio render is `scripts/generate-audio.ts`
 * which calls Gemini TTS and writes WAV chunks to Supabase storage. Vercel-style
 * serverless can run the script in principle (no Chromium / ffmpeg needed) but
 * Gemini's per-request rate limit + per-day quota means a single regen can
 * stretch past serverless time limits. Pushing it to Actions also avoids
 * burning a request slot on the Vercel function.
 *
 * Required env (server only):
 *   GITHUB_DISPATCH_TOKEN  fine-grained PAT with `workflow` write on the repo
 *   GITHUB_DISPATCH_REPO   "owner/repo" (e.g. "suprabho/vizmaya-fyi")
 *   GITHUB_DISPATCH_REF    branch/tag the workflow runs from (default: "main")
 */

export function isAudioDispatchConfigured(): boolean {
  return Boolean(
    process.env.GITHUB_DISPATCH_TOKEN && process.env.GITHUB_DISPATCH_REPO
  )
}

export async function dispatchAudioRenderJob(args: { slug: string }): Promise<void> {
  const token = process.env.GITHUB_DISPATCH_TOKEN
  const repo = process.env.GITHUB_DISPATCH_REPO
  const ref = process.env.GITHUB_DISPATCH_REF ?? 'main'
  if (!token || !repo) {
    throw new Error('GITHUB_DISPATCH_TOKEN and GITHUB_DISPATCH_REPO must be set')
  }

  const WORKFLOW_FILE = 'render-audio.yml'

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

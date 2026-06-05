import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { StoryArtifacts } from '@vismay/story-pipeline'

// Shared helpers for the compose routes (not a route itself — only route.ts /
// page.tsx are routes in the app dir).

/** Where generated stories land. Defaults to the vizmaya-fyi content dir (monorepo dev). */
export function storyContentDir(): string {
  return (
    process.env.STORY_CONTENT_DIR ||
    path.resolve(process.cwd(), '../vizmaya-fyi/content/stories')
  )
}

export async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

/** Pick a non-colliding slug so a new story never clobbers an existing one. */
export async function uniqueSlug(dir: string, base: string): Promise<string> {
  let slug = base
  let n = 2
  // eslint-disable-next-line no-await-in-loop
  while (await exists(path.join(dir, `${slug}.md`))) {
    slug = `${base}-${n}`
    n++
  }
  return slug
}

/** Write the paired story files (md + config + chart JSONs + imagePrompts sidecar). */
export async function writeStoryFiles(
  dir: string,
  slug: string,
  art: StoryArtifacts,
): Promise<void> {
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, `${slug}.md`), art.markdown, 'utf8')
  await fs.writeFile(path.join(dir, `${slug}.config.yaml`), art.configYaml, 'utf8')
  if (art.charts.length > 0) {
    const chartsDir = path.join(dir, slug, 'charts')
    await fs.mkdir(chartsDir, { recursive: true })
    await Promise.all(
      art.charts.map((c) => fs.writeFile(path.join(chartsDir, `${c.id}.json`), c.json, 'utf8')),
    )
  }
  if (art.imagePrompts.length > 0) {
    await fs.writeFile(
      path.join(dir, `${slug}.imageprompts.json`),
      JSON.stringify(art.imagePrompts, null, 2),
      'utf8',
    )
  }
}

export function previewUrlFor(slug: string): string {
  const base = process.env.VIZMAYA_BASE_URL ?? ''
  return `${base}/story/${slug}`
}

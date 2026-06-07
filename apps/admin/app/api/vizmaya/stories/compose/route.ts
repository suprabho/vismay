import { NextResponse } from 'next/server'
import { stringify as yamlStringify } from 'yaml'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@vismay/content-source/contentSource'
import { writeComposeState } from '@vismay/content-source/composeState'
import { slugify, defaultsFor, type StoryFormat } from '@vismay/story-pipeline'

/**
 * Route 0 — create a compose draft and open it in the canvas.
 *
 * The canvas hard-requires a `config.yaml` with ≥1 section (`hasStoryConfig` →
 * `notFound()`, then `loadStoryConfig` throws on empty sections), so we seed a
 * minimal valid story BEFORE redirecting in. Ordering is load-bearing:
 * `writeMarkdown` runs first (in db mode it upserts the `stories` row), then
 * `writeConfigYaml` + `writeComposeState` (updates that no-op if the row is
 * absent). The compose front stages (sources → angles → outline) then replace
 * the placeholder section.
 */

interface Body {
  title?: string
  format?: 'deck' | 'map'
  appSlug?: string
}

/** A minimal valid story: one section with `text` + an (empty) `foreground` so
 *  `loadStoryConfig` accepts it without a legacy `map:` block. */
function seedStory(title: string, format: StoryFormat): { markdown: string; configYaml: string } {
  const today = new Date().toISOString().slice(0, 10)
  const frontmatter = {
    title,
    subtitle: '',
    byline: '',
    date: today,
    format,
    status: 'published',
    listed: false,
  }
  const markdown = `---\n${yamlStringify(frontmatter)}---\n\n## Draft\n\nStart composing from your sources.\n`

  const section =
    format === 'map'
      ? { text: 'Draft', map: { center: [0, 0], zoom: 1 } }
      : { text: 'Draft', foreground: [] as unknown[] }
  const configYaml = yamlStringify({ defaults: defaultsFor(format), sections: [section] })

  return { markdown, configYaml }
}

export async function POST(req: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const title = typeof body.title === 'string' ? body.title.trim() : ''
  if (!title) {
    return NextResponse.json({ error: 'missing "title"' }, { status: 400 })
  }
  const format: StoryFormat = body.format === 'map' ? 'map' : 'deck'
  const slug = slugify(title)
  if (!slug) {
    return NextResponse.json({ error: 'title produced an empty slug' }, { status: 400 })
  }

  const src = getContentSource()

  // Collision → 409 (don't clobber an existing story).
  if ((await src.readMarkdown(slug)) != null) {
    return NextResponse.json(
      { error: `a story with slug "${slug}" already exists` },
      { status: 409 },
    )
  }

  const { markdown, configYaml } = seedStory(title, format)
  try {
    await src.writeMarkdown(slug, markdown) // creates the row (db upsert)
    await src.writeConfigYaml(slug, configYaml)
    await src.updateMetadata(slug, { appSlug: body.appSlug ?? 'vizmaya-fyi' })
    await writeComposeState(slug, { phase: 'sources', format, angles: [], outline: [] })
  } catch (e) {
    return NextResponse.json(
      { error: `failed to create draft: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, slug })
}

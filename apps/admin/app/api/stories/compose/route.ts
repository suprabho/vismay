import { NextResponse } from 'next/server'
import { stringify as yamlStringify } from 'yaml'
import { isAuthed } from '@/lib/adminAuth'
import {
  getContentSource,
  verticalForApp,
  type ConfigFormat,
} from '@vismay/content-source/contentSource'
import { writeComposeState } from '@vismay/content-source/composeState'
import {
  slugify,
  defaultsFor,
  DEFAULT_THEME,
  configFormatForVertical,
  type StoryFormat,
} from '@vismay/story-pipeline'

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
function seedStory(
  title: string,
  format: StoryFormat,
  appSlug: string,
): { markdown: string; configYaml: string; configFormat: ConfigFormat } {
  const today = new Date().toISOString().slice(0, 10)
  // footshorts/vizf1 drafts must declare their `vertical` or the app's viz
  // bundle (`fs:` / `f1:` module types) never registers in the canvas/reader.
  // vizmaya-fyi maps to null — its drafts seed no vertical key (core registry).
  const vertical = verticalForApp(appSlug)
  // New verticals are JSON-native; vizmaya-fyi (null vertical) stays on YAML.
  const configFormat = configFormatForVertical(vertical)
  const frontmatter = {
    title,
    subtitle: '',
    byline: '',
    date: today,
    format,
    ...(vertical ? { vertical } : {}),
    status: 'published',
    listed: false,
    // The renderer hard-reads `frontmatter.theme.{colors,fonts}` on every path
    // (themeToMapPalette, getFontImportUrl, ThemeProvider), so a draft without a
    // theme crashes the canvas. Seed the same neutral base `buildFrontmatter`
    // injects; the compose passes can fold accent overrides over it later.
    theme: DEFAULT_THEME,
  }
  const markdown = `---\n${yamlStringify(frontmatter)}---\n\n## Draft\n\nStart composing from your sources.\n`

  const section =
    format === 'map'
      ? { text: 'Draft', map: { center: [0, 0], zoom: 1 } }
      : { text: 'Draft', foreground: [] as unknown[] }
  const configObj = { defaults: defaultsFor(format), sections: [section] }
  const configYaml =
    configFormat === 'json'
      ? JSON.stringify(configObj, null, 2) + '\n'
      : yamlStringify(configObj)

  return { markdown, configYaml, configFormat }
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
  // Default kept for backward compat — vizmaya's entry posts no appSlug.
  const appSlug =
    typeof body.appSlug === 'string' && body.appSlug.trim() ? body.appSlug.trim() : 'vizmaya-fyi'
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

  const { markdown, configYaml, configFormat } = seedStory(title, format, appSlug)
  try {
    await src.writeMarkdown(slug, markdown) // creates the row (db upsert)
    await src.writeConfig(slug, configYaml, configFormat)
    await src.updateMetadata(slug, { appSlug })
    await writeComposeState(slug, { phase: 'sources', format, angles: [], outline: [] })
  } catch (e) {
    return NextResponse.json(
      { error: `failed to create draft: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }

  // vizmaya-fyi keeps its own static /vizmaya tree (the dynamic [appSlug]
  // layout redirects `vizmaya-fyi` there, dropping the rest of the path — so
  // we must not send it through `/${appSlug}/...`). Every other app's canvas
  // mounts at the universal `/[appSlug]/[slug]/canvas` route.
  const canvasPath =
    appSlug === 'vizmaya-fyi' ? `/vizmaya/${slug}/canvas` : `/${appSlug}/${slug}/canvas`

  return NextResponse.json({ ok: true, slug, canvasPath })
}

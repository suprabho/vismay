import { NextResponse } from 'next/server'
import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@vismay/content-source/contentSource'
import { appendStorySection } from '@vismay/content-source/storySection'
import { readComposeState, writeComposeState } from '@vismay/content-source/composeState'

/**
 * Compose stage 3.5 — materialise the accepted outline entries into real story
 * sections, then advance to the CONTENT phase.
 *
 * Rebuilds the story from a clean base (the existing frontmatter + config
 * `defaults`, with the seed placeholder section dropped) and appends one section
 * per accepted entry via `appendStorySection`. Each section gets a placeholder
 * visual (empty `foreground` for deck, a default `map` camera for map) so it
 * clears `loadStoryConfig`; the CONTENT/VISUAL passes fill them in. The
 * generated section id is recorded back onto the outline entry.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params

  const state = await readComposeState(slug)
  if (!state) return NextResponse.json({ error: 'no compose draft for this slug' }, { status: 404 })

  const accepted = state.outline.filter((e) => e.status === 'accepted')
  if (accepted.length === 0) {
    return NextResponse.json({ error: 'accept at least one outline section first' }, { status: 400 })
  }

  const src = getContentSource()
  const [markdown, configYaml] = await Promise.all([
    src.readMarkdown(slug),
    src.readConfigYaml(slug),
  ])
  if (markdown == null || configYaml == null) {
    return NextResponse.json({ error: 'draft story files are missing' }, { status: 404 })
  }

  // Clean base: keep the frontmatter block + config `defaults`, drop all
  // existing sections (the seed placeholder). The final write is atomic, so the
  // canvas never observes the transient section-less state.
  const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?/)
  let md = fmMatch ? `---\n${fmMatch[1]}\n---\n` : ''
  const cfgObj = (parseYaml(configYaml) ?? {}) as { defaults?: unknown }
  let cfg = yamlStringify({ defaults: cfgObj.defaults ?? {} })

  const placeholderBody =
    state.format === 'map'
      ? { map: { center: [0, 0], zoom: 1 } }
      : { foreground: [] as unknown[] }

  const nextOutline = state.outline.map((e) => ({ ...e }))
  for (const entry of accepted) {
    const r = appendStorySection(md, cfg, {
      heading: entry.heading,
      paragraphs: [entry.intent || ''],
      kind: entry.kind,
      body: placeholderBody,
    })
    md = r.markdown
    cfg = r.configYaml
    const idx = nextOutline.findIndex((e) => e.id === entry.id)
    if (idx >= 0) nextOutline[idx]!.sectionId = r.id
  }

  try {
    await src.writeMarkdown(slug, md)
    await src.writeConfigYaml(slug, cfg)
  } catch (e) {
    return NextResponse.json(
      { error: `failed to write sections: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }

  await writeComposeState(slug, { ...state, outline: nextOutline, phase: 'content' })

  return NextResponse.json({
    ok: true,
    sections: nextOutline
      .filter((e) => e.sectionId)
      .map((e) => ({ id: e.id, sectionId: e.sectionId, heading: e.heading })),
  })
}

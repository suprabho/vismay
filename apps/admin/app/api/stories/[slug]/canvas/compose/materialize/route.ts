import { NextResponse } from 'next/server'
import { parse as parseYaml, stringify as yamlStringify } from 'yaml'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@vismay/content-source/contentSource'
import { appendStorySection } from '@vismay/content-source/storySection'
import { readComposeState, writeComposeState } from '@vismay/content-source/composeState'
import { COVER_ANCHOR, completeCoverBody, isDeckCover } from '@vismay/story-pipeline/cover'

/**
 * Compose stage 3.5 — materialise the accepted outline entries into real story
 * sections, then advance to the CONTENT phase.
 *
 * Incremental: only accepted entries WITHOUT a sectionId are created, so the
 * step can run again for stragglers accepted after the first pass. The first
 * run on a seeded draft rebuilds from a clean base (the existing frontmatter +
 * config `defaults`, with the seed placeholder section dropped); every later
 * run — and the attached flow — appends onto the story as-is, so already
 * written sections are never touched. Each new section gets a placeholder
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
  if (state.archived) {
    return NextResponse.json({ error: 'draft is finished — reopen it before materialising' }, { status: 400 })
  }

  // Only accepted entries that haven't been materialised yet — re-runs append
  // the newly accepted stragglers without duplicating earlier sections.
  const accepted = state.outline.filter((e) => e.status === 'accepted' && !e.sectionId)
  if (accepted.length === 0) {
    return NextResponse.json({ error: 'accept at least one new outline section first' }, { status: 400 })
  }

  const src = getContentSource()
  const [markdown, cfgRead] = await Promise.all([
    src.readMarkdown(slug),
    src.readConfig(slug),
  ])
  if (markdown == null || cfgRead == null) {
    return NextResponse.json({ error: 'draft story files are missing' }, { status: 404 })
  }
  const configYaml = cfgRead.text
  const configFormat = cfgRead.format

  // Choose the base to append onto:
  //  • attached (compose started on an existing story) → keep the story whole,
  //    so the new sections land AFTER the author's real content.
  //  • a re-run (some entry already materialised) → keep the story whole, so
  //    earlier materialised sections and their written content survive.
  //  • first run on a seeded draft → keep only the frontmatter + config
  //    `defaults` and drop the throwaway placeholder section.
  // Either way the final write is atomic, so the canvas never observes a
  // transient section-less state.
  const alreadyMaterialised = state.outline.some((e) => e.sectionId)
  let md: string
  let cfg: string
  if (state.attached || alreadyMaterialised) {
    md = markdown
    cfg = configYaml
  } else {
    const fmMatch = markdown.match(/^---\n([\s\S]*?)\n---\n?/)
    md = fmMatch ? `---\n${fmMatch[1]}\n---\n` : ''
    // parseYaml reads the existing defaults for either format (JSON ⊂ YAML);
    // the base is then re-serialised in the story's own config format.
    const cfgObj = (parseYaml(configYaml) ?? {}) as { defaults?: unknown }
    const defaults = cfgObj.defaults ?? {}
    cfg =
      configFormat === 'json'
        ? JSON.stringify({ defaults }, null, 2) + '\n'
        : yamlStringify({ defaults })
  }

  // Map placeholders anchor to the outline's planned geo when present, so a
  // freshly materialised section already frames its geography instead of the
  // null island world view.
  const placeholderBody = (entry: (typeof accepted)[number]) =>
    state.format === 'map'
      ? { map: { center: entry.geo?.center ?? [0, 0], zoom: entry.geo?.zoom ?? 1 } }
      : { foreground: [] as unknown[] }

  const nextOutline = state.outline.map((e) => ({ ...e }))
  // The first deck `cover` entry gets the editorial-cover shape: it anchors at
  // `## Cover` (id `cover`) with the display title in the config `heading`, a
  // transparent panel, and the section-root hero-full-bleed layout. Only the
  // first — a second `Cover` anchor would collide in the markdown namespace.
  let coverDone =
    nextOutline.some((e) => e.sectionId && isDeckCover(state.format, e.kind)) ||
    // Attached flows append onto an existing story, which may already anchor
    // its own `## Cover` — a second one would collide in the markdown namespace.
    new RegExp(`^##\\s+${COVER_ANCHOR}\\s*$`, 'm').test(md)
  for (const entry of accepted) {
    const asCover = !coverDone && isDeckCover(state.format, entry.kind)
    if (asCover) coverDone = true
    const r = appendStorySection(md, cfg, {
      heading: asCover ? COVER_ANCHOR : entry.heading,
      paragraphs: [entry.intent || ''],
      kind: entry.kind,
      body: asCover
        ? completeCoverBody(placeholderBody(entry), { heading: entry.heading })
        : placeholderBody(entry),
      // MAP sub-beats: each gets its own anchor + a placeholder camera dive
      // from its planned geo; the CONTENT/VISUAL passes fill prose and pins.
      subsections: entry.subsections?.map((s) => ({
        heading: s.heading,
        paragraphs: [s.intent || ''],
        map: {
          ...(s.geo?.center ? { center: s.geo.center } : {}),
          ...(s.geo?.zoom != null ? { zoom: s.geo.zoom } : {}),
        },
      })),
    }, configFormat)
    md = r.markdown
    cfg = r.configYaml
    const idx = nextOutline.findIndex((e) => e.id === entry.id)
    if (idx >= 0) nextOutline[idx]!.sectionId = r.id
  }

  try {
    await src.writeMarkdown(slug, md)
    await src.writeConfig(slug, cfg, configFormat)
  } catch (e) {
    return NextResponse.json(
      { error: `failed to write sections: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 },
    )
  }

  // Chart DATA is generated by the dedicated source-grounded pass (the compose
  // "Generate charts" step → /canvas/compose/charts, or per-chart from the
  // canvas chart node) — the outline only declares chart REQUIREMENTS now, so
  // there's nothing to expand here.

  // Advance outline → content; a re-run from a later phase keeps its phase.
  await writeComposeState(slug, {
    ...state,
    outline: nextOutline,
    phase: state.phase === 'outline' ? 'content' : state.phase,
  })

  return NextResponse.json({
    ok: true,
    sections: nextOutline
      .filter((e) => e.sectionId)
      .map((e) => ({ id: e.id, sectionId: e.sectionId, heading: e.heading })),
  })
}

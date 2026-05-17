import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { parse as parseYaml } from 'yaml'
import matter from 'gray-matter'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@/lib/contentSource'
import { loadStoryConfig } from '@/lib/storyConfig'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

interface UpdateBody {
  markdown?: string
  config_yaml?: string | null
  share_yaml?: string | null
  status?: string
  listed?: boolean
  displayOrder?: number | null
}

/** Validate payloads before writing so the save action doesn't corrupt a
 *  story with malformed YAML/frontmatter. */
function validateMarkdown(raw: string): string | null {
  try {
    const { data } = matter(raw)
    if (typeof data !== 'object' || data === null) return 'frontmatter missing'
    if (!data.title || typeof data.title !== 'string') return "frontmatter 'title' required"
    return null
  } catch (e) {
    return `markdown parse: ${e instanceof Error ? e.message : 'unknown'}`
  }
}

function validateYaml(raw: string): string | null {
  try {
    const v = parseYaml(raw)
    if (v == null) return 'empty YAML'
    return null
  } catch (e) {
    return `YAML parse: ${e instanceof Error ? e.message : 'unknown'}`
  }
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  const src = getContentSource()
  const [markdown, config_yaml, share_yaml, charts] = await Promise.all([
    src.readMarkdown(slug),
    src.readConfigYaml(slug),
    src.readShareYaml(slug),
    src.listChartIds(slug),
  ])
  if (markdown == null) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ slug, markdown, config_yaml, share_yaml, charts })
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  const body = (await req.json().catch(() => null)) as UpdateBody | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  if (typeof body.markdown === 'string') {
    const err = validateMarkdown(body.markdown)
    if (err) return NextResponse.json({ error: `markdown: ${err}` }, { status: 400 })
  }
  if (typeof body.config_yaml === 'string') {
    const err = validateYaml(body.config_yaml)
    if (err) return NextResponse.json({ error: `config_yaml: ${err}` }, { status: 400 })
  }
  if (typeof body.share_yaml === 'string') {
    const err = validateYaml(body.share_yaml)
    if (err) return NextResponse.json({ error: `share_yaml: ${err}` }, { status: 400 })
  }

  const src = getContentSource()
  try {
    if (typeof body.markdown === 'string') await src.writeMarkdown(slug, body.markdown)
    if (body.config_yaml !== undefined) await src.writeConfigYaml(slug, body.config_yaml)
    if (body.share_yaml !== undefined) await src.writeShareYaml(slug, body.share_yaml)
    if (body.status !== undefined || body.listed !== undefined || body.displayOrder !== undefined) {
      await src.updateMetadata(slug, {
        status: body.status as any,
        listed: body.listed,
        displayOrder: body.displayOrder,
      })
    }

    // Structural validation on the config AFTER writing so errors from
    // loadStoryConfig (required sections, map.center, etc.) bubble up as 400s.
    // We write first because validation is non-trivial to replay against a
    // candidate string without touching disk, and admins want to see the real
    // error from the same validator the renderer uses.
    if (body.config_yaml) {
      try {
        await loadStoryConfig(slug)
      } catch (e) {
        // Still revalidate so authors see the broken state in preview, not a stale cache.
        revalidatePaths(slug)
        return NextResponse.json(
          { error: `config validation: ${e instanceof Error ? e.message : 'unknown'}`, warning: 'written but invalid — fix before publishing' },
          { status: 200 }
        )
      }
    }
    revalidatePaths(slug)
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'write failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true })
}

function revalidatePaths(slug: string) {
  // Flush every route that renders this story so edits go live without a rebuild.
  revalidatePath(`/story/${slug}`)
  revalidatePath(`/story/${slug}/share`)
  revalidatePath(`/story/${slug}/autoplay`)
  revalidatePath('/')
}

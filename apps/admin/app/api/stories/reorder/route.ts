import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { getContentSource } from '@vismay/content-source/contentSource'

const SAFE_SLUG = /^[a-zA-Z0-9_-]+$/

interface ReorderBody {
  slug?: string
  /** Target 0-indexed position; null removes the story from the ordering. */
  position?: number | null
  /** Scope the renumbering to one app's stories. Omit for every story. */
  app?: string | null
}

/**
 * Move one story to `position` and renumber the rest of the ordered stories
 * so display_order stays a contiguous 0..n-1 sequence without duplicates.
 * Stories without an order stay unordered. Only rows whose order actually
 * changes are written. Returns the full `{ slug: displayOrder }` map for the
 * scope so the client can sync every row at once.
 */
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as ReorderBody | null
  const slug = body?.slug
  if (!slug || !SAFE_SLUG.test(slug)) {
    return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  }
  const position = body?.position
  if (position !== null && (typeof position !== 'number' || !Number.isFinite(position))) {
    return NextResponse.json({ error: 'bad position' }, { status: 400 })
  }
  const app = body?.app ?? null
  if (app !== null && !SAFE_SLUG.test(app)) {
    return NextResponse.json({ error: 'bad app' }, { status: 400 })
  }

  const src = getContentSource()
  const all = await src.listStories()
  const scoped = app ? all.filter((s) => s.appSlug === app) : all
  if (!scoped.some((s) => s.slug === slug)) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  // Current sequence of ordered stories (excluding the one being moved).
  const sequence = scoped
    .filter((s) => s.slug !== slug && s.displayOrder != null)
    .sort((a, b) => a.displayOrder! - b.displayOrder! || a.slug.localeCompare(b.slug))
    .map((s) => s.slug)
  if (position !== null) {
    const idx = Math.max(0, Math.min(Math.trunc(position), sequence.length))
    sequence.splice(idx, 0, slug)
  }

  const next = new Map<string, number | null>(scoped.map((s) => [s.slug, null]))
  sequence.forEach((s, i) => next.set(s, i))

  const changed = scoped.filter((s) => next.get(s.slug) !== s.displayOrder)
  try {
    await Promise.all(
      changed.map((s) => src.updateMetadata(s.slug, { displayOrder: next.get(s.slug)! }))
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'reorder failed' },
      { status: 500 }
    )
  }

  if (changed.length > 0) revalidatePath('/')
  return NextResponse.json({ ok: true, orders: Object.fromEntries(next) })
}

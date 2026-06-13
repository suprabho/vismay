import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { getAuthorForAdmin, upsertAuthor, deleteAuthor } from '@vismay/content-source/authors'
import { parseAuthorBody } from '../route'

const SAFE_SLUG = /^[a-z0-9-]+$/

export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  const author = await getAuthorForAdmin(slug)
  if (!author) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ author })
}

export async function PUT(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  const raw = (await req.json().catch(() => null)) as Record<string, unknown> | null
  // The slug is path-derived; the body need not repeat it.
  const parsed = parseAuthorBody({ ...(raw ?? {}), slug })
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    await upsertAuthor(parsed.input)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'write failed' }, { status: 500 })
  }
  revalidatePath(`/authors/${slug}`)
  revalidatePath('/sitemap.xml')
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })
  try {
    await deleteAuthor(slug)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'delete failed' }, { status: 500 })
  }
  revalidatePath('/sitemap.xml')
  return NextResponse.json({ ok: true })
}

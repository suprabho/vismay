import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { listAuthorsForAdmin, upsertAuthor, type AuthorInput } from '@vismay/content-source/authors'

const SAFE_SLUG = /^[a-z0-9-]+$/

export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const authors = await listAuthorsForAdmin('vizmaya-fyi')
  return NextResponse.json({ authors })
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const parsed = parseAuthorBody(await req.json().catch(() => null))
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })

  try {
    await upsertAuthor(parsed.input)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'write failed' }, { status: 500 })
  }
  revalidatePath(`/authors/${parsed.input.slug}`)
  revalidatePath('/sitemap.xml')
  return NextResponse.json({ ok: true, slug: parsed.input.slug })
}

export function parseAuthorBody(body: unknown): { input: AuthorInput } | { error: string } {
  if (!body || typeof body !== 'object') return { error: 'expected a JSON object' }
  const b = body as Record<string, unknown>
  if (typeof b.slug !== 'string' || !SAFE_SLUG.test(b.slug)) {
    return { error: 'slug must be lowercase letters, digits, and hyphens' }
  }
  if (typeof b.name !== 'string' || b.name.trim() === '') return { error: 'name is required' }

  let sameAs: string[] = []
  if (b.sameAs != null) {
    if (!Array.isArray(b.sameAs) || b.sameAs.some((s) => typeof s !== 'string')) {
      return { error: 'sameAs must be an array of strings' }
    }
    sameAs = (b.sameAs as string[]).map((s) => s.trim()).filter(Boolean)
  }

  const str = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  const status = b.status === 'draft' || b.status === 'archived' ? b.status : 'published'

  return {
    input: {
      slug: b.slug,
      name: b.name.trim(),
      role: str(b.role),
      bio: str(b.bio),
      avatarUrl: str(b.avatarUrl),
      profileUrl: str(b.profileUrl),
      sameAs,
      appSlug: 'vizmaya-fyi',
      status,
    },
  }
}

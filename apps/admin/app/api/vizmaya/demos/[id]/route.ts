import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { isAuthed } from '@/lib/adminAuth'
import { hashPassword } from '@/lib/demoAuth'
import {
  deleteDemo,
  getDemoById,
  isValidClientSlug,
  updateDemo,
  type DemoCardId,
  type DemoStatus,
  type UpdateDemoInput,
} from '@/lib/demos'
import { validateDemoContentYaml } from '@/lib/storyDemoConfig'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SAFE_STORY_SLUG = /^[a-zA-Z0-9_-]+$/
const VALID_STATUSES: DemoStatus[] = ['draft', 'live', 'archived']

interface UpdateBody {
  client_slug?: string
  client_name?: string
  story_slug?: string
  password?: string
  content_yaml?: string | null
  share_card_ids?: DemoCardId[] | null
  status?: DemoStatus
}

function parseId(idParam: string): number | null {
  const n = Number(idParam)
  return Number.isInteger(n) && n > 0 ? n : null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id: idParam } = await params
  const id = parseId(idParam)
  if (id == null) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  try {
    const demo = await getDemoById(id)
    if (!demo) return NextResponse.json({ error: 'not found' }, { status: 404 })
    // Don't leak the password hash to the editor — sales doesn't need it.
    const { password_hash: _ph, ...safe } = demo
    return NextResponse.json({ demo: safe })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'get failed' },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id: idParam } = await params
  const id = parseId(idParam)
  if (id == null) return NextResponse.json({ error: 'bad id' }, { status: 400 })

  const body = (await req.json().catch(() => null)) as UpdateBody | null
  if (!body) return NextResponse.json({ error: 'invalid body' }, { status: 400 })

  const patch: UpdateDemoInput = {}

  if (body.client_slug !== undefined) {
    if (!isValidClientSlug(body.client_slug)) {
      return NextResponse.json({ error: 'bad client_slug' }, { status: 400 })
    }
    patch.client_slug = body.client_slug
  }
  if (body.client_name !== undefined) {
    if (typeof body.client_name !== 'string' || body.client_name.length === 0) {
      return NextResponse.json({ error: 'bad client_name' }, { status: 400 })
    }
    patch.client_name = body.client_name
  }
  if (body.story_slug !== undefined) {
    if (typeof body.story_slug !== 'string' || !SAFE_STORY_SLUG.test(body.story_slug)) {
      return NextResponse.json({ error: 'bad story_slug' }, { status: 400 })
    }
    patch.story_slug = body.story_slug
  }
  if (body.password !== undefined) {
    if (typeof body.password !== 'string' || body.password.length < 6) {
      return NextResponse.json({ error: 'password must be at least 6 chars' }, { status: 400 })
    }
    patch.password_hash = hashPassword(body.password)
  }
  if (body.content_yaml !== undefined) {
    if (body.content_yaml !== null && typeof body.content_yaml !== 'string') {
      return NextResponse.json({ error: 'content_yaml must be string or null' }, { status: 400 })
    }
    if (typeof body.content_yaml === 'string') {
      const err = validateDemoContentYaml(body.content_yaml)
      if (err) return NextResponse.json({ error: `content_yaml: ${err}` }, { status: 400 })
    }
    patch.content_yaml = body.content_yaml
  }
  if (body.share_card_ids !== undefined) {
    if (body.share_card_ids !== null && !Array.isArray(body.share_card_ids)) {
      return NextResponse.json({ error: 'share_card_ids must be array or null' }, { status: 400 })
    }
    patch.share_card_ids = body.share_card_ids
  }
  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: 'bad status' }, { status: 400 })
    }
    patch.status = body.status
  }

  try {
    const demo = await updateDemo(id, patch)
    // Flush the public route so saved edits show up next request.
    revalidatePath(`/demo/${demo.client_slug}`)
    const { password_hash: _ph, ...safe } = demo
    return NextResponse.json({ demo: safe })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'update failed'
    const status = message.includes('duplicate') || message.includes('unique') ? 409 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id: idParam } = await params
  const id = parseId(idParam)
  if (id == null) return NextResponse.json({ error: 'bad id' }, { status: 400 })
  try {
    const demo = await getDemoById(id)
    await deleteDemo(id)
    if (demo) revalidatePath(`/demo/${demo.client_slug}`)
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'delete failed' },
      { status: 500 }
    )
  }
}

import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  createPost,
  listPostsInRange,
  validateAssetRef,
  type AssetRef,
  type Channel,
  type NewSocialPostPlan,
  type PostStatus,
} from '@vismay/content-source/socialPostPlans'

export async function GET(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const sp = request.nextUrl.searchParams
  const from = sp.get('from')
  const to = sp.get('to')
  if (!from || !to) {
    return NextResponse.json({ error: 'from and to (YYYY-MM-DD) are required' }, { status: 400 })
  }
  const posts = await listPostsInRange(from, to)
  return NextResponse.json(posts)
}

export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json()) as Partial<NewSocialPostPlan>

  if (!body.scheduledDate || !body.channel || !body.storySlug || !body.assetRef) {
    return NextResponse.json(
      { error: 'scheduledDate, channel, storySlug, assetRef required' },
      { status: 400 },
    )
  }
  const channel = body.channel as Channel
  const assetRef = body.assetRef as AssetRef
  const validationError = validateAssetRef(channel, assetRef)
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 })

  const created = await createPost({
    scheduledDate: body.scheduledDate,
    scheduledTime: body.scheduledTime ?? null,
    channel,
    storySlug: body.storySlug,
    assetRef,
    postText: body.postText ?? '',
    status: (body.status as PostStatus) ?? 'scheduled',
    notes: body.notes ?? null,
  })
  return NextResponse.json(created, { status: 201 })
}

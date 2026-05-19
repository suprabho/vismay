import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  deletePost,
  getPost,
  updatePost,
  validateAssetRef,
  type AssetRef,
  type Channel,
  type UpdateSocialPostPlan,
} from '@vismay/content-source/socialPostPlans'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  const body = (await request.json()) as UpdateSocialPostPlan

  if (body.assetRef !== undefined) {
    const existing = await getPost(id)
    if (!existing) return NextResponse.json({ error: 'not found' }, { status: 404 })
    const channel = (body.channel ?? existing.channel) as Channel
    const err = validateAssetRef(channel, body.assetRef as AssetRef)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const updated = await updatePost(id, body)
  return NextResponse.json(updated)
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { id } = await params
  await deletePost(id)
  return NextResponse.json({ ok: true })
}

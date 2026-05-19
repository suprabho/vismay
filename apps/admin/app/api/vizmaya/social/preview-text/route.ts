import { NextResponse, type NextRequest } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { derivePostText } from '@/lib/socialPostText'
import { validateAssetRef, type AssetRef, type Channel } from '@/lib/socialPostPlans'

export async function POST(request: NextRequest) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = (await request.json()) as { channel?: Channel; assetRef?: AssetRef }
  if (!body.channel || !body.assetRef) {
    return NextResponse.json({ error: 'channel and assetRef required' }, { status: 400 })
  }
  const err = validateAssetRef(body.channel, body.assetRef)
  if (err) return NextResponse.json({ error: err }, { status: 400 })
  try {
    const text = await derivePostText(body.channel, body.assetRef)
    return NextResponse.json({ text })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

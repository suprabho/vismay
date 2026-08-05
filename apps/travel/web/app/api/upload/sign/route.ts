import { NextResponse } from 'next/server'
import { createServiceClient } from '@vismay/content-source/supabase'
import { buildAssetRef, resolveAssetUrl } from '@vismay/viz-engine'
import { uploadAuth } from '@/lib/uploadAuth'
import {
  ASSETS_BUCKET,
  SAFE_FILENAME,
  SAFE_SLUG,
  guessContentType,
  sanitizeFilename,
} from '@/lib/assetFiles'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Issues a short-lived signed upload URL so the browser can PUT the file
// straight into Supabase Storage. Files never pass through this server —
// Vercel rejects request bodies over ~4.5 MB (413), which makes proxied
// video uploads impossible. (Clone of the admin app's sign-upload route,
// gated by the travel admin cookie, slug in the body instead of the path.)
export async function POST(req: Request) {
  if (!(await uploadAuth.isAuthed())) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  let body: { slug?: unknown; filename?: unknown; contentType?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'expected JSON body' }, { status: 400 })
  }

  const slug = typeof body.slug === 'string' ? body.slug : ''
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  const rawName = typeof body.filename === 'string' ? body.filename.trim() : ''
  const filename = sanitizeFilename(rawName)
  if (!filename || !SAFE_FILENAME.test(filename)) {
    return NextResponse.json(
      { error: `bad filename "${rawName}" — must match [a-zA-Z0-9._-]` },
      { status: 400 }
    )
  }

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'supabase init failed' },
      { status: 500 }
    )
  }

  const key = `${slug}/${filename}`
  const { data, error } = await supabase.storage
    .from(ASSETS_BUCKET)
    .createSignedUploadUrl(key, { upsert: true })
  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? 'failed to sign upload' },
      { status: 500 }
    )
  }

  const contentType =
    typeof body.contentType === 'string' && body.contentType.length > 0
      ? body.contentType
      : guessContentType(filename)

  const assetRef = buildAssetRef(slug, filename)
  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    key,
    filename,
    contentType,
    assetRef,
    url: resolveAssetUrl(assetRef),
  })
}

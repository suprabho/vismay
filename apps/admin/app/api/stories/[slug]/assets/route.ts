import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { createServiceClient } from '@vismay/content-source/supabase'
import { buildAssetRef, resolveAssetUrl } from '@vismay/viz-engine'
import {
  ASSETS_BUCKET as BUCKET,
  SAFE_FILENAME,
  SAFE_SLUG,
  guessContentType,
  sanitizeFilename,
} from '@/lib/assetFiles'

export interface AssetListEntry {
  key: string
  filename: string
  assetRef: string
  url: string
  size: number | null
  contentType: string | null
  updatedAt: string | null
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  let supabase
  try {
    supabase = createServiceClient()
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'supabase init failed' },
      { status: 500 }
    )
  }

  const { data, error } = await supabase.storage.from(BUCKET).list(slug, {
    limit: 1000,
    sortBy: { column: 'name', order: 'asc' },
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const assets: AssetListEntry[] = (data ?? [])
    // The list API returns directory placeholders too (size 0, name '.emptyFolderPlaceholder');
    // filter those out so the grid only shows real files.
    .filter((row) => row.name && row.name !== '.emptyFolderPlaceholder' && (row.metadata?.size ?? 0) > 0)
    .map((row) => {
      const key = `${slug}/${row.name}`
      const ref = buildAssetRef(slug, row.name)
      return {
        key,
        filename: row.name,
        assetRef: ref,
        url: resolveAssetUrl(ref),
        size: (row.metadata?.size as number | undefined) ?? null,
        contentType: (row.metadata?.mimetype as string | undefined) ?? null,
        updatedAt: row.updated_at ?? row.created_at ?? null,
      }
    })

  return NextResponse.json({ slug, assets })
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const { slug } = await params
  if (!SAFE_SLUG.test(slug)) return NextResponse.json({ error: 'bad slug' }, { status: 400 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })
  }

  const file = form.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing 'file' field" }, { status: 400 })
  }

  // Optional `filename` form field overrides `file.name` — lets the admin UI
  // rename on upload without doing a second round-trip.
  const overrideName = form.get('filename')
  const rawName =
    typeof overrideName === 'string' && overrideName.trim().length > 0
      ? overrideName.trim()
      : file.name
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
  // `.riv` arrives as `application/octet-stream` from most browsers; the
  // bucket allowlist accepts it but we explicitly set contentType so the
  // public URL serves with a deterministic Content-Type header.
  const contentType = file.type || guessContentType(filename)
  const { error } = await supabase.storage.from(BUCKET).upload(key, file, {
    contentType,
    upsert: true,
  })
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const assetRef = buildAssetRef(slug, filename)
  return NextResponse.json({
    ok: true,
    key,
    filename,
    assetRef,
    url: resolveAssetUrl(assetRef),
    size: file.size,
    contentType,
  })
}

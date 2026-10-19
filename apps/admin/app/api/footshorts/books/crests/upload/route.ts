import { NextResponse } from 'next/server'
import { CREST_UPLOAD_MAX_BYTES } from '@footshorts/shared/historicalCrests'
import { isAuthed } from '@/lib/adminAuth'
import { adminEmail } from '@/lib/adminIdentity'
import { isCrestSeason, sniffCrestType, unsafeSvg } from '@/lib/seasonBooks/crests'
import { CrestStoreError, removeCrestUpload, uploadCrest } from '@/lib/seasonBooks/crestStore'

/**
 * POST multipart { season, wiki, file } → { crest }: a club's crest for the season,
 * filling a gap or replacing a wrong pick. DELETE { season, wiki } → { crest }: back
 * to the picked crest. Admin-auth gated, same-origin only.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }

function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: PRIVATE_HEADERS })
}

function storeFail(error: unknown) {
  return fail(error instanceof Error ? error.message : 'Could not save the crest', error instanceof CrestStoreError ? error.status : 500)
}

const validClub = (season: unknown, wiki: unknown): season is string =>
  isCrestSeason(season) && typeof wiki === 'string' && wiki.length > 0 && wiki.length <= 300

export async function POST(req: Request) {
  if (!(await isAuthed())) return fail('unauthorized', 401)
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Invalid request origin', 403)
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return fail('Expected multipart/form-data', 400)
  }
  const season = form.get('season'), wiki = form.get('wiki'), file = form.get('file')
  if (!validClub(season, wiki)) return fail('Invalid season or club', 400)
  if (!(file instanceof File)) return fail('Missing file', 400)
  if (file.size === 0) return fail('That file is empty', 400)
  if (file.size > CREST_UPLOAD_MAX_BYTES) return fail(`Crests can be up to ${CREST_UPLOAD_MAX_BYTES / 1024 / 1024} MB`, 413)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const type = sniffCrestType(bytes)
  if (!type) return fail('Upload a PNG, SVG, WebP, JPEG or GIF image', 415)
  if (type === 'image/svg+xml' && unsafeSvg(new TextDecoder().decode(bytes))) {
    return fail('That SVG carries scripts, event handlers or external links. Export a plain SVG or a PNG.', 415)
  }
  try {
    return NextResponse.json({ crest: await uploadCrest(season, wiki as string, bytes, type, await adminEmail()) }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return storeFail(error)
  }
}

export async function DELETE(req: Request) {
  if (!(await isAuthed())) return fail('unauthorized', 401)
  if (req.headers.get('origin') !== new URL(req.url).origin) return fail('Invalid request origin', 403)
  let body: { season?: unknown; wiki?: unknown }
  try {
    body = await req.json()
  } catch {
    return fail('Expected a JSON object', 400)
  }
  if (!body || !validClub(body.season, body.wiki)) return fail('Invalid season or club', 400)
  try {
    return NextResponse.json({ crest: await removeCrestUpload(body.season as string, body.wiki as string) }, { headers: PRIVATE_HEADERS })
  } catch (error) {
    return storeFail(error)
  }
}

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { listClaimsForReview } from '@vismay/curious-pipeline/store'
import type { ClaimStatus, SourceId } from '@vismay/curious-pipeline/types'

/**
 * GET /api/vizmaya/curious/claims?status&grade&theme&source&q&limit&offset&id
 * → { claims, total, counts }. The review queue's list. Admin-auth gated,
 * private no-store.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' }
const STATUSES: ClaimStatus[] = ['candidate', 'graded', 'in_review', 'approved', 'rejected', 'sent_back']
const SOURCES: SourceId[] = ['gdelt', 'loc', 'europeana', 'gallica', 'crossref', 'google-books', 'wikidata', 'web', 'web-search']

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers: PRIVATE_HEADERS })
  const url = new URL(req.url)
  const statusRaw = url.searchParams.get('status') ?? 'in_review'
  const status = statusRaw === 'all' ? undefined : statusRaw === 'todo' ? (['in_review', 'graded'] as ClaimStatus[]) : STATUSES.includes(statusRaw as ClaimStatus) ? (statusRaw as ClaimStatus) : 'in_review'
  const grade = url.searchParams.get('grade') ?? undefined
  const theme = url.searchParams.get('theme') ?? undefined
  const sourceRaw = url.searchParams.get('source')
  const source = sourceRaw && SOURCES.includes(sourceRaw as SourceId) ? (sourceRaw as SourceId) : undefined
  const q = url.searchParams.get('q')?.trim() || undefined
  const id = url.searchParams.get('id')
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 50) || 50))
  const offset = Math.max(0, Number(url.searchParams.get('offset') ?? 0) || 0)
  try {
    const result = await listClaimsForReview({ status: id ? undefined : status, grade: /^[A-E]$/.test(grade ?? '') ? grade : undefined, theme, source, q, limit, offset, ids: id ? [id] : undefined })
    return NextResponse.json(result, { headers: PRIVATE_HEADERS })
  } catch (e) {
    return NextResponse.json({ claims: [], total: 0, counts: { byStatus: {}, byGrade: {} }, error: e instanceof Error ? e.message : 'failed' }, { status: 500, headers: PRIVATE_HEADERS })
  }
}

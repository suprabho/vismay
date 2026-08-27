import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { upsertEntityAlias } from '@vismay/content-source/footshortsData'

/**
 * Teach the resolver a raw-label -> canonical-entity mapping from the admin
 * "resolve identities" UI (Power rankings tab). Body:
 * `{ entityType: 'league'|'team'|'player', aliasLabel: string, entityId: string }`.
 * Upserts on (entity_type, alias_slug) — see `entity_aliases` migration.
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => null)
  const entityType = body?.entityType
  const aliasLabel = typeof body?.aliasLabel === 'string' ? body.aliasLabel.trim() : ''
  const entityId = typeof body?.entityId === 'string' ? body.entityId.trim() : ''
  if (entityType !== 'league' && entityType !== 'team' && entityType !== 'player') {
    return NextResponse.json({ error: 'entityType must be league, team, or player' }, { status: 400 })
  }
  if (!aliasLabel) return NextResponse.json({ error: 'aliasLabel is required' }, { status: 400 })
  if (!entityId) return NextResponse.json({ error: 'entityId is required' }, { status: 400 })
  try {
    const alias = await upsertEntityAlias({ entityType, aliasLabel, entityId })
    return NextResponse.json({ ok: true, alias })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'failed to save alias' },
      { status: 500 },
    )
  }
}

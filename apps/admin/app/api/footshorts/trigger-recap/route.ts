/**
 * POST → fire a workflow_dispatch to footshorts-recap.yml.
 *
 * Body (all optional): { hours?, competition?, team? }
 *   hours       trailing window length in hours. Blank = 24.
 *   competition slug or 'all' (default).
 *   team        slug. Blank = no team filter.
 *
 * 200 { ok: true, mode: 'dispatched' | 'unconfigured' }
 *
 * Admin-auth gated. When dispatch envs aren't set (local dev), returns
 * `mode: 'unconfigured'` so the UI can tell the operator to run
 * `pnpm recap` in the footshorts worker manually instead of silently
 * doing nothing.
 */

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import { dispatchRecapJob, isRecapDispatchConfigured } from '@vismay/content-source/recapDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SLUG_RE = /^[a-z0-9-]+$/

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    hours?: number | string
    competition?: string
    team?: string
  }

  const competition = body.competition?.trim() || undefined
  const team = body.team?.trim() || undefined

  let hours: number | undefined
  if (body.hours !== undefined && body.hours !== '') {
    const n = Number(body.hours)
    if (!Number.isFinite(n) || n <= 0) {
      return NextResponse.json({ error: 'hours must be a positive number' }, { status: 400 })
    }
    hours = n
  }
  if (competition && competition !== 'all' && !SLUG_RE.test(competition)) {
    return NextResponse.json({ error: 'bad competition slug' }, { status: 400 })
  }
  if (team && !SLUG_RE.test(team)) {
    return NextResponse.json({ error: 'bad team slug' }, { status: 400 })
  }

  if (!isRecapDispatchConfigured()) {
    return NextResponse.json({ ok: true, mode: 'unconfigured' })
  }

  try {
    await dispatchRecapJob({ hours, competition, team })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'dispatch failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, mode: 'dispatched' })
}

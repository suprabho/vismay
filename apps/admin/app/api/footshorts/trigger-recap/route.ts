/**
 * POST → fire a workflow_dispatch to footshorts-recap.yml.
 *
 * Body (all optional): { date?, competition?, team?, force? }
 *   date        YYYY-MM-DD (UTC). Blank = today.
 *   competition slug or 'all' (default).
 *   team        slug. Blank = no team filter.
 *   force       skip the end-of-day gate.
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const SLUG_RE = /^[a-z0-9-]+$/

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as {
    date?: string
    competition?: string
    team?: string
    force?: boolean
  }

  const date = body.date?.trim() || undefined
  const competition = body.competition?.trim() || undefined
  const team = body.team?.trim() || undefined
  const force = Boolean(body.force)

  if (date && !DATE_RE.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
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
    await dispatchRecapJob({ date, competition, team, force })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'dispatch failed' },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, mode: 'dispatched' })
}

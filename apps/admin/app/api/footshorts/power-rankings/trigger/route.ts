/**
 * POST → fire a workflow_dispatch to footshorts-theanalyst-power-rankings.yml.
 *
 * Body (optional): { url? } — override the article URL to scrape; blank uses
 * the worker's default Power Rankings URL.
 *
 * 200 { ok: true, mode: 'dispatched' | 'unconfigured' }
 *
 * Admin-auth gated. When dispatch envs aren't set (local dev), returns
 * `mode: 'unconfigured'` so the UI can tell the operator to run
 * `pnpm power-rankings` in the footshorts worker manually instead of
 * silently doing nothing.
 */

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  dispatchPowerRankingsJob,
  isPowerRankingsDispatchConfigured,
} from '@vismay/content-source/powerRankingsDispatch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { url?: string }
  const url = body.url?.trim() || undefined
  if (url && !/^https:\/\/theanalyst\.com\//.test(url)) {
    return NextResponse.json({ error: 'url must be a theanalyst.com article' }, { status: 400 })
  }

  if (!isPowerRankingsDispatchConfigured()) {
    return NextResponse.json({ ok: true, mode: 'unconfigured' })
  }

  try {
    await dispatchPowerRankingsJob({ url })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'dispatch failed' },
      { status: 500 },
    )
  }

  return NextResponse.json({ ok: true, mode: 'dispatched' })
}

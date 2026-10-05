import { NextResponse } from 'next/server'
import { createSpin, listSpins, SpinError } from '@vismay/randomizer/spins'
import { isRandomizerId } from '@vismay/randomizer/types'
import { isAuthed } from '@/lib/adminAuth'

/**
 * The randomizer slot machine's spin log and Spin / Re-spin
 * (components/randomizer/RandomizerClient). Session-gated; agents spin through
 * the token-gated route on vizmaya-fyi instead. Both call the same
 * createSpin(), so the rules hold whoever spins.
 *
 *   GET  ?randomizer=&limit=
 *   POST { randomizer, from?, locks?, respin?, reason?, pair?, sequence? }
 */
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function fail(e: unknown) {
  const status = e instanceof SpinError ? e.status : 500
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status })
}

export async function GET(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const url = new URL(req.url)
  const r = url.searchParams.get('randomizer')
  if (r && !isRandomizerId(r)) return NextResponse.json({ error: 'unknown randomizer' }, { status: 400 })
  try {
    const spins = await listSpins({ randomizer: r && isRandomizerId(r) ? r : undefined, limit: Number(url.searchParams.get('limit') ?? 60) || 60 })
    return NextResponse.json({ spins })
  } catch (e) {
    return fail(e)
  }
}

export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'expected a JSON object' }, { status: 400 })
  if (!isRandomizerId(b.randomizer)) return NextResponse.json({ error: 'unknown randomizer' }, { status: 400 })
  try {
    const spin = await createSpin({
      randomizer: b.randomizer,
      from: typeof b.from === 'string' && b.from ? b.from : null,
      locks: Array.isArray(b.locks) ? b.locks.filter((l): l is string => typeof l === 'string') : [],
      respin: b.respin === true,
      reason: typeof b.reason === 'string' ? b.reason : null,
      pair: b.pair === true,
      sequence: b.sequence === true,
      createdBy: 'admin',
    })
    return NextResponse.json({ spin }, { status: 201 })
  } catch (e) {
    return fail(e)
  }
}

import { NextResponse } from 'next/server'
import { isAuthed } from '@/lib/adminAuth'
import {
  listDcStockUploadTargets,
  parseStooqCsv,
  upsertDcStockPrices,
} from '@vismay/content-source/epics'

export const dynamic = 'force-dynamic'

// The international (non-US) AI Data Centers tickers plus their price coverage,
// so the pipeline UI can show which need a fresh Stooq CSV.
export async function GET() {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const targets = await listDcStockUploadTargets()
  return NextResponse.json({ targets })
}

// Upload a hand-downloaded Stooq daily-OHLCV CSV for one international ticker.
// Stooq bot-gates datacenter IPs, so CI can't fetch these — this is the manual
// path: download in a browser (residential IP), upload here, we parse + upsert.
export async function POST(req: Request) {
  if (!(await isAuthed())) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: 'expected multipart/form-data' }, { status: 400 })
  }

  const ticker = form.get('ticker')
  const file = form.get('file')
  if (typeof ticker !== 'string' || !ticker) {
    return NextResponse.json({ error: "missing 'ticker' field" }, { status: 400 })
  }
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "missing 'file' field" }, { status: 400 })
  }

  // Only the known international tickers are uploadable — US comes from
  // massive.com, and dc_stock_prices has an FK to dc_stocks anyway.
  const targets = await listDcStockUploadTargets()
  if (!targets.some((t) => t.ticker === ticker)) {
    return NextResponse.json(
      { error: `${ticker} is not an active international ticker` },
      { status: 400 },
    )
  }

  let rows
  try {
    rows = parseStooqCsv(await file.text(), ticker)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'could not parse the CSV' },
      { status: 400 },
    )
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: 'no valid rows in the CSV' }, { status: 400 })
  }

  await upsertDcStockPrices(rows)
  return NextResponse.json({
    ticker,
    rows: rows.length,
    firstDate: rows[0].trade_date,
    lastDate: rows[rows.length - 1].trade_date,
  })
}

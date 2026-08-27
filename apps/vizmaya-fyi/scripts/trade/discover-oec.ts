/**
 * OEC BotMarket discovery — read-only reconnaissance of the marketplace so
 * the import-oec.ts config (dataset slug, column names, filter params,
 * pagination semantics) can be pinned down before any writes happen.
 *
 * BotMarket (botmarket.oec.world) is Datawheel's data marketplace: a free
 * keyed JSON API over OEC trade/complexity data and more. Endpoints:
 *   GET /.well-known/marketplace.json        — service manifest
 *   GET /api/catalog                          — dataset list
 *   GET /api/datasets/{slug}                  — schema, filterable cols, cost
 *   GET /api/datasets/{slug}/members/{col}    — accepted filter values
 *
 * Run:  pnpm trade:discover-oec                 (full catalog sweep)
 *       pnpm trade:discover-oec -- --slug=<s>   (one dataset in depth)
 *       pnpm trade:discover-oec -- --slug=<s> --members=<col>
 *
 * Required env: OEC_BOTMARKET_API_KEY — claim a free key with
 *   curl -X POST https://botmarket.oec.world/api/promo/claim \
 *     -H 'content-type: application/json' -d '{"buyer_email":"<you>"}'
 *
 * Paste the relevant output into vizmaya-data/global-trade/INGEST_NOTES.md —
 * that file is the provenance record import-oec.ts's column mapping cites.
 *
 * Heads-up: oec.world fronts Cloudflare. If this 403s from your network, run
 * it via the "Import trade data" workflow_dispatch (discovery input) instead
 * — same contingency as documented in import-owid.ts for iea.org.
 */

import { config as loadEnv } from 'dotenv'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const BASE_URL = 'https://botmarket.oec.world'

function getFlag(name: string): string | undefined {
  const prefix = `--${name}=`
  return process.argv.find((a) => a.startsWith(prefix))?.slice(prefix.length)
}

async function fetchJson(path: string): Promise<unknown> {
  const key = process.env.OEC_BOTMARKET_API_KEY
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: {
      accept: 'application/json',
      'user-agent': 'vizmaya-trade-importer/1.0 (+https://vizmaya.fyi)',
      ...(key ? { authorization: `Bearer ${key}` } : {}),
    },
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GET ${path}: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ''}`)
  }
  return res.json()
}

function printSection(title: string, payload: unknown): void {
  console.log(`\n===== ${title} =====`)
  console.log(JSON.stringify(payload, null, 2))
}

async function main(): Promise<void> {
  if (!process.env.OEC_BOTMARKET_API_KEY) {
    console.warn(
      '[discover-oec] OEC_BOTMARKET_API_KEY not set — trying unauthenticated (catalog may still work; /query will not)',
    )
  }

  const slug = getFlag('slug')
  const membersCol = getFlag('members')

  if (slug && membersCol) {
    printSection(
      `members: ${slug} / ${membersCol}`,
      await fetchJson(`/api/datasets/${slug}/members/${membersCol}`),
    )
    return
  }

  if (slug) {
    printSection(`dataset: ${slug}`, await fetchJson(`/api/datasets/${slug}`))
    return
  }

  // Full sweep: manifest + catalog. The manifest 404ing is not fatal — the
  // catalog is the part the importer needs.
  try {
    printSection('marketplace manifest', await fetchJson('/.well-known/marketplace.json'))
  } catch (err) {
    console.warn(`[discover-oec] manifest fetch failed (non-fatal): ${err}`)
  }

  const catalog = await fetchJson('/api/catalog')
  printSection('catalog', catalog)

  console.log(
    '\n[discover-oec] next: pick the international-trade dataset slug and run' +
      '\n  pnpm trade:discover-oec -- --slug=<slug>' +
      '\n  pnpm trade:discover-oec -- --slug=<slug> --members=<filter-col>' +
      '\nthen record the schema in vizmaya-data/global-trade/INGEST_NOTES.md and' +
      '\nset OEC_TRADE_DATASET_SLUG (+ column overrides if needed) for import-oec.ts',
  )
}

main().catch((err) => {
  console.error('[discover-oec] failed:', err)
  process.exit(1)
})

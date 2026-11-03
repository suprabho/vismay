/**
 * Correction for PUBLISHED editions' frozen geography.
 *
 * A published dc_editions row is immutable (trigger dc_editions_guard), and its
 * `geo` (places, countries, regions) + `counts.places` are computed at compose
 * time. After the geography tags on dc_news are corrected (scrape-news
 * --retag-geo-days), those frozen numbers still count the old tags, and
 * editions composed before migration 100 carry no `countries` at all. This
 * script re-derives `geo` and `counts.places` with the same `buildGeo` the
 * composer uses, from each edition's frozen story_ids and the CURRENT tags,
 * and PRINTS the SQL — it never writes. Review the diff, then run the SQL in
 * the Supabase SQL editor. The prose (`sub` says "across N places") is left
 * alone.
 *
 * Usage:  pnpm ai-data-centers:fix-edition-geo -- 2026-11-03
 *         pnpm ai-data-centers:fix-edition-geo -- --all        (every published edition)
 *         pnpm ai-data-centers:fix-edition-geo -- --all --sql out.sql   (write the SQL to a file)
 * Env:    NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { writeFileSync } from 'node:fs'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import { listDcCountries, listDcNewsByIds, listDcPlaces } from '@vismay/dc-editions/dcEditions'
import { buildGeo } from '@vismay/dc-editions/dcEditionAssembly'
import { emptyGeo, type DcCountry, type DcPlace, type EditionGeo } from '@vismay/dc-editions/dcEditionTypes'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const sqlString = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`

interface EditionRow {
  edition_date: string
  status: string
  story_ids: unknown[]
  geo: Partial<EditionGeo> | null
  counts: Record<string, unknown> | null
}

const summarise = (g: EditionGeo) =>
  `${g.places.map((p) => `${p.slug}×${p.count}`).join(', ') || '(no places)'} · countries ${g.countries.map((c) => `${c.code}×${c.count}`).join(', ') || '(none)'} · regions ${g.regions.map((r) => `${r.key}×${r.count}`).join(', ') || '(none)'}`

async function rederive(row: EditionRow, places: DcPlace[], countries: DcCountry[]): Promise<{ sql: string | null; line: string }> {
  const ids = (row.story_ids ?? []).map(Number)
  const stories = await listDcNewsByIds(ids)
  const geo = buildGeo(stories, places, countries)
  const oldGeo: EditionGeo = { ...emptyGeo(), ...(row.geo ?? {}) }
  const counts = { ...(row.counts ?? {}), places: geo.places.length }
  const lines = [
    `Edition ${row.edition_date}: ${stories.length}/${ids.length} stories resolved`,
    `  before: ${summarise(oldGeo)}  (counts.places=${String((row.counts ?? {}).places ?? '—')})`,
    `  after : ${summarise(geo)}  (counts.places=${geo.places.length})`,
  ]
  if (JSON.stringify(oldGeo) === JSON.stringify(geo)) return { sql: null, line: `${lines.join('\n')}\n  nothing to change` }
  const sql = `update dc_editions
   set geo = ${sqlString(geo)},
       counts = ${sqlString(counts)}
 where edition_date = '${row.edition_date}' and status = 'published';`
  return { sql, line: lines.join('\n') }
}

async function main() {
  const argv = process.argv.slice(2)
  const all = argv.includes('--all')
  const sqlOut = argv.includes('--sql') ? argv[argv.indexOf('--sql') + 1] : null
  const date = argv.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
  if (!all && !date) throw new Error('Usage: fix-edition-geo <YYYY-MM-DD> | --all [--sql out.sql]')

  const sb = createServiceClient()
  let q = sb.from('dc_editions').select('edition_date, status, story_ids, geo, counts').order('edition_date', { ascending: true })
  q = all ? q.eq('status', 'published') : q.eq('edition_date', date!)
  const { data, error } = await q
  if (error) throw new Error(`read failed: ${error.message}`)
  const rows = (data ?? []) as EditionRow[]
  if (rows.length === 0) {
    const { data: recent } = await sb.from('dc_editions').select('edition_date, status').order('edition_date', { ascending: false }).limit(8)
    const list = (recent ?? []).map((r) => `${r.edition_date} (${r.status})`).join(', ')
    throw new Error(`no ${all ? 'published editions' : `edition for ${date}`}. Most recent: ${list || 'none'}`)
  }
  if (!all && rows[0].status !== 'published') {
    console.log(`Edition ${date} is ${rows[0].status}, not published — use Recompose in admin instead.`)
    return
  }

  const [places, countries] = await Promise.all([listDcPlaces(), listDcCountries()])
  const statements: string[] = []
  for (const row of rows) {
    const { sql, line } = await rederive(row, places, countries)
    console.log(line)
    if (sql) statements.push(sql)
  }
  if (statements.length === 0) {
    console.log('\nNothing to change.')
    return
  }
  const script = `-- fix-edition-geo: ${statements.length} of ${rows.length} published edition(s) re-derived on ${new Date().toISOString().slice(0, 10)}.
-- Run in the Supabase SQL editor. The guard trigger is disabled only inside this transaction.
begin;
alter table dc_editions disable trigger dc_editions_guard;
${statements.join('\n')}
alter table dc_editions enable trigger dc_editions_guard;
commit;
-- Then re-render: POST /api/ai-data-centers/editions/revalidate?date=<date> for each (admin button), or redeploy.`
  if (sqlOut) {
    writeFileSync(sqlOut, script)
    console.log(`\nSQL for ${statements.length} edition(s) written to ${sqlOut}`)
  } else {
    console.log(`\n${script}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

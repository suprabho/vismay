/**
 * One-off correction for a PUBLISHED edition's frozen geography.
 *
 * A published dc_editions row is immutable (trigger dc_editions_guard), and its
 * `geo` pins + `counts.places` are computed at compose time. After place tags
 * on dc_news were corrected (scrape-news --retag-places-days), those frozen
 * numbers still count the old tags. This script re-derives `geo` and
 * `counts.places` with the same `buildGeo` the composer uses, from the
 * edition's frozen story_ids and the CURRENT tags, and PRINTS the SQL — it
 * never writes. Review the diff, then run the SQL in the Supabase SQL editor.
 * The prose (`sub` says "across N places") is left alone.
 *
 * Usage:  pnpm ai-data-centers:fix-edition-geo -- 2026-11-03
 * Env:    NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'
import { listDcNewsByIds, listDcPlaces } from '@vismay/dc-editions/dcEditions'
import { buildGeo } from '@vismay/dc-editions/dcEditionAssembly'
import type { EditionGeo } from '@vismay/dc-editions/dcEditionTypes'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const sqlString = (v: unknown) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`

async function main() {
  const date = process.argv.slice(2).find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a))
  if (!date) throw new Error('Usage: fix-edition-geo <YYYY-MM-DD>')

  const sb = createServiceClient()
  const { data, error } = await sb
    .from('dc_editions')
    .select('edition_date, status, story_ids, geo, counts')
    .eq('edition_date', date)
    .maybeSingle()
  if (error) throw new Error(`read failed: ${error.message}`)
  if (!data) {
    const { data: recent } = await sb
      .from('dc_editions')
      .select('edition_date, status')
      .order('edition_date', { ascending: false })
      .limit(8)
    const list = (recent ?? []).map((r) => `${r.edition_date} (${r.status})`).join(', ')
    throw new Error(`no edition for ${date}. Most recent: ${list || 'none'}`)
  }
  if (data.status !== 'published') {
    console.log(`Edition ${date} is ${data.status}, not published — use Recompose in admin instead.`)
    return
  }

  const ids = ((data.story_ids as unknown[]) ?? []).map(Number)
  const [stories, places] = await Promise.all([listDcNewsByIds(ids), listDcPlaces()])
  const geo = buildGeo(stories, places)
  const oldGeo = data.geo as EditionGeo
  const counts = { ...(data.counts as Record<string, unknown>), places: geo.places.length }

  const summarise = (g: EditionGeo) => g.places.map((p) => `${p.slug}×${p.count}`).join(', ') || '(none)'
  console.log(`Edition ${date}: ${stories.length}/${ids.length} stories resolved`)
  console.log(`  places before: ${summarise(oldGeo)}  (counts.places=${(data.counts as { places?: number }).places})`)
  console.log(`  places after : ${summarise(geo)}  (counts.places=${geo.places.length})`)
  if (JSON.stringify(oldGeo) === JSON.stringify(geo)) {
    console.log('\nNothing to change.')
    return
  }

  console.log(`\n-- Run in the Supabase SQL editor. The guard trigger is disabled only inside this transaction.
begin;
alter table dc_editions disable trigger dc_editions_guard;
update dc_editions
   set geo = ${sqlString(geo)},
       counts = ${sqlString(counts)}
 where edition_date = '${date}' and status = 'published';
alter table dc_editions enable trigger dc_editions_guard;
commit;
-- Then re-render the page: POST /api/ai-data-centers/editions/revalidate?date=${date} (admin button).`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

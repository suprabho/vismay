import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'

const CSV = resolve('vizmaya-data/coke-studio/songs.csv')
const rows = parseCsv(readFileSync(CSV, 'utf8'), { columns: true, skip_empty_lines: true, bom: true })

const seasons = new Map()
let invalidIds = 0
let badArtists = 0
const ids = new Set()
let dupIds = 0
for (const r of rows) {
  const s = Number(r['season'])
  if (Number.isFinite(s)) seasons.set(s, (seasons.get(s) ?? 0) + 1)
  if (!r['song_id']?.match(/^cs_s\d{2}_e\d{2}_t\d{2}$/)) invalidIds++
  if (ids.has(r['song_id'])) dupIds++
  ids.add(r['song_id'])
  if (r['artists'] && / & /.test(r['artists'])) badArtists++
}
console.log('rows:', rows.length)
console.log('invalid song_ids:', invalidIds)
console.log('duplicate song_ids:', dupIds)
console.log('still-unsplit artists cells:', badArtists)
console.log('per-season:')
for (const k of [...seasons.keys()].sort((a,b)=>a-b)) console.log(`  S${k}: ${seasons.get(k)}`)

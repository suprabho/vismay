/**
 * Energy-profile country summary generator — writes a 1-2 sentence editorial
 * blurb into iea_countries.summary for every country that has OWID indicator
 * data but no summary yet. Twelve hand-written seeds (see migration 015) are
 * preserved by default; pass --force to regenerate them too.
 *
 * The prompt grounds the model in OWID numbers (latest electricity mix,
 * primary energy mix, renewables share, GHG, per-capita energy + a decade
 * trend) and shows the seeded blurbs as style anchors so output matches the
 * existing prose register.
 *
 * Run locally:
 *   pnpm energy-profile:generate-summaries                # missing only
 *   pnpm energy-profile:generate-summaries -- --force     # all countries
 *   pnpm energy-profile:generate-summaries -- --code IN   # single country
 *   pnpm energy-profile:generate-summaries -- --dry-run   # print, don't write
 *
 * Required env:
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — write iea_countries
 *   GEMINI_API_KEY                                       — Gemini model
 */

import { GoogleGenAI } from '@google/genai'
import { config as loadEnv } from 'dotenv'
import { createServiceClient } from '@vismay/content-source/supabase'

loadEnv({ path: '.env.local' })
loadEnv({ path: '.env' })

const MODEL = 'gemini-2.5-flash'
// Pace requests so we stay under Gemini's free-tier RPM. ~600ms between calls
// keeps us at ~100 req/min headroom even when generating ~200 countries.
const REQUEST_DELAY_MS = 600

interface Flags {
  force: boolean
  dryRun: boolean
  code: string | null
  limit: number | null
}

function parseFlags(argv: string[]): Flags {
  const flags: Flags = { force: false, dryRun: false, code: null, limit: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--force') flags.force = true
    else if (a === '--dry-run') flags.dryRun = true
    else if (a === '--code') flags.code = (argv[++i] ?? '').toUpperCase()
    else if (a === '--limit') flags.limit = Number(argv[++i])
  }
  return flags
}

interface CountryRow {
  code: string
  name: string
  summary: string | null
}

interface EnergyRow {
  indicator: string
  year: number
  value: number | null
}

interface Snapshot {
  latestYear: number | null
  electricityMix: { source: string; share: number }[]
  primaryMix: { source: string; share: number }[]
  renewablesShareElec: number | null
  renewablesShareEnergy: number | null
  ghgMt: number | null
  energyPerCapitaKwh: number | null
  electricityDemandTwh: number | null
  // Renewables share of electricity, ~10 years before the latest data year.
  renewablesShareElecDecadeAgo: number | null
  coalShareElecDecadeAgo: number | null
  coalShareElecLatest: number | null
}

const ELEC_MIX_LABELS: Record<string, string> = {
  elec_share_coal: 'coal',
  elec_share_gas: 'gas',
  elec_share_oil: 'oil',
  elec_share_nuclear: 'nuclear',
  elec_share_hydro: 'hydro',
  elec_share_wind: 'wind',
  elec_share_solar: 'solar',
  elec_share_biofuel: 'bioenergy',
  elec_share_other_renew: 'other renewables',
}

const PRIMARY_MIX_LABELS: Record<string, string> = {
  primary_share_coal: 'coal',
  primary_share_gas: 'gas',
  primary_share_oil: 'oil',
  primary_share_nuclear: 'nuclear',
  primary_share_hydro: 'hydro',
  primary_share_wind: 'wind',
  primary_share_solar: 'solar',
  primary_share_biofuel: 'bioenergy',
  primary_share_other_renew: 'other renewables',
}

function summariseIndicators(rows: EnergyRow[]): Snapshot {
  const byIndicator = new Map<string, Map<number, number>>()
  let latestYear = -Infinity
  for (const r of rows) {
    if (r.value == null) continue
    if (!byIndicator.has(r.indicator)) byIndicator.set(r.indicator, new Map())
    byIndicator.get(r.indicator)!.set(r.year, r.value)
    if (r.year > latestYear) latestYear = r.year
  }

  const latest = (indicator: string): { year: number; value: number } | null => {
    const m = byIndicator.get(indicator)
    if (!m) return null
    let bestYear = -Infinity
    let bestVal: number | null = null
    for (const [y, v] of m.entries()) {
      if (y > bestYear) { bestYear = y; bestVal = v }
    }
    return bestVal != null ? { year: bestYear, value: bestVal } : null
  }

  const valueAt = (indicator: string, year: number): number | null => {
    return byIndicator.get(indicator)?.get(year) ?? null
  }

  const buildMix = (labels: Record<string, string>): { source: string; share: number }[] => {
    const entries: { source: string; share: number }[] = []
    for (const [key, label] of Object.entries(labels)) {
      const v = latest(key)
      if (v != null) entries.push({ source: label, share: v.value })
    }
    return entries.sort((a, b) => b.share - a.share).slice(0, 4)
  }

  const renewablesElec = latest('renewables_share_elec')
  const decadeYear = renewablesElec ? renewablesElec.year - 10 : null
  const renewablesDecadeAgo = decadeYear ? valueAt('renewables_share_elec', decadeYear) : null

  const coalElec = latest('elec_share_coal')
  const coalDecadeYear = coalElec ? coalElec.year - 10 : null
  const coalDecadeAgo = coalDecadeYear ? valueAt('elec_share_coal', coalDecadeYear) : null

  return {
    latestYear: Number.isFinite(latestYear) ? latestYear : null,
    electricityMix: buildMix(ELEC_MIX_LABELS),
    primaryMix: buildMix(PRIMARY_MIX_LABELS),
    renewablesShareElec: renewablesElec?.value ?? null,
    renewablesShareEnergy: latest('renewables_share_energy')?.value ?? null,
    ghgMt: latest('ghg_from_energy_mt')?.value ?? null,
    energyPerCapitaKwh: latest('energy_per_capita_kwh')?.value ?? null,
    electricityDemandTwh: latest('electricity_demand_twh')?.value ?? null,
    renewablesShareElecDecadeAgo: renewablesDecadeAgo,
    coalShareElecLatest: coalElec?.value ?? null,
    coalShareElecDecadeAgo: coalDecadeAgo,
  }
}

const STYLE_EXAMPLES = `Style anchors (existing seeded summaries — match this register):
- United States: "Largest oil & gas producer; rapid renewables build-out alongside record LNG exports."
- China: "World's largest energy consumer; dominates solar manufacturing and EV deployment."
- India: "Third-largest emitter; coal-heavy grid undergoing record solar additions."
- Russia: "Major oil & gas exporter rerouting flows from Europe to Asia post-2022."
- Saudi Arabia: "OPEC+ swing producer balancing domestic Vision 2030 against export revenue."
- Germany: "Phasing out coal and nuclear; LNG terminals replaced Russian pipeline gas."
- France: "Nuclear-heavy grid restarting fleet availability after 2022 outages."
- Brazil: "Hydro-dominant grid expanding wind in the northeast; ethanol leader."
- South Africa: "Eskom load-shedding crisis driving rapid private solar and storage build."`

const SYSTEM_PROMPT = `You write short editorial blurbs about a country's energy system for a data-journalism site.

Output a single line — one or two sentences, ideally under 25 words total. Match the seeded style:
- Lead with the country's defining role (resource endowment, global ranking, regional position).
- Then a current dynamic: a transition trend, a crisis, a policy, a market shift.
- Use a semicolon to separate the two ideas when both fit.
- Concrete and confident. No hedging ("may", "potentially"), no clichés ("energy landscape", "is committed to"), no marketing.
- Don't recite the percentages back at me — translate them into a fact ("hydro-dominant grid", "coal-heavy mix", "majority-renewable").
- Use general knowledge for context the numbers don't show (e.g. LNG exports, sanctions, Vision 2030) but never invent specific statistics.

${STYLE_EXAMPLES}

Respond ONLY with valid JSON in this exact shape, no markdown fences:
{"summary": "..."}`

function formatMix(mix: { source: string; share: number }[]): string {
  if (mix.length === 0) return 'no data'
  return mix.map((m) => `${m.source} ${m.share.toFixed(1)}%`).join(', ')
}

function buildUserPrompt(name: string, snap: Snapshot): string {
  const lines: string[] = [`Country: ${name}`]
  if (snap.latestYear != null) lines.push(`Latest data year: ${snap.latestYear}`)

  lines.push(`Electricity mix (top sources): ${formatMix(snap.electricityMix)}`)
  lines.push(`Primary energy mix (top sources): ${formatMix(snap.primaryMix)}`)

  if (snap.renewablesShareElec != null) {
    const decade =
      snap.renewablesShareElecDecadeAgo != null
        ? ` (vs ${snap.renewablesShareElecDecadeAgo.toFixed(1)}% a decade earlier)`
        : ''
    lines.push(`Renewables share of electricity: ${snap.renewablesShareElec.toFixed(1)}%${decade}`)
  }
  if (snap.coalShareElecLatest != null && snap.coalShareElecDecadeAgo != null) {
    lines.push(
      `Coal share of electricity: ${snap.coalShareElecLatest.toFixed(1)}% (vs ${snap.coalShareElecDecadeAgo.toFixed(1)}% a decade earlier)`,
    )
  }
  if (snap.renewablesShareEnergy != null) {
    lines.push(`Renewables share of total energy: ${snap.renewablesShareEnergy.toFixed(1)}%`)
  }
  if (snap.ghgMt != null) {
    lines.push(`Energy-related GHG emissions: ${snap.ghgMt.toFixed(1)} Mt CO2e`)
  }
  if (snap.energyPerCapitaKwh != null) {
    lines.push(`Energy per capita: ${snap.energyPerCapitaKwh.toFixed(0)} kWh`)
  }
  if (snap.electricityDemandTwh != null) {
    lines.push(`Electricity demand: ${snap.electricityDemandTwh.toFixed(1)} TWh`)
  }

  return lines.join('\n')
}

async function generateSummary(
  genai: GoogleGenAI,
  name: string,
  snap: Snapshot,
): Promise<string | null> {
  const userPrompt = buildUserPrompt(name, snap)
  const res = await genai.models.generateContent({
    model: MODEL,
    contents: `${SYSTEM_PROMPT}\n\n${userPrompt}`,
  })
  const text = res.text ?? ''
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    const parsed = JSON.parse(match[0]) as { summary?: unknown }
    if (typeof parsed.summary !== 'string') return null
    const trimmed = parsed.summary.trim().replace(/\s+/g, ' ')
    return trimmed.length > 0 ? trimmed : null
  } catch {
    return null
  }
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2))
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY not set')

  const sb = createServiceClient()
  const genai = new GoogleGenAI({ apiKey })

  let q = sb.from('iea_countries').select('code, name, summary').order('code')
  if (flags.code) q = q.eq('code', flags.code)
  const { data: countries, error } = await q
  if (error) throw new Error(`load iea_countries: ${error.message}`)

  let queue = (countries ?? []) as CountryRow[]
  if (!flags.force) queue = queue.filter((c) => !c.summary)
  if (flags.limit != null) queue = queue.slice(0, flags.limit)

  console.log(
    `[summaries] ${queue.length} countries to process (force=${flags.force}, dryRun=${flags.dryRun})`,
  )

  let ok = 0
  let skipped = 0
  let failed = 0

  for (const c of queue) {
    const { data: energyRows, error: energyErr } = await sb
      .from('iea_country_energy')
      .select('indicator, year, value')
      .eq('country_code', c.code)
    if (energyErr) {
      console.error(`  ✗ ${c.code} ${c.name}: ${energyErr.message}`)
      failed++
      continue
    }

    const snap = summariseIndicators((energyRows ?? []) as EnergyRow[])
    if (snap.electricityMix.length === 0 && snap.primaryMix.length === 0 && snap.ghgMt == null) {
      console.log(`  · ${c.code} ${c.name}: no OWID indicators — skipping`)
      skipped++
      continue
    }

    try {
      const summary = await generateSummary(genai, c.name, snap)
      if (!summary) {
        console.warn(`  ✗ ${c.code} ${c.name}: model returned no summary`)
        failed++
        continue
      }

      console.log(`  ✓ ${c.code} ${c.name}: ${summary}`)

      if (!flags.dryRun) {
        const { error: updateErr } = await sb
          .from('iea_countries')
          .update({ summary, updated_at: new Date().toISOString() })
          .eq('code', c.code)
        if (updateErr) {
          console.error(`    write failed: ${updateErr.message}`)
          failed++
          continue
        }
      }
      ok++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`  ✗ ${c.code} ${c.name}: ${msg}`)
      failed++
    }

    if (REQUEST_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS))
    }
  }

  console.log(
    `\n[summaries] done — ok=${ok} skipped=${skipped} failed=${failed} (dryRun=${flags.dryRun})`,
  )
}

main().catch((err) => {
  console.error('[summaries] failed:', err)
  process.exit(1)
})

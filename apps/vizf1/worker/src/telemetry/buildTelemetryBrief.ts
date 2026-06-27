/**
 * CLI wrapper for the F1 telemetry brief.
 *
 * The builder itself lives in @vismay/f1-viz (`./telemetry-brief`) so the admin
 * compose route can share it. This wrapper wires the worker's service-role
 * Supabase client + CLI/env inputs and prints the markdown to stdout.
 *
 *   SESSION_KEY=2026_australian_grand_prix_R pnpm --filter @vizf1/worker build:telemetry-brief
 *
 * Optional focus (narrow the brief):
 *   DRIVERS=3,16                              comma-separated car numbers
 *   CONSTRUCTORS="Red Bull Racing,Ferrari"   comma-separated teamName/teamId
 *   PROMPT="lead with the safety car"         editorial intent
 */
import { buildTelemetryBrief, type BriefFocus } from '@vismay/f1-viz/telemetry-brief'
import { getSupabase } from '../supabase'

function parseFocus(): BriefFocus {
  const driverNumbers = (process.env.DRIVERS ?? '')
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n))
  const constructors = (process.env.CONSTRUCTORS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const prompt = process.env.PROMPT?.trim()
  const focus: BriefFocus = {}
  if (driverNumbers.length) focus.driverNumbers = driverNumbers
  if (constructors.length) focus.constructors = constructors
  if (prompt) focus.prompt = prompt
  return focus
}

export async function runBuildTelemetryBrief() {
  const sessionKey = process.env.SESSION_KEY
  if (!sessionKey) {
    throw new Error('SESSION_KEY env var is required (e.g. 2026_australian_grand_prix_R)')
  }
  const brief = await buildTelemetryBrief(getSupabase(), sessionKey, parseFocus())
  console.log(brief)
}

if (require.main === module) {
  runBuildTelemetryBrief()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error('fatal:', e)
      process.exit(1)
    })
}

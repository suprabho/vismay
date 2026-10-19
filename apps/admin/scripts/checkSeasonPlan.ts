/**
 * Check a season-book plan file before loading it into the Books tab.
 *
 *   pnpm --filter admin exec tsx scripts/checkSeasonPlan.ts <plan.json> <season start year>
 *
 * Validates against planSchema, then prints the same beat, card and pacing
 * issues the planner shows. Exits 1 on a schema error or any `warn` issue.
 */
import { readFileSync } from 'node:fs'
import { beatIssues, cardIssues, pacingIssues, planSchema, spreadNumbers, type Issue } from '../lib/seasonBooks/plan'

const [path, startArg] = process.argv.slice(2)
const start = Number(startArg)
if (!path || !Number.isInteger(start)) {
  console.error('usage: tsx scripts/checkSeasonPlan.ts <plan.json> <season start year>')
  process.exit(2)
}

const parsed = planSchema.safeParse(JSON.parse(readFileSync(path, 'utf8')))
if (!parsed.success) {
  for (const e of parsed.error.issues) console.error(`schema: ${e.path.join('.')}: ${e.message}`)
  process.exit(1)
}
const plan = parsed.data
const nums = spreadNumbers(start, plan.spreads)

const all: { where: string; issue: Issue }[] = [
  ...beatIssues(plan).map(issue => ({ where: 'beats', issue })),
  ...plan.spreads.flatMap(s => cardIssues(s).map(issue => ({ where: `spread ${nums.get(s.id)} (${s.id})`, issue }))),
  ...pacingIssues(start, plan.spreads).map(issue => ({ where: 'pacing', issue })),
]
for (const { where, issue } of all) console.log(`${issue.severity.padEnd(4)}  ${where}: ${issue.message}`)
const warns = all.filter(x => x.issue.severity === 'warn').length
console.log(`${plan.beats.length} beats, ${plan.spreads.length} spreads: ${warns} warning${warns === 1 ? '' : 's'}, ${all.length - warns} note${all.length - warns === 1 ? '' : 's'}`)
process.exit(warns ? 1 : 0)

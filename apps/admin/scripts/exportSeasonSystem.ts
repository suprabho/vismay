/**
 * Print the locked season-book design system as JSON, for handoffs outside the admin
 * (vizmaya-data/football-seasons/scripts/handoff.py turns it into CSVs and a spec).
 *
 *   pnpm --filter admin exec tsx scripts/exportSeasonSystem.ts > system.json
 */
import { CHART_FORMS, CHART_STYLE, PAGE, PALETTE, RESULT_COLOURS, ROLE_META, SYSTEM_VERSION, TEMPLATES, TEMPLATE_ORDER, TYPE_SCALE } from '../lib/seasonBooks/system'

const roles = Object.fromEntries(Object.entries(ROLE_META).map(([k, v]) => [k, { label: v.label, letter: v.letter }]))
console.log(JSON.stringify({
  version: SYSTEM_VERSION,
  page: PAGE,
  typeScale: TYPE_SCALE,
  palette: PALETTE,
  resultColours: RESULT_COLOURS,
  chartStyle: CHART_STYLE,
  chartForms: CHART_FORMS,
  roles,
  templates: TEMPLATE_ORDER.map(id => TEMPLATES[id]),
}, null, 1))

/**
 * GET /api/modules — serialize every registered VizModule's metadata as JSON.
 *
 * Runs inside the Next server runtime, where the viz-engine + vertical imports
 * (which transitively pull CSS / Mapbox / DOM code) resolve correctly. The
 * @vismay/mcp server fetches this endpoint for its list_verticals / list_modules
 * tools instead of importing viz-engine in a raw Node process (where the CSS
 * imports in the barrel would fail to parse).
 *
 * Only metadata is read — module `load()` closures are never called, so no
 * React component is evaluated here.
 */

import { NextResponse } from 'next/server'
import {
  allRegisteredTypes,
  getVizModule,
  loadVertical,
  registerVerticalLoader,
} from '@vismay/viz-engine'
import { zodToJsonSchema } from 'zod-to-json-schema'

export const dynamic = 'force-dynamic'

// Route handlers don't run the root layout, so boot verticals here too. All
// calls are idempotent.
registerVerticalLoader('f1', () => import('@vismay/f1-viz').then((m) => m.register()))
registerVerticalLoader('footshorts', () =>
  import('@vismay/footshorts-viz').then((m) => m.register()),
)
registerVerticalLoader('starship', () =>
  import('@vismay/starship-viz').then((m) => m.register()),
)
registerVerticalLoader('kidzovo', () => import('@vismay/kidzovo-viz').then((m) => m.register()))

const VERTICALS = ['f1', 'footshorts', 'starship', 'kidzovo'] as const

function deriveVertical(type: string): string {
  if (type.startsWith('f1:')) return 'f1'
  if (type.startsWith('fs:')) return 'footshorts'
  if (type.startsWith('starship:')) return 'starship'
  if (type.startsWith('kz:')) return 'kidzovo'
  return 'core'
}

function serialize(type: string) {
  const m = getVizModule(type)
  if (!m) return null

  let adminForm: unknown = null
  if (m.adminForm) {
    try {
      adminForm = m.adminForm(null as never)
    } catch {
      adminForm = null
    }
  }

  let configSchema: unknown = null
  if (m.schema) {
    try {
      configSchema = zodToJsonSchema(m.schema, { $refStrategy: 'none' })
    } catch {
      configSchema = null
    }
  }

  return {
    type: m.type,
    label: m.label,
    vertical: deriveVertical(m.type),
    slots: m.slots,
    mountingMode: m.mountingMode ?? 'per-unit',
    readinessProfile: m.readinessProfile ?? null,
    regionPreferences: m.regionPreferences ?? [],
    adminForm,
    configSchema,
  }
}

export async function GET() {
  await Promise.all(VERTICALS.map((slug) => loadVertical(slug)))
  const modules = allRegisteredTypes()
    .map(serialize)
    .filter((m): m is NonNullable<typeof m> => m !== null)
  return NextResponse.json({ modules })
}

import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { FsCardFormConfig } from '../types'

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardFormConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:form layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.compKey !== 'string' || !r.compKey) {
    throw new Error(`${ctx.label}: fscard:form requires a 'compKey'`)
  }
  if (typeof r.teamSlug !== 'string' || !r.teamSlug) {
    throw new Error(`${ctx.label}: fscard:form requires a 'teamSlug'`)
  }
  return { type: 'fscard:form', compKey: r.compKey, teamSlug: r.teamSlug }
}

function adminForm(): AdminFormField[] {
  return [
    { kind: 'picker', key: 'compKey', label: 'Competition', pickerId: 'footshorts:competition', required: true },
    { kind: 'picker', key: 'teamSlug', label: 'Team', pickerId: 'footshorts:team', dependsOn: ['compKey'], required: true },
  ]
}

const formCardModule: VizModule<FsCardFormConfig> = {
  type: 'fscard:form',
  label: 'Form grid',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:form:${c.compKey}:${c.teamSlug}`,
}

export default formCardModule

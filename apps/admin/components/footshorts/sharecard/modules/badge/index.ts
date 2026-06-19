import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { FsCardBadgeConfig } from '../types'

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardBadgeConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:badge layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  const kind = r.kind === 'logo' || r.kind === 'flag' ? r.kind : 'crest'
  const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
  return {
    type: 'fscard:badge',
    url: typeof r.url === 'string' ? r.url : '',
    kind,
    label: typeof r.label === 'string' ? r.label : undefined,
    xPct: num(r.xPct, 50),
    yPct: num(r.yPct, 50),
    widthPct: num(r.widthPct, 18),
  }
}

function adminForm(): AdminFormField[] {
  // Position / size / rotation are edited via the free-mode Transform panel.
  return [{ kind: 'picker', key: 'url', label: 'Badge', pickerId: 'footshorts:badge', required: true }]
}

const badgeCardModule: VizModule<FsCardBadgeConfig> = {
  type: 'fscard:badge',
  label: 'Share card — badge',
  slots: ['foreground'],
  placement: 'overlay',
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:badge:${c.url}`,
}

export default badgeCardModule

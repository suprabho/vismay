import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { FsCardNewsImageConfig } from '../types'

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardNewsImageConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:news-image layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.newsId !== 'string' || !r.newsId) {
    throw new Error(`${ctx.label}: fscard:news-image requires a 'newsId'`)
  }
  return {
    type: 'fscard:news-image',
    newsId: r.newsId,
    hideCaption: r.hideCaption === true ? true : undefined,
  }
}

function adminForm(): AdminFormField[] {
  return [
    { kind: 'picker', key: 'newsId', label: 'Article', pickerId: 'footshorts:news', required: true },
    { kind: 'boolean', key: 'hideCaption', label: 'Hide headline' },
  ]
}

const newsImageCardModule: VizModule<FsCardNewsImageConfig> = {
  type: 'fscard:news-image',
  label: 'News image',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:news-image:${c.newsId}`,
}

export default newsImageCardModule

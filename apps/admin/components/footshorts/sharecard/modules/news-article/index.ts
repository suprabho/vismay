import type { AdminFormField, VizModule } from '@vismay/viz-engine'
import type { FsCardNewsArticleConfig } from '../types'

function parseConfig(raw: unknown, ctx: { slug: string; label: string }): FsCardNewsArticleConfig {
  if (!raw || typeof raw !== 'object') {
    throw new Error(`${ctx.label}: fscard:news-article layer must be an object`)
  }
  const r = raw as Record<string, unknown>
  if (typeof r.newsId !== 'string' || !r.newsId) {
    throw new Error(`${ctx.label}: fscard:news-article requires a 'newsId'`)
  }
  return { type: 'fscard:news-article', newsId: r.newsId }
}

function adminForm(): AdminFormField[] {
  return [
    { kind: 'picker', key: 'newsId', label: 'Article', pickerId: 'footshorts:news', required: true },
  ]
}

const newsArticleCardModule: VizModule<FsCardNewsArticleConfig> = {
  type: 'fscard:news-article',
  label: 'Share card — news article',
  slots: ['foreground'],
  parseConfig,
  adminForm,
  load: () => import('./Component'),
  readinessProfile: 'instant',
  stableIdentity: (c) => `fscard:news-article:${c.newsId}`,
}

export default newsArticleCardModule

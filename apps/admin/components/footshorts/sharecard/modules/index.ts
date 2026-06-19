import { getVizModule, registerVizModule, type VizModule } from '@vismay/viz-engine'
import matchCardModule from './match'
import matchTimelineCardModule from './match-timeline'
import fixturesCardModule from './fixtures'
import standingsCardModule from './standings'
import formCardModule from './form'
import newsImageCardModule from './news-image'
import newsArticleCardModule from './news-article'
import aiImageCardModule from './ai-image'
import badgeCardModule from './badge'

/**
 * Register the footshorts share-card module family (`fscard:*`) into the
 * viz-engine registry. These coexist with the story `fs:*` modules (distinct
 * `fscard:` prefix) — they differ because share-card rendering proxies crests
 * for html-to-image capture, drops the FsFrame background, and adds the card
 * header. Idempotent (guards on `getVizModule`), so it's safe to call on every
 * share-card page mount / HMR reload.
 */
function register<T>(m: VizModule<T>): void {
  if (!getVizModule(m.type)) registerVizModule(m)
}

export function registerFootshortsShareCardModules(): void {
  register(matchCardModule)
  register(matchTimelineCardModule)
  register(fixturesCardModule)
  register(standingsCardModule)
  register(formCardModule)
  register(newsImageCardModule)
  register(newsArticleCardModule)
  register(aiImageCardModule)
  register(badgeCardModule)
}

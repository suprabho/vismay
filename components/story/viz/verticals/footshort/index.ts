/**
 * Footshort vertical — bundle of viz types for football storytelling.
 *
 * This file is the only entry point the engine loads when a story's
 * frontmatter declares `vertical: 'footshort'`. It dynamic-imports each
 * concrete module and registers it. Modules live in this folder so they're
 * tree-shaken out of vizmaya.fyi's SSG bundle.
 *
 * Phase 6 ships ONE proof-of-concept module — `fs:match-card` — wired the
 * same way real vertical modules will be once Footshort lands. The point is
 * to prove the plugin boundary works end-to-end without changing any core
 * dispatcher code.
 */

import { registerVizModule } from '../../registry'

export async function register(): Promise<void> {
  const [{ default: matchCardModule }] = await Promise.all([import('./modules/match-card')])
  registerVizModule(matchCardModule)
}

/**
 * Footshorts vertical — bundle of viz types for football storytelling.
 *
 * This file is the only entry point the engine loads when a story's
 * frontmatter declares `vertical: 'footshorts'`. It dynamic-imports each
 * concrete module and registers it. Modules live in this folder so they're
 * tree-shaken out of vizmaya.fyi's SSG bundle.
 *
 * Phase 6 ships ONE proof-of-concept module — `fs:match-card` — wired the
 * same way real vertical modules will be once Footshorts lands. The point is
 * to prove the plugin boundary works end-to-end without changing any core
 * dispatcher code.
 */

import { registerVizModule } from '@vismay/viz-engine'

export async function register(): Promise<void> {
  const [
    { default: matchCardModule },
    { default: matchRowModule },
    { default: matchTileModule },
    { default: matchTimelineModule },
    { default: standingsTableModule },
    { default: bracketModule },
    { default: tacticsBoardModule },
    { default: standingsOverMatchdaysModule },
    { default: teamFormStripModule },
  ] = await Promise.all([
    import('./modules/match-card'),
    import('./modules/match-row'),
    import('./modules/match-tile'),
    import('./modules/match-timeline'),
    import('./modules/standings-table'),
    import('./modules/bracket'),
    import('./modules/tactics-board'),
    import('./modules/standings-over-matchdays'),
    import('./modules/team-form-strip'),
  ])
  registerVizModule(matchCardModule)
  registerVizModule(matchRowModule)
  registerVizModule(matchTileModule)
  registerVizModule(matchTimelineModule)
  registerVizModule(standingsTableModule)
  registerVizModule(bracketModule)
  registerVizModule(tacticsBoardModule)
  registerVizModule(standingsOverMatchdaysModule)
  registerVizModule(teamFormStripModule)
}

/**
 * Kidzovo vertical — bundle of viz types for kids' story scrollytelling.
 *
 * Engine boot calls this `register()` once when a story's frontmatter
 * declares `vertical: 'kidzovo'`. Each concrete module (kz:character,
 * kz:bubble, …) will be dynamic-imported and handed to `registerVizModule`
 * so vizmaya.fyi (and any app that doesn't render Kidzovo stories)
 * tree-shakes them out of the bundle.
 *
 * Phase 0 ships an empty `register()` — no modules yet, just the loader
 * boundary. Proves the plugin path is wired before we add the
 * `kz-storybook` layout (phase 1), `kz:character` (phase 2), and
 * `kz:bubble` (phase 3). See docs/kidzovo-vertical-plan.md for the
 * full phase breakdown.
 */

export async function register(): Promise<void> {
  // TODO(kidzovo-scaffold): replace with parallel dynamic imports of
  // ./modules/character and ./modules/bubble, plus
  // registerForegroundLayout(kzStorybook) once those phases land.
  // eslint-disable-next-line no-console
  console.log('[kidzovo-viz] registered')
}

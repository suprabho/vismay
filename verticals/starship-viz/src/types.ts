/**
 * Domain types shared across @vismay/starship-viz modules.
 *
 * Kept here so the vertical owns the contract and presentational components
 * can be consumed from any app without reaching into a specific app's lib/.
 */

/** Available story moments. Each maps to one animation behavior in StarshipScene. */
export type StarshipMode = 'rotate' | 'explode' | 'bellyflop' | 'inspect'

/** Material preset applied to all named parts of the ship. */
export type StarshipMaterial = 'metal' | 'black'

/**
 * Which rocket model the scene loads. Each registered model ships its own
 * `.glb` plus a list of named top-level groups used by `explode` mode.
 *
 * Adding a new rocket: drop a `.glb` into `public/models/`, add an entry to
 * `ROCKET_MODELS` below, and the rest of the system picks it up.
 */
export type RocketModel = 'starship' | 'falcon-9'

/**
 * Per-model metadata. `glbUrl` is the runtime fetch path (also where the
 * consuming app must serve the file from `public/`). `partNames` is the
 * ordered list of named groups inside the GLB that `explode` will pull
 * apart — kept on this side instead of inferred from the GLB so authors
 * can pick which sub-trees count as "parts" for the explode view.
 */
export interface RocketSpec {
  glbUrl: string
  /** Top-level group names inside the GLB to use as explode/inspector parts. */
  partNames: readonly string[]
  /** Material preset overrides. `null` = use the part's authored material as-is. */
  materialOverrides?: 'apply' | 'preserve-authored'
  /** Human-readable display name. */
  label: string
}

export const ROCKET_MODELS: Record<RocketModel, RocketSpec> = {
  starship: {
    glbUrl: '/models/starship.glb',
    partNames: ['cone', 'tank', 'raptor'],
    // STL-sourced parts have no authored materials, so we always apply
    // metal/black presets.
    materialOverrides: 'apply',
    label: 'Starship (SS)',
  },
  'falcon-9': {
    glbUrl: '/models/falcon-9.glb',
    // Top-level visible chunks inside the Sketchfab Falcon 9. Fairings
    // are listed last so they sort above the stages in explode mode.
    partNames: ['First Stage', 'Second Stage', 'Fairing 1', 'Fairing 2'],
    // Sketchfab GLB ships its own authored materials + textures — overriding
    // them would lose the F9-branded textures the model came with.
    materialOverrides: 'preserve-authored',
    label: 'Falcon 9',
  },
}

/** Legacy alias for code that still names Starship parts directly. */
export type StarshipPart = 'cone' | 'tank' | 'raptor'

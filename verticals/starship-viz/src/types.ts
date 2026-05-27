/**
 * Starship-domain types shared across @vismay/starship-viz modules.
 *
 * Kept here so the vertical owns the contract and presentational components
 * can be consumed from any app without reaching into a specific app's lib/.
 */

/** Available story moments. Each maps to one animation behavior in StarshipScene. */
export type StarshipMode = 'rotate' | 'explode' | 'bellyflop' | 'inspect'

/** Material preset applied to all named parts of the ship. */
export type StarshipMaterial = 'metal' | 'black'

/** Named parts inside the merged starship.glb. Used for explode targets and inspector labels. */
export type StarshipPart = 'cone' | 'tank' | 'raptor'

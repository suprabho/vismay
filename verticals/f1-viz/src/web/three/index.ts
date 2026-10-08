/**
 * The 3D track view for host pages that drive it themselves (their own clock,
 * camera and focus), e.g. vizf1's race recap. Pulls in three.js, so import it
 * lazily (next/dynamic). Story pages mount it as the `f1:track-3d` module.
 */
export { TrackScene3D } from './TrackScene3D'
export { DEFAULT_CAR_MODEL_URL } from './carModel'

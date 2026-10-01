/**
 * Camera modes for the 3D track view. Dependency-free so module config
 * parsing can validate them without pulling three.js into the eager bundle.
 */
export type CameraMode = 'auto' | 'pov' | 'chase' | 'tv' | 'heli' | 'orbit'
/** A concrete shot the camera can be in (every mode but the free orbit). */
export type ShotKind = 'pov' | 'chase' | 'tv' | 'heli'

export const CAMERA_MODES: CameraMode[] = ['auto', 'pov', 'chase', 'tv', 'heli', 'orbit']

export function isCameraMode(v: unknown): v is CameraMode {
  return typeof v === 'string' && (CAMERA_MODES as string[]).includes(v)
}

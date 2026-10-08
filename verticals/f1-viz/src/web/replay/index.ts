/**
 * The replay data seam the 3D track view consumes (session, circuit and
 * per-driver position tracks), plus the playhead helpers. No three.js.
 */
export { createFixtureDataSource, createInlineDataSource, type ReplayDataSource, type ReplayFixture } from './dataSource'
export { useReplayData, type ReplayDataState } from './useReplayData'
export { findFrameIndex, timeAtLapStart } from './trackProjection'
export { CAMERA_MODES, isCameraMode, type CameraMode } from '../three/cameraModes'
export type * from './types'

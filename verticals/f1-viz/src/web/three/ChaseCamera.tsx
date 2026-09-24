import { useRef, type ComponentRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import type { CarPositionTrack } from '../replay/types'
import { interpolateFrame } from '../replay/trackProjection'
import type { WorldProjector } from './track3d'

interface Props {
  chase: boolean
  track: CarPositionTrack | null
  projector: WorldProjector
  currentTimeRef: React.RefObject<number>
  /** Disable interaction entirely (capture/print — keep a static framing). */
  interactive?: boolean
}

const TMP_TARGET = new THREE.Vector3()
const TMP_CAM = new THREE.Vector3()

/**
 * Orbit controls by default. When chase mode is on and a driver is focused, the
 * camera eases to a trailing follow position derived from the car's heading.
 * Ported from the f1_backend donor.
 */
export function ChaseCamera({ chase, track, projector, currentTimeRef, interactive = true }: Props) {
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const { camera } = useThree()

  useFrame(() => {
    if (!chase || !track || !controls.current) return
    const t = currentTimeRef.current ?? 0
    const f = interpolateFrame(track, t)
    if (!f.ok) return

    const [wx, wy, wz] = projector.toWorld(f.x, f.y, f.z)
    const ahead = interpolateFrame(track, t + 300)
    let hx = 0
    let hz = 1
    if (ahead.ok) {
      const [ax, , az] = projector.toWorld(ahead.x, ahead.y, ahead.z)
      hx = ax - wx
      hz = az - wz
      const len = Math.hypot(hx, hz) || 1
      hx /= len
      hz /= len
    }
    // Offsets scale with the circuit (world units are metres, and the ribbon
    // and car markers are sized from projector.radius too). The old fixed
    // 30-back / 14-up put the camera inside the focused car's marker on a
    // full-size circuit — the frame filled with the marker and the track edge.
    // Trail well behind and above, and aim a little ahead of the car so the
    // corner it's approaching is in view.
    const r = projector.radius
    const back = Math.max(60, r * 0.14)
    const up = Math.max(28, r * 0.07)
    const lookAhead = Math.max(20, r * 0.06)
    TMP_CAM.set(wx - hx * back, wy + up, wz - hz * back)
    TMP_TARGET.set(wx + hx * lookAhead, wy, wz + hz * lookAhead)
    camera.position.lerp(TMP_CAM, 0.08)
    controls.current.target.lerp(TMP_TARGET, 0.12)
    controls.current.update()
  })

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enabled={interactive && !chase}
      enablePan={interactive && !chase}
      maxPolarAngle={Math.PI / 2.05}
      minDistance={10}
      dampingFactor={0.1}
    />
  )
}

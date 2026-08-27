import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { CircuitGeometry } from '../replay/types'
import { SECTOR_COLOR_HEX, type SectorColor } from './sectorClassification'
import type { WorldProjector } from './track3d'

// On the dark 3D backdrop the 2D neutral (#111827) is invisible — use a light
// grey so the unfocused track reads as a road; PB/purple stay as accents.
const RIBBON_HEX: Record<SectorColor, string> = {
  neutral: '#8b93a3',
  pb: SECTOR_COLOR_HEX.pb,
  purple: SECTOR_COLOR_HEX.purple,
}

interface Props {
  circuit: CircuitGeometry
  projector: WorldProjector
  sectorColors: [SectorColor, SectorColor, SectorColor]
}

/**
 * A constant-width track ribbon built from the circuit outline centreline.
 * Sector colouring is baked as vertex colours (one draw call) and updated in
 * place when the focused driver's sector classification changes — geometry is
 * built once. Ported verbatim from the f1_backend donor.
 */
export function TrackRibbon({ circuit, projector, sectorColors }: Props) {
  const built = useMemo(() => {
    const pts = projector.outlineWorld
    const n = pts.length
    if (n < 3) return null

    const halfWidth = Math.max(8, projector.radius * 0.014)

    const sb = circuit.sectorBoundaries
    const slotFor = (i: number): 0 | 1 | 2 => {
      if (!sb) return 0
      if (i < sb.index1) return 0
      if (i < sb.index2) return 1
      return 2
    }

    const up = new THREE.Vector3(0, 1, 0)
    const left: THREE.Vector3[] = []
    const right: THREE.Vector3[] = []
    for (let i = 0; i < n; i++) {
      const cur = new THREE.Vector3(...pts[i])
      const prev = new THREE.Vector3(...pts[(i - 1 + n) % n])
      const next = new THREE.Vector3(...pts[(i + 1) % n])
      const tangent = next.clone().sub(prev)
      tangent.y = 0
      if (tangent.lengthSq() < 1e-6) tangent.set(1, 0, 0)
      tangent.normalize()
      const normal = new THREE.Vector3().crossVectors(up, tangent).normalize()
      left.push(cur.clone().addScaledVector(normal, halfWidth))
      right.push(cur.clone().addScaledVector(normal, -halfWidth))
    }

    const positions: number[] = []
    const slots: number[] = []
    const pushTri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, slot: number) => {
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z)
      slots.push(slot, slot, slot)
    }
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const slot = slotFor(i)
      pushTri(left[i], right[i], left[j], slot)
      pushTri(right[i], right[j], left[j], slot)
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(slots.length * 3), 3))
    geometry.computeVertexNormals()
    return { geometry, slots }
  }, [circuit, projector])

  useEffect(() => {
    if (!built) return
    const { geometry, slots } = built
    const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute
    const c = new THREE.Color()
    for (let v = 0; v < slots.length; v++) {
      c.set(RIBBON_HEX[sectorColors[slots[v]]])
      colorAttr.setXYZ(v, c.r, c.g, c.b)
    }
    colorAttr.needsUpdate = true
  }, [built, sectorColors])

  useEffect(() => () => built?.geometry.dispose(), [built])

  if (!built) return null
  return (
    <mesh geometry={built.geometry}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  )
}

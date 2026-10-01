import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { CircuitGeometry } from '../replay/types'
import { SECTOR_COLOR_HEX, type SectorColor } from './sectorClassification'
import { trackHalfWidth, type WorldProjector } from './track3d'

// On the dark 3D backdrop the 2D neutral (#111827) is invisible — use a light
// grey so the unfocused track reads as a road; PB/purple stay as accents.
// Close-up cameras get darker asphalt so the white edge lines and the cars pop.
const RIBBON_HEX: Record<SectorColor, string> = {
  neutral: '#8b93a3',
  pb: SECTOR_COLOR_HEX.pb,
  purple: SECTOR_COLOR_HEX.purple,
}
const ASPHALT_HEX = '#4b515c'
/** White track-limit lines along both edges (slot 3) — read well from onboard. */
const EDGE_HEX = '#e8eaee'
const EDGE_SLOT = 3
const EDGE_WIDTH_M = 0.6

interface Props {
  circuit: CircuitGeometry
  projector: WorldProjector
  sectorColors: [SectorColor, SectorColor, SectorColor]
  /** Close-up camera: asphalt-dark neutral instead of the overview grey. */
  closeUp?: boolean
}

/**
 * A constant-width track ribbon built from the circuit outline centreline,
 * with white edge lines. Sector colouring is baked as vertex colours (one draw
 * call) and updated in place when the focused driver's sector classification
 * changes — geometry is built once. Ported from the f1_backend donor.
 */
export function TrackRibbon({ circuit, projector, sectorColors, closeUp = false }: Props) {
  const built = useMemo(() => {
    const pts = projector.outlineWorld
    const n = pts.length
    if (n < 3) return null

    const halfWidth = trackHalfWidth(projector)
    const inner = halfWidth - EDGE_WIDTH_M

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
    const leftIn: THREE.Vector3[] = []
    const rightIn: THREE.Vector3[] = []
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
      leftIn.push(cur.clone().addScaledVector(normal, inner))
      rightIn.push(cur.clone().addScaledVector(normal, -inner))
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
      pushTri(leftIn[i], rightIn[i], leftIn[j], slot)
      pushTri(rightIn[i], rightIn[j], leftIn[j], slot)
      pushTri(left[i], leftIn[i], left[j], EDGE_SLOT)
      pushTri(leftIn[i], leftIn[j], left[j], EDGE_SLOT)
      pushTri(rightIn[i], right[i], rightIn[j], EDGE_SLOT)
      pushTri(right[i], right[j], rightIn[j], EDGE_SLOT)
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
      const sector = sectorColors[slots[v]]
      c.set(slots[v] === EDGE_SLOT ? EDGE_HEX : closeUp && sector === 'neutral' ? ASPHALT_HEX : RIBBON_HEX[sector])
      colorAttr.setXYZ(v, c.r, c.g, c.b)
    }
    colorAttr.needsUpdate = true
  }, [built, sectorColors, closeUp])

  useEffect(() => () => built?.geometry.dispose(), [built])

  if (!built) return null
  return (
    <mesh geometry={built.geometry}>
      <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
    </mesh>
  )
}

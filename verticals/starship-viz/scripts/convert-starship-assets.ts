/**
 * One-time STL → merged GLB → Draco compression pipeline.
 *
 * Reads raw STL parts from `assets/source/` (gitignored — placed there by
 * `cp` from the upstream model archive), normalizes pivots so each part
 * rotates around a sensible origin, scales the whole ship to a unit-ish
 * bounding box, and emits a single `public/models/starship.glb` with named
 * top-level children — `cone`, `tank`, `raptor` — matching what
 * `StarshipScene` looks up at runtime.
 *
 * Draco compression runs as a second pass via `@gltf-transform/functions`.
 * Without it the merged GLB is ~13 MB (dominated by the Raptor cluster);
 * after Draco it drops to under 2 MB.
 *
 * Run once locally after the source files have been staged:
 *
 *   cd verticals/starship-viz
 *   pnpm convert-assets
 *
 * The 3MF variants in `assets/source/` are intentionally ignored — material
 * variants (`metal` vs `black`) are renderer-side concerns handled by
 * `applyMaterial`. Carrying both geometries would double the bundle for
 * cosmetics that PBR already gives us.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'

// GLTFExporter uses `FileReader` / `Blob` / `URL.createObjectURL` to assemble
// the binary buffer — all browser-only APIs. JSDOM gives us drop-in
// implementations. The polyfill MUST happen before `three` is imported,
// so we keep it at module scope (sync) and defer the three.js imports to
// runtime via dynamic import inside `main()`.
const dom = new JSDOM('', { url: 'http://localhost' })
const g = globalThis as unknown as Record<string, unknown>
g.window = dom.window
g.document = dom.window.document
g.self = dom.window
g.navigator = dom.window.navigator
g.FileReader = dom.window.FileReader
g.Blob = dom.window.Blob
g.URL = dom.window.URL

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const SOURCE_DIR = resolve(PKG_ROOT, 'assets/source')
const OUTPUT_PATH = resolve(PKG_ROOT, 'public/models/starship.glb')

/** Which STL provides geometry for each named part. */
const PART_FILES: Record<string, string> = {
  cone: 'ss_cone_black_x1.stl',
  tank: 'ss_tank_black_x1.stl',
  raptor: 'ss_raptor_black_x1.stl',
}

async function main(): Promise<void> {
  const THREE = await import('three')
  const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
  const { GLTFExporter } = await import(
    'three/examples/jsm/exporters/GLTFExporter.js'
  )
  const { NodeIO } = await import('@gltf-transform/core')
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
  const { draco } = await import('@gltf-transform/functions')
  const draco3d = (await import('draco3dgltf')).default

  if (!existsSync(SOURCE_DIR)) {
    throw new Error(
      `Source dir not found: ${SOURCE_DIR}\nStage STL/3MF files from the upstream archive first.`,
    )
  }

  /**
   * Load one STL into a named Mesh. Centers the geometry on its XZ midpoint
   * (so spinning around Y feels natural) but preserves Y so the assembly
   * stacks the same way the source files were authored.
   */
  function loadPartMesh(name: string, file: string) {
    const buf = readFileSync(resolve(SOURCE_DIR, file))
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    const geometry = new STLLoader().parse(ab as ArrayBuffer)
    geometry.computeBoundingBox()
    geometry.computeVertexNormals()
    const bbox = geometry.boundingBox!
    const cx = (bbox.min.x + bbox.max.x) / 2
    const cz = (bbox.min.z + bbox.max.z) / 2
    geometry.translate(-cx, 0, -cz)
    const mesh = new THREE.Mesh(geometry)
    mesh.name = name
    return mesh
  }

  console.log('[convert] loading STL parts…')
  const root = new THREE.Group()
  root.name = 'starship'
  for (const [partName, file] of Object.entries(PART_FILES)) {
    const path = resolve(SOURCE_DIR, file)
    if (!existsSync(path)) {
      throw new Error(`Missing source file: ${path}`)
    }
    const mesh = loadPartMesh(partName, file)
    console.log(
      `  - ${partName}: ${file} (${mesh.geometry.attributes.position.count} vertices)`,
    )
    root.add(mesh)
  }

  // The source STL files use Z-up (CAD/build-plate convention); Three.js
  // and glTF are Y-up. Bake a -90° X rotation into the geometry so the
  // exported GLB stands vertically when loaded directly — no runtime
  // rotation needed. Done before scaling so the bounding-box normalization
  // below operates in the final orientation.
  root.rotateX(-Math.PI / 2)
  root.updateMatrixWorld(true)

  // Normalize the whole assembly to fit a ~3-unit-tall bounding box so the
  // R3F camera doesn't need per-glb calibration.
  const bbox = new THREE.Box3().setFromObject(root)
  const size = bbox.getSize(new THREE.Vector3())
  const tallest = Math.max(size.x, size.y, size.z)
  const targetHeight = 3
  const scale = targetHeight / tallest
  root.scale.setScalar(scale)
  // Re-center on Y so the ship sits with feet near y = -1.4 (matches the
  // ground plane in StarshipScene).
  const scaledBbox = new THREE.Box3().setFromObject(root)
  const yCenter = (scaledBbox.min.y + scaledBbox.max.y) / 2
  root.position.y -= yCenter
  root.updateMatrixWorld(true)

  console.log('[convert] exporting GLB…')
  const exporter = new GLTFExporter()
  const glbBuffer = await new Promise<ArrayBuffer>((resolveExport, rejectExport) => {
    exporter.parse(
      root,
      (result) => {
        if (result instanceof ArrayBuffer) resolveExport(result)
        else rejectExport(new Error('GLTFExporter returned JSON, expected binary'))
      },
      (err) => rejectExport(err),
      { binary: true, embedImages: true },
    )
  })
  const rawSizeMb = (glbBuffer.byteLength / 1024 / 1024).toFixed(2)
  console.log(`[convert] raw GLB: ${rawSizeMb} MB`)

  console.log('[convert] applying Draco compression…')
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'draco3d.decoder': await draco3d.createDecoderModule(),
    })
  const doc = await io.readBinary(new Uint8Array(glbBuffer))
  await doc.transform(
    draco({
      method: 'edgebreaker',
      encodeSpeed: 5,
      decodeSpeed: 5,
    }),
  )
  const compressed = await io.writeBinary(doc)
  const compressedMb = (compressed.byteLength / 1024 / 1024).toFixed(2)
  console.log(`[convert] compressed GLB: ${compressedMb} MB`)

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
  writeFileSync(OUTPUT_PATH, compressed)
  console.log(`[convert] wrote ${OUTPUT_PATH}`)
}

main().catch((err) => {
  console.error('[convert] failed:', err)
  process.exitCode = 1
})

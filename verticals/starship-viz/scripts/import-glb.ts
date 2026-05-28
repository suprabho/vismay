/**
 * Generic GLB importer: takes any glTF binary, normalizes its bounding box
 * to a target height, recenters on Y so the model sits on our ground plane,
 * and Draco-compresses the result.
 *
 * Uses `@gltf-transform` end-to-end (no Three.js loaders, no JSDOM polyfill)
 * so textures, materials, and animations pass through cleanly — earlier
 * versions routed through `GLTFLoader` and JSDOM, which dropped textures
 * because `URL.createObjectURL` isn't implemented.
 *
 * Usage:
 *   pnpm tsx scripts/import-glb.ts <input> <output> [targetHeight]
 *
 * Example:
 *   pnpm tsx scripts/import-glb.ts \
 *     ~/Downloads/falcon_9_-_spacex.glb \
 *     public/models/falcon-9.glb \
 *     3
 *
 * `convert-starship-assets.ts` still owns the STL → GLB path for the
 * original Starship parts; this script is for already-glTF sources.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'

async function main(): Promise<void> {
  const [inputArg, outputArg, heightArg] = process.argv.slice(2)
  if (!inputArg || !outputArg) {
    console.error(
      'Usage: pnpm tsx scripts/import-glb.ts <input.glb> <output.glb> [targetHeight=3]',
    )
    process.exit(1)
  }
  const inputPath = resolve(inputArg)
  const outputPath = resolve(outputArg)
  const targetHeight = heightArg ? parseFloat(heightArg) : 3
  if (!existsSync(inputPath)) throw new Error(`Not found: ${inputPath}`)

  const { NodeIO, getBounds } = await import('@gltf-transform/core')
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
  const { draco } = await import('@gltf-transform/functions')
  const draco3d = (await import('draco3dgltf')).default

  console.log(`[import] reading ${inputPath}`)
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({
      'draco3d.encoder': await draco3d.createEncoderModule(),
      'draco3d.decoder': await draco3d.createDecoderModule(),
    })
  const doc = await io.read(inputPath)
  const root = doc.getRoot()
  const scenes = root.listScenes()
  if (scenes.length === 0) throw new Error('No scene in glTF')
  const scene = scenes[0]!

  // World-space AABB via gltf-transform's `bounds()` — respects every nested
  // transform in the scene graph, exactly what we need.
  const aabb = getBounds(scene)
  const sizeRaw = [
    aabb.max[0] - aabb.min[0],
    aabb.max[1] - aabb.min[1],
    aabb.max[2] - aabb.min[2],
  ] as const
  const centerRaw = [
    (aabb.min[0] + aabb.max[0]) / 2,
    (aabb.min[1] + aabb.max[1]) / 2,
    (aabb.min[2] + aabb.max[2]) / 2,
  ] as const
  console.log(
    `[import] world bbox: size=(${sizeRaw.map((v) => v.toFixed(2)).join(', ')}) center=(${centerRaw.map((v) => v.toFixed(2)).join(', ')})`,
  )

  // Determine which world axis is "up" by picking the longest dimension.
  // Sketchfab usually outputs Y-up after its FBX→glTF axis fix, but we
  // never assume — and we can't apply rotation cleanly via gltf-transform
  // anyway since `Scene.listChildren()` returns nodes that we'd need to
  // reparent, which is fiddly. Instead we only handle the Y-up case and
  // bail loudly if the source is Z- or X-up — the user can pre-rotate the
  // GLB in Blender/Sketchfab and re-export.
  const axes = ['X', 'Y', 'Z'] as const
  const tallestIdx = sizeRaw.indexOf(Math.max(...sizeRaw))
  const tallestAxis = axes[tallestIdx]
  const tallest = sizeRaw[tallestIdx]!
  console.log(`[import] tallest world axis: ${tallestAxis} (${tallest.toFixed(2)})`)
  if (tallestAxis !== 'Y') {
    throw new Error(
      `Source GLB is ${tallestAxis}-up; this importer only handles Y-up sources. Re-export with Y as the up axis.`,
    )
  }

  const scale = targetHeight / tallest

  // Wrap every scene-root node under a fresh `rocket-root` node so we can
  // set scale + Y offset in one place without touching the imported
  // hierarchy. This also gives consumers a single named anchor.
  const wrapper = doc.createNode('rocket-root')
  wrapper.setScale([scale, scale, scale])
  // After scaling, the new bbox center is centerRaw * scale. We want the
  // post-scale center at world Y=0, so the wrapper's Y translation is
  // -centerRaw.y * scale. X/Z left at 0 — the model is assumed roughly
  // centered laterally.
  wrapper.setTranslation([0, -centerRaw[1]! * scale, 0])

  for (const child of [...scene.listChildren()]) {
    scene.removeChild(child)
    wrapper.addChild(child)
  }
  scene.addChild(wrapper)

  const afterAabb = getBounds(scene)
  const afterSize = [
    afterAabb.max[0] - afterAabb.min[0],
    afterAabb.max[1] - afterAabb.min[1],
    afterAabb.max[2] - afterAabb.min[2],
  ]
  const afterCenterY = (afterAabb.min[1] + afterAabb.max[1]) / 2
  console.log(
    `[import] post-normalize bbox: size=(${afterSize.map((v) => v.toFixed(2)).join(', ')}) center.y=${afterCenterY.toFixed(2)}`,
  )

  console.log('[import] applying Draco compression…')
  await doc.transform(
    draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5 }),
  )
  const compressed = await io.writeBinary(doc)
  console.log(`[import] compressed: ${(compressed.byteLength / 1024 / 1024).toFixed(2)} MB`)

  mkdirSync(dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, compressed)
  console.log(`[import] wrote ${outputPath}`)
}

main().catch((err) => {
  console.error('[import] failed:', err)
  process.exitCode = 1
})

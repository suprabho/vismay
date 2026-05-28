/**
 * Diagnostic: report a GLB's structure — root size, node tree, mesh names,
 * material count, texture count, bounding box.
 *
 * Usage:
 *   pnpm tsx scripts/inspect-glb.ts /absolute/path/to/file.glb
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

async function main(): Promise<void> {
  const argPath = process.argv[2]
  if (!argPath) {
    console.error('Usage: pnpm tsx scripts/inspect-glb.ts <path-to-glb>')
    process.exit(1)
  }
  const path = resolve(argPath)
  if (!existsSync(path)) {
    console.error(`Not found: ${path}`)
    process.exit(1)
  }

  const { NodeIO } = await import('@gltf-transform/core')
  const { ALL_EXTENSIONS } = await import('@gltf-transform/extensions')
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  const doc = await io.read(path)
  const root = doc.getRoot()

  console.log(`File:        ${path}`)
  console.log(`Generator:   ${root.getAsset().generator ?? '?'}`)
  console.log(`glTF ver:    ${root.getAsset().version}`)
  console.log(`Scenes:      ${root.listScenes().length}`)
  console.log(`Nodes:       ${root.listNodes().length}`)
  console.log(`Meshes:      ${root.listMeshes().length}`)
  console.log(`Materials:   ${root.listMaterials().length}`)
  console.log(`Textures:    ${root.listTextures().length}`)
  console.log(`Animations:  ${root.listAnimations().length}`)

  console.log('\n── Node tree ──')
  function walkNode(
    node: import('@gltf-transform/core').Node,
    depth: number,
  ): void {
    const t = node.getTranslation()
    const s = node.getScale()
    const mesh = node.getMesh()
    const prims = mesh ? mesh.listPrimitives().length : 0
    const verts = mesh
      ? mesh
          .listPrimitives()
          .reduce((sum, p) => sum + (p.getAttribute('POSITION')?.getCount() ?? 0), 0)
      : 0
    const pad = '  '.repeat(depth)
    const meshTag = mesh ? ` [mesh '${mesh.getName() || '·'}' • ${prims} prim • ${verts} verts]` : ''
    console.log(
      `${pad}- ${node.getName() || '<unnamed>'} pos=(${t.map((v) => v.toFixed(2)).join(',')}) scale=(${s.map((v) => v.toFixed(2)).join(',')})${meshTag}`,
    )
    for (const child of node.listChildren()) walkNode(child, depth + 1)
  }
  for (const scene of root.listScenes()) {
    console.log(`Scene '${scene.getName() || '<unnamed>'}':`)
    for (const node of scene.listChildren()) walkNode(node, 1)
  }

  console.log('\n── Bounding box (world space, all meshes) ──')
  let mn: [number, number, number] = [Infinity, Infinity, Infinity]
  let mx: [number, number, number] = [-Infinity, -Infinity, -Infinity]
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const pos = prim.getAttribute('POSITION')
      if (!pos) continue
      const arr = pos.getArray()
      if (!arr) continue
      for (let i = 0; i < arr.length; i += 3) {
        for (let j = 0; j < 3; j++) {
          const v = arr[i + j]!
          if (v < mn[j]!) mn[j] = v
          if (v > mx[j]!) mx[j] = v
        }
      }
    }
  }
  const size = [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]]
  console.log(
    `min=(${mn.map((v) => v.toFixed(2)).join(',')})  max=(${mx.map((v) => v.toFixed(2)).join(',')})`,
  )
  console.log(`size=(${size.map((v) => v.toFixed(2)).join(',')}) — longest axis: ${['X', 'Y', 'Z'][size.indexOf(Math.max(...size))]}`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

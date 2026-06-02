/**
 * Diagnostic: report each source STL's bounding box and vertex count.
 *
 * Run with `pnpm tsx scripts/inspect-source-stls.ts` to find out:
 *   - Whether each part is authored on a common reference frame (e.g.
 *     stacked along a vertical axis) or each centered on its own origin.
 *   - Which axis is "up" in the source file.
 *   - Relative sizes — useful for sanity-checking the merged GLB.
 *
 * No JSDOM polyfill needed because STLLoader only reads geometry.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PKG_ROOT = resolve(__dirname, '..')
const SOURCE_DIR = resolve(PKG_ROOT, 'assets/source')

const FILES: { name: string; file: string }[] = [
  { name: 'cone',   file: 'ss_cone_black_x1.stl' },
  { name: 'tank',   file: 'ss_tank_black_x1.stl' },
  { name: 'raptor', file: 'ss_raptor_black_x1.stl' },
]

async function main(): Promise<void> {
  const THREE = await import('three')
  const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')

  console.log('part      | vertices |   x range          |   y range          |   z range          | size (x,y,z)')
  console.log('----------+----------+--------------------+--------------------+--------------------+----------------------')

  for (const { name, file } of FILES) {
    const path = resolve(SOURCE_DIR, file)
    if (!existsSync(path)) {
      console.log(`${name.padEnd(9)} | MISSING: ${path}`)
      continue
    }
    const buf = readFileSync(path)
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    const geometry = new STLLoader().parse(ab)
    geometry.computeBoundingBox()
    const b = geometry.boundingBox!
    const size = new THREE.Vector3()
    b.getSize(size)
    const fmt = (v: number) => v.toFixed(2).padStart(8)
    const range = (lo: number, hi: number) => `${fmt(lo)} → ${fmt(hi)}`
    console.log(
      `${name.padEnd(9)} | ${String(geometry.attributes.position.count).padStart(8)} | ${range(b.min.x, b.max.x)} | ${range(b.min.y, b.max.y)} | ${range(b.min.z, b.max.z)} | (${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`,
    )
  }

  console.log('')
  console.log('What this tells us:')
  console.log('  - If all three parts have similar y ranges (e.g. all starting near 0), they share an origin')
  console.log('    and the conversion script needs to STACK them, not just translate XZ.')
  console.log('  - If y ranges are disjoint (cone high, tank middle, raptor low), they already stack and')
  console.log('    we only need to translate XZ midpoints (current behavior).')
  console.log('  - The longest dimension tells us which axis is "up" in the source frame.')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})

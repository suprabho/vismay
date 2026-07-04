/** Throwaway check: section reorder = a config array move + a positional
 *  remap of the map/tts/report sidecars.
 *  (run: npx tsx src/storyReorder.test.ts) */
import { parse as parseYaml } from 'yaml'
import {
  moveStorySection,
  sectionMoveIndexMap,
  remapMapOverrides,
  remapTtsUnits,
  remapReportPages,
} from './storyReorder'

let failures = 0
const ok = (label: string, pass: boolean, extra = '') => {
  if (!pass) failures++
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)
}

/* ─── moveStorySection · YAML ───────────────────────────────────── */

const YAML_CONFIG = `title: Test story
defaults:
  theme: dark

sections:
  # hero banner comment
  - id: hero
    text: Hero
    kind: hero

  - id: middle
    text: Middle
    foreground:
      - type: bigStat
        value: "42"

  - id: finale
    text: Finale
`

const idsOf = (yaml: string): string[] =>
  ((parseYaml(yaml) as { sections: Array<{ id: string }> }).sections ?? []).map((s) => s.id)

{
  const moved = moveStorySection(YAML_CONFIG, 0, 2, 'yaml')
  ok('yaml: move first → last reorders ids', idsOf(moved).join(',') === 'middle,finale,hero')
  ok('yaml: comment travels with its section', /# hero banner comment\n  - id: hero/.test(moved))
  ok('yaml: defaults block untouched', moved.startsWith('title: Test story\ndefaults:\n  theme: dark'))
  const back = moveStorySection(moved, 2, 0, 'yaml')
  ok('yaml: moving back restores order', idsOf(back).join(',') === 'hero,middle,finale')
}
{
  const moved = moveStorySection(YAML_CONFIG, 2, 0, 'yaml')
  ok('yaml: move last → first', idsOf(moved).join(',') === 'finale,hero,middle')
  ok('yaml: nested keys survive the move', /foreground:\n      - type: bigStat/.test(moved))
}
ok('yaml: no-op move returns input verbatim', moveStorySection(YAML_CONFIG, 1, 1, 'yaml') === YAML_CONFIG)
ok('yaml: destination clamps into range', idsOf(moveStorySection(YAML_CONFIG, 0, 99, 'yaml')).join(',') === 'middle,finale,hero')
{
  let threw = false
  try {
    moveStorySection(YAML_CONFIG, 5, 0, 'yaml')
  } catch {
    threw = true
  }
  ok('yaml: out-of-range source throws', threw)
}
{
  // Anchors: moving the section that DEFINES `&pins` below the one that
  // references it would corrupt the doc — the guard must refuse.
  const anchored = `sections:
  - id: first
    text: First
    map:
      pins: &pins
        - lat: 1
          lng: 2

  - id: second
    text: Second
    map:
      pins: *pins
`
  let threw = false
  try {
    moveStorySection(anchored, 0, 1, 'yaml')
  } catch (e) {
    threw = /anchor/.test(e instanceof Error ? e.message : '')
  }
  ok('yaml: anchor-breaking move refused', threw)
  // …but a move that keeps the anchor before its alias goes through.
  const withThird = anchored + '\n  - id: third\n    text: Third\n'
  ok(
    'yaml: anchor-safe move allowed',
    idsOf(moveStorySection(withThird, 2, 1, 'yaml')).join(',') === 'first,third,second',
  )
}

/* ─── moveStorySection · JSON ───────────────────────────────────── */

const JSON_CONFIG = JSON.stringify(
  {
    defaults: { theme: 'dark' },
    sections: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  },
  null,
  2,
)
{
  const moved = moveStorySection(JSON_CONFIG, 2, 0, 'json')
  const ids = (JSON.parse(moved) as { sections: Array<{ id: string }> }).sections.map((s) => s.id)
  ok('json: move last → first', ids.join(',') === 'c,a,b')
}

/* ─── sectionMoveIndexMap ───────────────────────────────────────── */

ok('indexMap: forward move 0→2', sectionMoveIndexMap(4, 0, 2).join(',') === '2,0,1,3')
ok('indexMap: backward move 3→1', sectionMoveIndexMap(4, 3, 1).join(',') === '0,2,3,1')
ok('indexMap: no-op move is identity', sectionMoveIndexMap(3, 1, 1).join(',') === '0,1,2')
ok(
  'indexMap: append-then-insert (count+1, last → 1)',
  sectionMoveIndexMap(4, 3, 1).join(',') === '0,2,3,1',
)

/* ─── sidecar remaps ────────────────────────────────────────────── */

const MOVE_0_TO_2 = sectionMoveIndexMap(3, 0, 2) // [2, 0, 1]

{
  const mapYaml = `overrides:
  - target: { parentIndex: 0, subIndex: 0 }
    map: { zoom: 4 }
  - target: { parentIndex: 2 }
    map: { zoom: 9 }
`
  const out = remapMapOverrides(mapYaml, MOVE_0_TO_2)
  const doc = parseYaml(out!) as { overrides: Array<{ target: { parentIndex: number } }> }
  ok('map: parentIndexes follow the move', doc.overrides.map((o) => o.target.parentIndex).join(',') === '2,1')
}
{
  const ttsYaml = `units:
  - unit: { parentIndex: 1, subIndex: 0, sliceIndex: 0 }
    script: "hello"
`
  const out = remapTtsUnits(ttsYaml, MOVE_0_TO_2)
  const doc = parseYaml(out!) as { units: Array<{ unit: { parentIndex: number }; script: string }> }
  ok('tts: parentIndex follows the move', doc.units[0]!.unit.parentIndex === 0)
  ok('tts: script preserved', doc.units[0]!.script === 'hello')
}
{
  const reportYaml = `slides:
  pages:
    - unit: { parentIndex: 0, subIndex: 0 }
      title: override
report:
  pages:
    - unit: { parentIndex: 2, subIndex: 0 }
`
  const out = remapReportPages(reportYaml, MOVE_0_TO_2)
  const doc = parseYaml(out!) as {
    slides: { pages: Array<{ unit: { parentIndex: number } }> }
    report: { pages: Array<{ unit: { parentIndex: number } }> }
  }
  ok('report: slides page remapped', doc.slides.pages[0]!.unit.parentIndex === 2)
  ok('report: report page remapped', doc.report.pages[0]!.unit.parentIndex === 1)
}

ok('sidecar: untouched file returns null', remapMapOverrides('overrides: []\n', MOVE_0_TO_2) === null)
ok('sidecar: null input returns null', remapTtsUnits(null, MOVE_0_TO_2) === null)
ok('sidecar: invalid yaml returns null', remapMapOverrides('overrides: [::', MOVE_0_TO_2) === null)
{
  const stale = `overrides:
  - target: { parentIndex: 9 }
`
  ok('sidecar: out-of-range ref left alone (null = no change)', remapMapOverrides(stale, MOVE_0_TO_2) === null)
}

if (failures) {
  console.error(`\n${failures} failure(s)`)
  process.exit(1)
}
console.log('\nall passed')

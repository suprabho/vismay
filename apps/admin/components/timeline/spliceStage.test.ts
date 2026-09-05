/**
 * Self-checking test for the W3 generalized splice — run from apps/admin:
 *   npx tsx components/timeline/spliceStage.test.ts
 * (Same standalone-script idiom as packages/viz-engine's *.test.ts files;
 * this file has no runtime viz-engine imports, so plain tsx works.)
 */
import { parse as parseYaml } from 'yaml'
import type { StageConfig } from '@vismay/viz-engine'
import { spliceStageIntoConfig } from './spliceStage'

let failures = 0
function check(name: string, cond: boolean) {
  console.log(`${cond ? '✓' : '✗'} ${name}`)
  if (!cond) failures++
}

const FIXTURE = `# top-of-file banner comment
title: fixture
defaults:
  mapStyle: dark
  # ── stage block ──
  stage:
    entities:
      # entity A — the survivor
      - id: alpha
        role: subject
        content: { type: image, src: /a.svg, size: 0.2 }
        keyframes:
          # alpha's first keyframe
          - at: { section: one }
            transform: { position: { x: 0.1, y: 0.2 }, scale: 1 }
          - at: { section: two }
            transform: { position: { x: 0.3, y: 0.4 } }
      # entity B — dense internal comments
      - id: beta
        role: object
        content: { type: image, src: /b.svg, size: 0.5 }
        keyframes:
          # beta's only keyframe
          - at: { section: one }
            transform: { position: { x: -0.5, y: 0 }, opacity: 0.5 }
      # entity C — to be removed
      - id: gamma
        role: object
        content: { type: image, src: /c.svg }
        keyframes:
          - at: { section: two }
            transform: { position: { x: 0.9, y: 0.9 } }
sections:
  - id: one
  - id: two
`

const stageOf = (text: string): StageConfig =>
  (parseYaml(text) as { defaults: { stage: StageConfig } }).defaults.stage

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

// 1. No-op splice → byte-identical.
{
  const base = stageOf(FIXTURE)
  const out = spliceStageIntoConfig(FIXTURE, base, clone(base))
  check('no-op splice is byte-identical', out === FIXTURE)
}

// 2. One-field keyframe edit → same line count, exactly one changed line,
//    comments intact.
{
  const base = stageOf(FIXTURE)
  const edited = clone(base)
  edited.entities[0].keyframes[1].transform.position!.x = 0.77
  const out = spliceStageIntoConfig(FIXTURE, base, edited)
  const a = FIXTURE.split('\n')
  const b = out.split('\n')
  const changed = a.filter((l, i) => l !== b[i]).length
  check('one-field edit: same line count', a.length === b.length)
  check('one-field edit: exactly one changed line', changed === 1)
  check('one-field edit: comments intact', out.includes("alpha's first keyframe") && out.includes('banner comment'))
  check('one-field edit: round-trips', stageOf(out).entities[0].keyframes[1].transform.position!.x === 0.77)
}

// 3. Keyframe ADDED to beta → alpha's block untouched (comments included),
//    round-trip deep-equals; beta's internal comment lost (documented cost).
{
  const base = stageOf(FIXTURE)
  const edited = clone(base)
  edited.entities[1].keyframes.push({
    at: { section: 'two' },
    transform: { position: { x: 0, y: 0 } },
  })
  const out = spliceStageIntoConfig(FIXTURE, base, edited)
  check('kf-add: alpha comments intact', out.includes("alpha's first keyframe") && out.includes('entity A — the survivor'))
  check('kf-add: round-trips deep-equal', JSON.stringify(stageOf(out)) === JSON.stringify(edited))
  check('kf-add: flow idiom in replaced entity', /- at: \{ section: two \}/.test(out.split('beta')[1] ?? ''))
  check("kf-add: beta's internal comment dropped (documented)", !out.includes("beta's only keyframe"))
}

// 4. Two entities removed (non-adjacent: alpha + gamma) → beta survives with
//    its comments; descending-index deletion correctness.
{
  const base = stageOf(FIXTURE)
  const edited = clone(base)
  edited.entities = [edited.entities[1]]
  const out = spliceStageIntoConfig(FIXTURE, base, edited)
  const result = stageOf(out)
  check('removals: only beta remains', result.entities.length === 1 && result.entities[0].id === 'beta')
  check('removals: beta comments intact', out.includes("beta's only keyframe") && out.includes('dense internal comments'))
  check('removals: round-trips deep-equal', JSON.stringify(result) === JSON.stringify(edited))
}

// 5. Entity added → appended last; unrelated comments intact.
{
  const base = stageOf(FIXTURE)
  const edited = clone(base)
  edited.entities.push({
    id: 'delta',
    role: 'subject',
    content: { type: 'image', src: 'assets://fixture/delta.png' },
    keyframes: [{ at: { section: 'one' }, transform: { position: { x: 0, y: 0 } } }],
  })
  const out = spliceStageIntoConfig(FIXTURE, base, edited)
  const result = stageOf(out)
  check('addition: appended last', result.entities[result.entities.length - 1].id === 'delta')
  check('addition: round-trips deep-equal', JSON.stringify(result) === JSON.stringify(edited))
  check('addition: comments intact', out.includes("alpha's first keyframe") && out.includes("beta's only keyframe"))
}

// 6. content.size change → whole-entity replace path; the entity's OWN
//    commentBefore survives, internal kf comment drops.
{
  const base = stageOf(FIXTURE)
  const edited = clone(base)
  edited.entities[1].content.size = 0.8
  const out = spliceStageIntoConfig(FIXTURE, base, edited)
  check('content edit: entity commentBefore carried', out.includes('entity B — dense internal comments'))
  check('content edit: internal kf comment dropped (documented)', !out.includes("beta's only keyframe"))
  check('content edit: round-trips', (stageOf(out).entities[1].content as { size?: number }).size === 0.8)
}

// 7. First entity into a stage-less config → defaults.stage.entities created.
{
  const NO_STAGE = `title: bare\ndefaults:\n  mapStyle: dark\nsections:\n  - id: one\n`
  const edited: StageConfig = {
    entities: [
      {
        id: 'first',
        role: 'subject',
        content: { type: 'image', src: '/x.svg' },
        keyframes: [{ at: { section: 'one' }, transform: { position: { x: 0, y: 0 } } }],
      },
    ],
  }
  const out = spliceStageIntoConfig(NO_STAGE, null, edited)
  const parsed = parseYaml(out) as { defaults: { stage?: StageConfig; mapStyle?: string } }
  check('null-stage: entities created', parsed.defaults.stage?.entities[0]?.id === 'first')
  check('null-stage: siblings preserved', parsed.defaults.mapStyle === 'dark')
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)

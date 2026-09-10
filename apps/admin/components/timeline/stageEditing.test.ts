/**
 * Self-checking test for the stageEditing pure helpers — run from apps/admin:
 *   npx tsx components/timeline/stageEditing.test.ts
 */
import type { StageConfig } from '@vismay/viz-engine'
import {
  addEntity,
  addKeyframe,
  removeEntity,
  removeKeyframe,
  keyframeAddressForBeat,
  findBaselineKf,
  effectiveT,
  suggestEntityId,
  setEntityContent,
} from './stageEditing'
import { type TimelineColumn, buildAuthoredKeyframeIndex } from './timelineShape'

let failures = 0
function check(name: string, cond: boolean) {
  console.log(`${cond ? '✓' : '✗'} ${name}`)
  if (!cond) failures++
}

const columns: TimelineColumn[] = ['one', 'two', 'three'].map((id, i) => ({
  unit: i,
  parentIndex: i,
  subIndex: 0,
  sectionId: id,
  authoredSectionId: id,
  heading: id,
  clock: 'triggered',
  runway: undefined,
  timelineMs: undefined,
  isSectionStart: true,
}))

const stage: StageConfig = {
  entities: [
    {
      id: 'alpha',
      role: 'subject',
      content: { type: 'image', src: '/a.svg' },
      keyframes: [
        { at: { section: 'one', t: 0.2 }, transform: { position: { x: 0, y: 0 } } },
        { at: { section: 'one', t: 0.8 }, transform: { position: { x: 1, y: 0 } } },
        { at: { section: 'three' }, transform: { position: { x: 2, y: 0 } } },
      ],
    },
  ],
}
const index = buildAuthoredKeyframeIndex(stage, columns)

// — keyframeAddressForBeat —
check('no kf on beat → null', keyframeAddressForBeat(index, 'alpha', 1, 0.5) === null)
check('sole kf → it', keyframeAddressForBeat(index, 'alpha', 2, 0.5)?.kfIndex === 2)
check('nearest t: playhead 0.3 → t:0.2', keyframeAddressForBeat(index, 'alpha', 0, 0.3)?.kfIndex === 0)
check('nearest t: playhead 0.7 → t:0.8', keyframeAddressForBeat(index, 'alpha', 0, 0.7)?.kfIndex === 1)

// — effectiveT —
check('effectiveT explicit', effectiveT(stage.entities[0].keyframes[0], false) === 0.2)
check('effectiveT sole t-less → 1', effectiveT(stage.entities[0].keyframes[2], true) === 1)
check('effectiveT t-less among several → 0', effectiveT(stage.entities[0].keyframes[2], false) === 0)

// — addEntity —
{
  const next = addEntity(stage, {
    id: 'beta',
    role: 'object',
    assetRef: 'assets://s/b.png',
    beat: 1,
    columns,
  })
  const beta = next.entities[next.entities.length - 1]
  check('addEntity appends', beta.id === 'beta' && next.entities.length === 2)
  check('addEntity seeds exactly one keyframe', beta.keyframes.length === 1)
  check(
    'addEntity at uses authored-id selector',
    typeof beta.keyframes[0].at === 'object' && beta.keyframes[0].at.section === 'two'
  )
  check('addEntity from null stage', addEntity(null, { id: 'x', role: 'subject', assetRef: 'a', beat: 0, columns }).entities.length === 1)
  check('addEntity leaves input untouched', stage.entities.length === 1)
}

// — addKeyframe —
{
  const next = addKeyframe(stage, 'alpha', 1, columns, { position: { x: 5, y: 5 } })
  check('addKeyframe inserts', next !== null && next.entities[0].keyframes.length === 4)
  // beat-sorted: after the two beat-0 kfs, before the beat-2 kf.
  const at = next!.entities[0].keyframes[2].at
  check('addKeyframe beat-sorted insert', typeof at === 'object' && at.section === 'two')
  check('addKeyframe seeds transform copy', next!.entities[0].keyframes[2].transform.position?.x === 5)
  // t-less collision: beat 2 already holds a t-less kf.
  check('addKeyframe null on t-less collision', addKeyframe(stage, 'alpha', 2, columns) === null)
}

// — removeKeyframe —
{
  const next = removeKeyframe(stage, { entityId: 'alpha', kfIndex: 0 })
  check('removeKeyframe removes', next !== null && next.entities[0].keyframes.length === 2)
  const sole: StageConfig = {
    entities: [
      { id: 's', role: 'subject', content: { type: 'image', src: '/s.svg' }, keyframes: [stage.entities[0].keyframes[0]] },
    ],
  }
  check('removeKeyframe null on sole kf', removeKeyframe(sole, { entityId: 's', kfIndex: 0 }) === null)
}

// — removeEntity / setEntityContent —
check('removeEntity filters', removeEntity(stage, 'alpha').entities.length === 0)
check(
  'setEntityContent patches size',
  (setEntityContent(stage, 'alpha', { size: 0.4 }).entities[0].content as { size?: number }).size === 0.4
)

// — findBaselineKf —
{
  const kf = findBaselineKf(stage, 'alpha', { section: 'one', t: 0.8 })
  check('findBaselineKf matches by at identity', kf?.transform.position?.x === 1)
  check('findBaselineKf undefined for unknown at', findBaselineKf(stage, 'alpha', { section: 'two' }) === undefined)
  check('findBaselineKf null baseline', findBaselineKf(null, 'alpha', 0) === undefined)
}

// — suggestEntityId —
check('suggestEntityId slugifies', suggestEntityId('My Rocket 2.png', new Set()) === 'my-rocket-2')
check('suggestEntityId dedupes', suggestEntityId('a.png', new Set(['a', 'a-2'])) === 'a-3')
check('suggestEntityId empty → entity', suggestEntityId('...png', new Set()) === 'entity')

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`)
process.exit(failures === 0 ? 0 : 1)

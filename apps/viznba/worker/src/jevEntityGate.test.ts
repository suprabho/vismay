import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gateEntityTags, type DecideFn } from './jevEntityGate'
import type { ResolvedEntity } from './entityResolver'

const article = { headline: 'Lakers sign guard', body: 'The Lakers signed a guard.', publisher: 'ESPN' }

const candidates: ResolvedEntity[] = [
  { type: 'team', id: 'lal', name: 'Los Angeles Lakers', sourceName: 'Lakers' },
  { type: 'player', id: '1966', name: 'LeBron James', sourceName: 'LeBron' },
  { type: 'coach', id: '3024', name: 'JJ Redick', sourceName: 'Redick' },
]

const answering =
  (probs: number[]): DecideFn =>
  async ({ questions }) => ({
    answers: Object.fromEntries(
      Object.keys(questions).map((k, i) => [k, { type: 'boolean', probability: probs[i] }]),
    ),
  })

test('drops candidates below the threshold and records confidence', async () => {
  const out = await gateEntityTags(article, candidates, {
    decide: answering([0.95, 0.2, 0.6]),
    minConfidence: 0.55,
  })
  assert.deepEqual(
    out.map((e) => [e.id, e.confidence, e.kept]),
    [
      ['lal', 0.95, true],
      ['1966', 0.2, false],
      ['3024', 0.6, true],
    ],
  )
})

test('fails open when the judge throws', async () => {
  const out = await gateEntityTags(article, candidates, {
    decide: async () => {
      throw new Error('503')
    },
  })
  assert.ok(out.every((e) => e.kept && e.confidence === 1))
})

test('keeps a candidate whose answer is missing', async () => {
  const out = await gateEntityTags(article, candidates, {
    decide: async () => ({ answers: { e0: { type: 'boolean', probability: 0.1 } } }),
    minConfidence: 0.5,
  })
  assert.deepEqual(
    out.map((e) => e.kept),
    [false, true, true],
  )
})

test('no candidates means no call', async () => {
  let called = false
  const out = await gateEntityTags(article, [], {
    decide: async () => {
      called = true
      return { answers: {} }
    },
  })
  assert.deepEqual(out, [])
  assert.equal(called, false)
})

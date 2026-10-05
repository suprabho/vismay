/** Checks for the per-app brief: house palettes, posting targets, appended context.
 *  (run: npx tsx src/brief.test.ts) */
import assert from 'node:assert/strict'
import { HOUSE_PALETTES, htmlStoryBrief } from './brief'
import { themeMetaContent } from './meta'
import { draw } from '@vismay/randomizer/draw'
import type { SpinRecord } from '@vismay/randomizer/types'

// vizmaya: unchanged defaults.
const viz = htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi/' })
assert.ok(viz.startsWith('# Writing a vizmaya HTML story'))
assert.ok(viz.includes('https://vizmaya.fyi/s/<slug>'))
assert.ok(viz.includes(`content="${themeMetaContent(HOUSE_PALETTES['vizmaya-fyi'])}"`))
assert.ok(viz.includes('Byline "vizmaya desk"'))
assert.ok(viz.includes('POST https://vizmaya.fyi/api/html-stories?slug=<slug>'))
assert.ok(!viz.includes('Source material'))
assert.ok(!viz.includes('footshorts'))

// footshorts: its own look, chrome, byline, posting target, crest guidance.
const fs = htmlStoryBrief({ siteUrl: 'https://footshorts.com', app: 'footshorts' })
assert.ok(fs.startsWith('# Writing a Footshorts HTML story'))
assert.ok(fs.includes('https://footshorts.com/s/<slug>'))
assert.ok(fs.includes('slim Footshorts header'))
assert.ok(fs.includes(`content="${themeMetaContent(HOUSE_PALETTES.footshorts)}"`))
assert.ok(fs.includes('Forum for headlines'))
assert.ok(fs.includes('Byline "footshorts desk"'))
assert.ok(fs.includes('Crests: from the match context'))
assert.ok(fs.includes('`app: "footshorts"`'))
assert.ok(fs.includes('POST https://footshorts.com/api/html-stories?slug=<slug>'))
assert.ok(!fs.includes('vizmaya header'))
// Without a context, the content rules say so rather than pointing at one.
assert.ok(fs.includes('carries no match context'))
assert.ok(!fs.includes('Source material'))

// With a context: appended last, headings demoted under the brief's own.
const ctx = '# Match context — Arsenal 2 – 1 Chelsea (Premier League)\n\n## Arsenal 2 – 1 Chelsea\n\n### Match facts\n\n| Stat | A | C |\n'
const withCtx = htmlStoryBrief({ siteUrl: 'https://footshorts.com', app: 'footshorts', context: ctx })
assert.ok(withCtx.includes('# Source material'))
assert.ok(withCtx.indexOf('# Source material') > withCtx.indexOf('## Posting'))
assert.ok(withCtx.includes('\n## Match context — Arsenal 2 – 1 Chelsea (Premier League)\n'))
assert.ok(withCtx.includes('\n### Arsenal 2 – 1 Chelsea\n'))
assert.ok(withCtx.includes('\n#### Match facts\n'))
assert.ok(withCtx.includes('| Stat | A | C |'))
assert.ok(withCtx.includes('primary source'))
assert.ok(!withCtx.includes('carries no match context'))
// A random style replaces the house palette in the meta tag.
const styled = htmlStoryBrief({
  siteUrl: 'https://footshorts.com',
  app: 'footshorts',
  style: {
    palette: { background: '#FAF7F2', surface: '#FFFFFF', text: '#1B1A17', muted: '#6B675E', accent: '#C2410C', accent2: '#1B1A17', teal: '#2F855A' },
    fonts: { serif: 'Forum', sans: 'Space Grotesk', mono: 'Space Mono' },
    paletteFrom: { slug: 'terrace-story', title: 'Terrace' },
    fontsFrom: { slug: 'terrace-story', title: 'Terrace' },
  },
})
assert.ok(styled.includes('A light page. Background `#FAF7F2`'))
assert.ok(styled.includes('background:#FAF7F2;'))
assert.ok(!styled.includes('background:#0B0B0F'))

// A randomizer spin adds its sections around the generic ones, and ends with the research stub.
for (const randomizer of ['desk', 'atlas', 'epics'] as const) {
  const now = new Date('2026-10-05T12:00:00Z')
  const spin = {
    ...draw({ randomizer, seed: 99, now }),
    id: '00000000-0000-4000-8000-0000000000aa',
    seed: '00000063',
    status: 'spun',
    heroInsight: null,
    researchMd: null,
    createdAt: now.toISOString(),
  } as Pick<SpinRecord, 'id' | 'seed' | 'randomizer' | 'subject' | 'createdAt' | 'reels' | 'status' | 'heroInsight' | 'researchMd'>
  const b = htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi', spin })
  const at = (h: string) => b.indexOf(h)
  for (const h of ['## Your assignment', '## Research protocol', '## Deliverables', '## Format:', '## Reel script', '# Research stub']) {
    assert.ok(at(h) > 0, `${randomizer}: missing ${h}`)
  }
  assert.ok(at('## Your assignment') < at('## The hosting contract'))
  assert.ok(at('## Format:') < at('## The hosting contract'))
  assert.ok(at('## Reel script') > at('## Content') && at('## Reel script') < at('## Before you post'))
  assert.ok(at('# Research stub') > at('## Posting'))
  assert.ok(b.includes(`spinId: "${spin.id}"`))
  assert.ok(b.includes("the playbook's checklist"))
  assert.ok(b.includes('traces to a Verified row in your claims log'))
  assert.ok(!b.includes('Every number has a source. End with a "Sources & method"'))
  assert.equal(b.includes('saves a draft'), randomizer !== 'desk', `${randomizer}: gate note`)
}
// No spin: none of it.
assert.ok(!viz.includes('## Your assignment') && !viz.includes('Research stub'))

console.log('brief: ok')

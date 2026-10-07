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

// vizf1: its own look, chrome, byline, posting target, team-mark guidance.
const f1 = htmlStoryBrief({ siteUrl: 'https://www.vizf1.com', app: 'vizf1' })
assert.ok(f1.startsWith('# Writing a VizF1 HTML story'))
assert.ok(f1.includes('Formula 1 data story for VizF1'))
assert.ok(f1.includes('https://www.vizf1.com/s/<slug>'))
assert.ok(f1.includes('slim VizF1 header'))
assert.ok(f1.includes(`content="${themeMetaContent(HOUSE_PALETTES.vizf1)}"`))
assert.ok(f1.includes('Saira for headlines') && f1.includes('Martian Mono'))
assert.ok(f1.includes('soft `#E8002D`'))
assert.ok(f1.includes('Byline "VizF1 desk"'))
assert.ok(f1.includes('Team marks and headshots: from the race context'))
assert.ok(f1.includes('## Icons, team marks and flags'))
assert.ok(f1.includes('`app: "vizf1"`'))
assert.ok(f1.includes('POST https://www.vizf1.com/api/html-stories?slug=<slug>'))
assert.ok(f1.includes('F1 photos') && !f1.includes('Football photos'))
assert.ok(f1.includes('carries no race context'))
assert.ok(!f1.includes('match context') && !f1.includes('vizmaya header') && !f1.includes('Footshorts'))
const f1Ctx = htmlStoryBrief({
  siteUrl: 'https://www.vizf1.com',
  app: 'vizf1',
  context: '# Race context: VER, NOR across 2 sessions\n\n## Head-to-head across the picked sessions\n',
})
assert.ok(f1Ctx.includes('Everything below comes from the VizF1 timing and telemetry tables.'))
assert.ok(f1Ctx.includes('\n## Race context: VER, NOR across 2 sessions\n'))
assert.ok(f1Ctx.includes('**The race context at the end of this brief is your primary source.**'))
assert.ok(f1Ctx.includes('never compare a lap time at one circuit'))

// Photography: asked for on both sites, hosted through each site's own assets endpoint.
for (const [b, site] of [[viz, 'https://vizmaya.fyi'], [fs, 'https://footshorts.com'], [f1, 'https://www.vizf1.com']] as const) {
  assert.ok(b.includes('## Photography and media'))
  assert.ok(b.indexOf('## Photography and media') > b.indexOf('## Icons') && b.indexOf('## Photography and media') < b.indexOf('## Charts'))
  assert.ok(b.includes(`POST ${site}/api/html-stories/assets?slug=<slug>`))
  assert.ok(b.includes('`save_story_image`') && b.includes('`generate_story_image`'))
  assert.ok(b.includes('every two or three screens'))
  assert.ok(b.includes('no alt text or no credit line'))
}
assert.ok(fs.includes('Football photos') && !viz.includes('Football photos'))
assert.ok(htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi', format: 'book' }).includes('every two or three pages'))

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
// Maps: Mapbox scrollytelling only with a public token; MapLibre otherwise.
const pk = 'pk.eyJ1IjoidGVzdCJ9.test'
for (const app of ['vizmaya-fyi', 'footshorts'] as const) {
  const m = htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi', app, mapboxToken: pk })
  assert.ok(m.includes('## Maps: Mapbox scrollytelling'), `${app}: maps section`)
  assert.ok(m.includes(`mapboxgl.accessToken = '${pk}'`))
  assert.ok(m.includes('access_token=' + pk))
  assert.ok(m.indexOf('## Maps') > m.indexOf('## Charts') && m.indexOf('## Maps') < m.indexOf('## Content'))
  assert.ok(m.includes('the sticky graphic is a map'))
  assert.ok(!m.includes("Don't use Mapbox"))
}
for (const mapboxToken of [null, '', 'sk.secret-token', 'not-a-token']) {
  const m = htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi', mapboxToken })
  assert.ok(!m.includes('## Maps'), `no maps for ${mapboxToken}`)
  assert.ok(!m.includes('sk.secret-token'))
  assert.ok(m.includes("Don't use Mapbox") && m.includes('MapLibre GL'))
}

// No spin: none of it.
assert.ok(!viz.includes('## Your assignment') && !viz.includes('Research stub'))

// Story formats. The default (and an explicit 'scroll') is the scroll brief.
assert.equal(htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi/', format: 'scroll' }), viz)
assert.ok(viz.includes('## Motion and scroll animation') && !viz.includes('## Story format'))
const runtimes = { book: 'https://vizmaya.fyi/formats/book@1', board: 'https://vizmaya.fyi/formats/board@1', deck: 'https://vizmaya.fyi/formats/deck@1' }
for (const format of ['book', 'board', 'deck'] as const) {
  // From a preview deployment, with a Mapbox token: neither leaks into a paged brief.
  const b = htmlStoryBrief({ siteUrl: 'https://vizmaya-git-x.vercel.app', format, mapboxToken: pk })
  const at = (h: string) => b.indexOf(h)
  assert.ok(at('## Story format:') > at('## Icons and flags') && at('## Story format:') < at('## Charts'), `${format}: section order`)
  // The scroll format's sections give way to the format's own.
  assert.ok(!b.includes('## Motion and scroll animation') && !b.includes('## Maps') && !b.includes('mapboxgl'), `${format}: no scroll sections`)
  assert.ok(!b.includes('data-step'), `${format}: no data-step`)
  // The hosting contract asks for the format tag; the runtime is always the production site's.
  assert.ok(b.includes(`<meta name="vizmaya:format" content="${format}">`))
  assert.ok(b.includes(`${runtimes[format]}.css`) && b.includes(`${runtimes[format]}.js`))
  assert.ok(!b.includes('vercel.app/formats'))
  assert.ok(b.includes('POST https://vizmaya-git-x.vercel.app/api/html-stories?slug=<slug>'))
  assert.ok(b.includes(`https://vizmaya.fyi/formats/examples/odyssey-${format}.html`))
  assert.ok(b.includes('### Charts and numbers: animate on enter') && b.includes('Story.charts.'))
  assert.ok(b.includes('data-unit'))
  assert.ok(b.includes('## Before you post') && b.indexOf('## Before you post') < at('## Posting'))
}
assert.ok(htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi', format: 'book' }).includes('One idea per page.'))

// The recap (vizf1): the replay, cues, its own example; no scroll sections, no maps of its own.
{
  const r = htmlStoryBrief({ app: 'vizf1', siteUrl: 'https://vizf1.com', format: 'recap' })
  assert.ok(r.includes('## Story format: a race recap') && r.includes('This story is a race recap'))
  assert.ok(r.includes('<meta name="vizmaya:format" content="recap">'))
  assert.ok(r.includes('https://www.vizf1.com/formats/recap@1.css') && r.includes('https://www.vizf1.com/formats/recap@1.js'))
  assert.ok(r.includes('https://www.vizf1.com/formats/examples/austria-2024-recap.html'))
  assert.ok(r.includes('data-session') && r.includes('data-lap') && r.includes('data-at') && r.includes('data-cam') && r.includes('data-focus'))
  assert.ok(r.includes('Replay moments'))
  assert.ok(!r.includes('## Motion and scroll animation') && !r.includes('mapboxgl'))
  assert.ok(r.includes("The 3D replay is the race's map"))
  assert.ok(!/\\`/.test(r), 'no double-escaped backticks')
}
assert.ok(htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi', format: 'deck' }).includes('One idea per slide.'))
assert.ok(htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi', format: 'board' }).includes('data-pin-to'))
// footshorts runtimes come from footshorts.com.
const fsBook = htmlStoryBrief({ siteUrl: 'https://footshorts.com', app: 'footshorts', format: 'book' })
assert.ok(fsBook.includes('https://footshorts.com/formats/book@1.js') && !fsBook.includes('vizmaya.fyi'))

// A spin brief suggests the paged format its kind of story suits, unless it already is one.
{
  const now = new Date('2026-10-05T12:00:00Z')
  const spin = {
    ...draw({ randomizer: 'epics', seed: 7, now }),
    id: '00000000-0000-4000-8000-0000000000ab',
    seed: '00000007',
    status: 'spun',
    heroInsight: null,
    researchMd: null,
    createdAt: now.toISOString(),
  } as Pick<SpinRecord, 'id' | 'seed' | 'randomizer' | 'subject' | 'createdAt' | 'reels' | 'status' | 'heroInsight' | 'researchMd'>
  const scroll = htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi', spin })
  assert.ok(scroll.includes('## Story format\n') && scroll.includes('format=book'))
  assert.ok(scroll.indexOf('## Story format\n') < scroll.indexOf('## The hosting contract'))
  const book = htmlStoryBrief({ siteUrl: 'https://vizmaya.fyi', spin, format: 'book' })
  assert.ok(!book.includes('## Story format\n') && book.includes('## Story format: a book'))
  assert.ok(book.indexOf('## Format:') < book.indexOf('## Story format: a book'))
}

console.log('brief: ok')

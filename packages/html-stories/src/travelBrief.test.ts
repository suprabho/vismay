/** Checks for the travel brief and its trip context.
 *  (run: npx tsx src/travelBrief.test.ts) */
import assert from 'node:assert/strict'
import { buildTripData } from '@vismay/content-source/travelTrips'
import { HOUSE_PALETTES, htmlStoryBrief } from './brief'
import { themeMetaContent } from './meta'
import { buildTripContext, travelHtmlStoryBrief, tripMediaUrl } from './travelBrief'

// The house brief: private chrome, the paper palette, the trip tag in the contract.
const brief = htmlStoryBrief({ siteUrl: 'https://protrip.vismay.xyz/', app: 'travel', mapboxToken: null })
assert.ok(brief.startsWith('# Writing a Trips HTML story'))
assert.ok(brief.includes('https://protrip.vismay.xyz/s/<slug>'))
assert.ok(brief.includes("only people with the trip's password"))
assert.ok(brief.includes(`content="${themeMetaContent(HOUSE_PALETTES.travel)}"`))
assert.ok(brief.includes('<meta name="travel:trip" content="<trip slug>">'))
assert.ok(brief.includes('Lora for headlines'))
assert.ok(brief.includes("the travellers' own photos"))
assert.ok(brief.includes('`app: "travel"`'))
assert.ok(brief.includes('new-york-2026-day-3'))
assert.ok(!brief.includes('Sources & method" section of links'))
assert.ok(brief.includes('carries no trip context'))
assert.ok(!/\\`/.test(brief), 'no double-escaped backticks')

// The trip context: one day, its stops in order, photo URLs on the public bucket.
const trip = buildTripData('new-york-2026', {
  city: 'New York',
  startDate: '2026-03-12',
  endDate: '2026-03-15',
  airports: [{ name: 'JFK', code: 'JFK', coordinates: [-73.78, 40.64], kind: 'departure', day: 4 }],
  days: [
    { n: 2, heading: 'Day 2', color: '#2c6bc9', stops: [{ slug: 'flatiron', name: 'Flatiron', time: '1:00 PM', coordinates: [-73.99, 40.74] }] },
    {
      n: 3,
      heading: 'Day 3: Brooklyn to the Park',
      color: '#2ca068',
      notes: 'Long day',
      stops: [
        { slug: 'dumbo', name: 'DUMBO Piers', time: '7:55 AM', desc: 'The skyline', coordinates: [-73.9956, 40.703] },
        { slug: 'katzs', name: "Katz's", time: '8:45 AM', coordinates: [-73.9874, 40.7223] },
      ],
    },
  ],
})
trip.days[1]!.stops[0]!.media.push(
  { file: 'd3-dumbo-01.jpg', ref: 'assets://new-york-2026/d3-dumbo-01.jpg', kind: 'image', caption: 'The bridge' },
  { file: 'd3-dumbo-02.mp4', ref: 'assets://new-york-2026/d3-dumbo-02.mp4', kind: 'video' },
)
const base = 'https://example.supabase.co/'
assert.equal(
  tripMediaUrl('assets://new-york-2026/a.jpg', base),
  'https://example.supabase.co/storage/v1/object/public/story-assets/new-york-2026/a.jpg',
)
process.env.NEXT_PUBLIC_SUPABASE_URL = base
const ctx = buildTripContext(trip, { day: 3, prompt: 'We took the F, not the bridge.' })
assert.ok(ctx.startsWith('# Trip context: day 3 of New York'))
assert.ok(ctx.includes("**The editor's notes:** We took the F, not the bridge."))
assert.ok(ctx.includes('Trip slug: `new-york-2026`'))
assert.ok(ctx.includes('### 1. DUMBO Piers (7:55 AM)') && ctx.includes("### 2. Katz's (8:45 AM)"))
assert.ok(ctx.includes('Photo: https://example.supabase.co/storage/v1/object/public/story-assets/new-york-2026/d3-dumbo-01.jpg — The bridge'))
assert.ok(ctx.includes('Video: https://example.supabase.co/storage/v1/object/public/story-assets/new-york-2026/d3-dumbo-02.mp4'))
assert.ok(ctx.includes('- No photos.'))
assert.ok(!ctx.includes('Flatiron') && !ctx.includes('JFK'), 'other days stay out')
assert.ok(buildTripContext(trip).includes('Flatiron') && buildTripContext(trip).includes('Depart JFK'))

// The whole brief, with a loader standing in for the database.
void (async () => {
  const loadTrip = async (slug: string) => (slug === 'new-york-2026' ? trip : null)
  const withCtx = await travelHtmlStoryBrief({ siteUrl: 'https://protrip.vismay.xyz', tripSlug: 'new-york-2026', day: 3, loadTrip })
  assert.ok(withCtx.includes('# Source material') && withCtx.includes('trip itinerary and photo library'))
  assert.ok(withCtx.includes('## Trip context: day 3 of New York'), 'context headings demoted under the brief')
  assert.ok(withCtx.includes('is your primary source'))
  await assert.rejects(travelHtmlStoryBrief({ siteUrl: 'https://x', tripSlug: 'paris-2027', loadTrip }), /no itinerary/)
  await assert.rejects(travelHtmlStoryBrief({ siteUrl: 'https://x', tripSlug: 'new-york-2026', day: 9, loadTrip }), /no day 9/)
  await assert.rejects(travelHtmlStoryBrief({ siteUrl: 'https://x', tripSlug: '../x', loadTrip }), /not a trip slug/)

  console.log('travelBrief: ok')
})()

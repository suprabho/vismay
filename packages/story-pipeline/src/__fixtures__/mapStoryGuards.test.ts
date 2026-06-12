/** Throwaway check: the map-story enforcement layer — narrowed visual schema,
 *  hero completion, chart-by-id, and the outline cold-open lint.
 *  (run: npx tsx src/__fixtures__/mapStoryGuards.test.ts) */
import { appendStorySection } from '@vismay/content-source/storySection'
import { sectionVisualSchemaFor, MAP_SECTION_KINDS } from '../schema'
import { normalizeSectionBody } from '../vizEngine'
import { completeMapHero, completeMapHeroProse } from '../mapHero'
import { lintOutline } from '../lintLayout'
import type { StoryOutline } from '../types'

const ok = (label: string, pass: boolean, extra = '') =>
  console.log(`${pass ? '✓' : '✗'} ${label}${extra ? `  ${extra}` : ''}`)

// ── kinds: cover is gone from the map menu ──────────────────────────────────
ok('map kinds are text|hero|stat', MAP_SECTION_KINDS.join('|') === 'text|hero|stat')

// ── narrowed visual schema ──────────────────────────────────────────────────
const heroSchema = sectionVisualSchemaFor('map', 'hero')
const textSchema = sectionVisualSchemaFor('map', 'text')

// A hero body without an eyebrow fails — the establishing shot must carry it.
const noEyebrow = heroSchema.safeParse({ body: { map: { center: [76, 34.4], zoom: 5.6 } } })
ok('hero without eyebrow rejected', !noEyebrow.success)

const hero = heroSchema.safeParse({
  body: { map: { center: [76, 34.4], zoom: 5.6 }, eyebrow: 'J&K · 1941–1951 · Census' },
})
ok('hero with eyebrow parses', hero.success)

// A deck panel (layout + regions) is unrepresentable: zod strips the unknown
// keys, so nothing survives for normalizeForeground to emit.
const deckPanel = textSchema.safeParse({
  body: {
    map: { center: [57, 25.5], zoom: 3.8 },
    foreground: {
      layout: 'stat-left-chart-right',
      regions: [{ name: 'stat', layers: [{ type: 'bigStat', value: '20%' }] }],
    },
  },
})
const panelBody = deckPanel.success
  ? normalizeSectionBody(deckPanel.data.body as never)
  : null
ok('deck panel stripped from map body', !!panelBody && !('foreground' in panelBody))

// The sanctioned exception — a lone bigStat — survives.
const loneStat = textSchema.safeParse({
  body: {
    map: { center: [57, 25.5], zoom: 3.8 },
    foreground: { layers: [{ type: 'bigStat', value: '20%', label: 'of global flows' }] },
  },
})
const loneBody = loneStat.success ? normalizeSectionBody(loneStat.data.body as never) : null
ok('lone bigStat survives', !!loneBody && !!loneBody.foreground)

// Two stats do not.
const twoStats = textSchema.safeParse({
  body: {
    map: { center: [57, 25.5], zoom: 3.8 },
    foreground: {
      layers: [
        { type: 'bigStat', value: '20%' },
        { type: 'bigStat', value: '13' },
      ],
    },
  },
})
ok('two foreground layers rejected', !twoStats.success)

// A body with no map at all fails — a map section IS the map.
ok('map block required', !textSchema.safeParse({ body: {} }).success)

// ── completeMapHero ─────────────────────────────────────────────────────────
const bare = completeMapHero(
  { map: { center: [57.8, 24.3], zoom: 6.5 }, foreground: { type: 'bigStat', value: '3' } },
  { geo: { focus: 'the Gulf of Oman', center: [57.8, 24.3], zoom: 6.5 } },
)
const bareMap = bare.map as Record<string, unknown>
const barePins = bareMap.pins as Array<Record<string, unknown>>
ok('hero gains pitch', bareMap.pitch === 15)
ok('hero opacity dimmed', bareMap.opacity === 0.45)
ok('hero pin synthesized + pulsing', barePins?.length === 1 && barePins[0]?.pulse === true)
ok('hero foreground stripped', !('foreground' in bare))

const dressed = completeMapHero({
  map: {
    center: [76, 34.4],
    zoom: 5.6,
    pitch: 18,
    opacity: 0.5,
    pins: [{ coordinates: [74.797, 34.083], label: 'Srinagar', pulse: true }],
  },
})
const dressedMap = dressed.map as Record<string, unknown>
ok(
  'already-dressed hero untouched',
  dressedMap.pitch === 18 &&
    dressedMap.opacity === 0.5 &&
    (dressedMap.pins as unknown[]).length === 1,
)

// ── completeMapHeroProse: the italic-dek markdown convention ────────────────
const plain = completeMapHeroProse([
  'Early on June 10, 2026, a US aircraft fired into the engine room of the MT Settebello.',
])
ok('plain dek gains *italics*', plain.length === 1 && /^\*[^*].*\*$/.test(plain[0]!))

const already = completeMapHeroProse(['*Already an italic dek.*', 'A stray second paragraph.'])
ok(
  'existing italic dek untouched',
  already[0] === '*Already an italic dek.*' && already.length === 2,
)

// extractHeroBits (story-reader) reads `/^\*[^*]/` — the wrapped line must match.
ok('wrapped dek matches extractHeroBits', /^\*[^*]/.test(plain[0]!))

// ── hero markdown anchor is the document H1 ─────────────────────────────────
const heroFile = appendStorySection('', 'defaults: {}\n', {
  heading: 'Engine Room, Gulf of Oman',
  paragraphs: ['*Early on June 10, 2026, a strike killed three Indian seafarers.*'],
  kind: 'hero',
  body: { map: { center: [57.8, 24.3], zoom: 6.5 } },
})
ok('hero anchor is # H1', heroFile.markdown.startsWith('# Engine Room, Gulf of Oman\n'))
const statFile = appendStorySection(heroFile.markdown, heroFile.configYaml, {
  heading: '3',
  paragraphs: ['Killed aboard the MT Settebello.'],
  kind: 'stat',
  body: { map: { center: [57.8, 24.3], zoom: 8 } },
})
ok('non-hero anchor stays ## H2', statFile.markdown.includes('\n## 3\n'))

// ── outline lint: the cold-open rules ───────────────────────────────────────
const outline = (kinds: string[]): StoryOutline => ({
  format: 'map',
  title: 'T',
  subtitle: 'S',
  byline: 'B',
  charts: [],
  imagePrompts: [],
  sections: kinds.map((kind, i) => ({
    heading: `H${i}`,
    kind,
    intent: 'x',
    geo: { focus: 'place', center: [0, 0], zoom: 3 },
  })),
})
const badSecond = lintOutline(outline(['hero', 'text', 'text']))
ok(
  'second-section-not-stat flagged',
  badSecond.some((i) => i.message.includes('stat cold-open')),
)
const goodSecond = lintOutline(outline(['hero', 'stat', 'text']))
// ('stat' heading "H1" has no digit — the numeric-heading rule still fires; only
// the cold-open rule itself must be quiet here.)
ok(
  'hero+stat opening passes cold-open rule',
  !goodSecond.some((i) => i.message.includes('stat cold-open')),
)

/**
 * The research file a spin starts (playbook 0.2, 0.3, 4): reel results
 * pre-filled, the right template (editorial, geography or epic), an empty
 * claims log, and the HERO INSIGHT section everything public is written from.
 *
 * Pure, so admin can offer "Copy research stub" without a round trip.
 */

import { slugify } from './text'
import { RANDOMIZER_META, type AtlasSubject, type DeskSubject, type EpicsSubject, type SpinRecord } from './types'

export type StubSpin = Pick<SpinRecord, 'id' | 'seed' | 'randomizer' | 'subject' | 'createdAt' | 'reels'>

export const HERO_INSIGHT_HEADING = 'HERO INSIGHT'
const HERO_PLACEHOLDER = '_One sentence: the single most surprising finding you can defend._'

function primaryName(spin: Pick<SpinRecord, 'subject'>): string {
  const s = spin.subject
  if (s.randomizer === 'desk') return s.sub.name
  if (s.randomizer === 'atlas') return s.pair ? `${s.country.name} and ${s.pair.name}` : s.country.name
  return s.epic.title
}

/** `YYYY-MM-DD_<randomizer>_<primary-reel-value>.md` (playbook 0.2). */
export function researchFileName(spin: Pick<SpinRecord, 'subject' | 'createdAt' | 'randomizer'>): string {
  return `${spin.createdAt.slice(0, 10)}_${spin.randomizer}_${slugify(primaryName(spin))}.md`
}

function deskTemplate(s: DeskSubject): string[] {
  const window = s.freshness.days === null ? 'any date (Evergreen)' : `the ${s.freshness.window}`
  return [
    '## Why Now',
    '',
    `The three most recent developments for ${s.sub.name}, inside ${window}. The lens goes on the newest.`,
    s.freshness.name === 'Evergreen'
      ? ''
      : 'If nothing happened in that window, move to the next one (Breaking, then Developing, then Evergreen) and say so here.',
    '',
    '| # | Date | Development | Source |',
    '|---|------|-------------|--------|',
    '| 1 | | | |',
    '| 2 | | | |',
    '| 3 | | | |',
    '',
    '## Structural context',
    '',
    'How the segment works, in one paragraph. Where the money and the choke points sit.',
    '',
    `## Lens read: ${s.lens.name}`,
    '',
    `${s.lens.description} Applied to the newest development, not to the segment in general.`,
    '',
    '## Data pull',
    '',
    'At least 8 data points per series where possible, from primary sources.',
    '',
    '| Metric | Period | Value | Unit | Source |',
    '|--------|--------|-------|------|--------|',
    ...s.sub.key_metrics.map((m) => `| ${m} | | | | |`),
    '',
    `Start from: ${s.sub.primary_sources.join(', ')}.`,
    '',
    '## Counter-case',
    '',
    'The strongest argument against the thesis.',
  ].filter((l, i, a) => !(l === '' && a[i - 1] === ''))
}

function atlasTemplate(s: AtlasSubject): string[] {
  const countries = s.pair ? `${s.country.name} or ${s.pair.name}` : s.country.name
  return [
    '## Route table',
    '',
    `4 to 8 named places inside ${countries}, in story order, using the ${s.frame.name} frame. Status: Documented, Contested or Inferred.`,
    '',
    '| Order | Place | Modern country | Lat, Lon | Era | What happened or what is there | Source | Status |',
    '|-------|-------|----------------|----------|-----|--------------------------------|--------|--------|',
    ...[1, 2, 3, 4].map((n) => `| ${n} | | ${s.country.name} | | | | | |`),
    '',
    '## Numbers',
    '',
    'Population, migration flows, trade volumes, language speakers: census, UN, World Bank or national statistics.',
    '',
    '| Figure | Value | Year | Source |',
    '|--------|-------|------|--------|',
    '| | | | |',
    '',
    `## The shift (${s.lens.name})`,
    '',
    'What the culture looked like before and after the key movement or event.',
    '',
    '## Insider voice',
    '',
    `One primary or scholarly source from within ${s.country.name} or the community, not only outside commentary.`,
    '',
    '## Counter-narrative',
    '',
    'The version the country or group tells about itself, against the external one, if they differ.',
  ]
}

function epicsTemplate(s: EpicsSubject): string[] {
  const route = s.episode.places
  return [
    '## Passage',
    '',
    `${s.episode.name}. Edition and translation: ___. Line or verse numbers: ___.`,
    '',
    '## Route table',
    '',
    'Every place the episode names, in text order. Status: Verified, Claimed, Symbolic or Lost.',
    '',
    '| Order | Place | Modern country | Lat, Lon | Era | What happened or what is there | Text reference | Source | Status |',
    '|-------|-------|----------------|----------|-----|--------------------------------|----------------|--------|--------|',
    ...route.map(
      (p, i) =>
        `| ${i + 1} | ${p.name} | ${p.modern} | | | | ${p.text_ref ?? ''} | | ${p.status} (starting point, verify) |`,
    ),
    '',
    `## Who claims ${s.place.name}`,
    '',
    'Who first proposed the identification, when, on what evidence, and who disputes it.',
    '',
    '## What is there today',
    '',
    'What stands there now, who visits, and any heritage, tourism or political investment.',
    '',
    '## Meaning in the text',
    '',
    s.epic.types.includes('Philosophical and spiritual')
      ? 'Required: why this place appears at this point in the text, citing scholarship.'
      : 'Optional: what the place does for the story at this point.',
  ]
}

/** The research MD a spin starts from. */
export function researchStub(spin: StubSpin): string {
  const meta = RANDOMIZER_META[spin.randomizer]
  const s = spin.subject
  const reels = Object.entries(spin.reels).map(([key, r]) => {
    const label = meta.reels.find((d) => d.key === key)?.label ?? key
    return `- ${label}: ${r.value}${r.sub ? ` (${r.sub})` : ''}`
  })
  const template = s.randomizer === 'desk' ? deskTemplate(s) : s.randomizer === 'atlas' ? atlasTemplate(s) : epicsTemplate(s)
  return [
    `# ${primaryName(spin)}: ${meta.name} research`,
    '',
    `File: ${researchFileName(spin)}`,
    `Spin: ${spin.id} · seed ${spin.seed} · ${spin.createdAt.slice(0, 10)}`,
    '',
    ...reels,
    '',
    '> Build the claims log first. Any figure, date or causal claim needs two independent sources, or one primary source',
    '> (government statistic, filing, peer-reviewed paper, original text). Mark each claim Verified, Contested or',
    '> Unverified. Unverified claims never reach the page or the script.',
    '',
    ...template,
    '',
    '## Claims log',
    '',
    '| # | Claim | Number or date | Source URL | Source type | Confidence | Status |',
    '|---|-------|----------------|------------|-------------|------------|--------|',
    '| 1 | | | | | | Unverified |',
    '',
    '## Fact, interpretation, speculation',
    '',
    '### Fact',
    '',
    '### Interpretation',
    '',
    '### Speculation',
    '',
    '## Gaps',
    '',
    'What I could not find. Gaps are part of the story.',
    '',
    `## ${HERO_INSIGHT_HEADING}`,
    '',
    HERO_PLACEHOLDER,
    '',
    'Supporting claims (claims log rows):',
    '1.',
    '2.',
    '3.',
    '',
  ].join('\n')
}

/**
 * The hero insight sentence from a research file: the first real line under
 * the HERO INSIGHT heading. Null while it is missing or still the placeholder.
 */
export function extractHeroInsight(markdown: string): string | null {
  const lines = markdown.split('\n')
  const start = lines.findIndex((l) => /^#{1,6}\s*hero insight\s*:?\s*$/i.test(l.trim()))
  if (start < 0) return null
  for (const raw of lines.slice(start + 1)) {
    const line = raw.trim()
    if (/^#{1,6}\s/.test(line)) break
    if (!line || line === HERO_PLACEHOLDER) continue
    if (/^supporting claims/i.test(line)) break
    const text = line.replace(/^(?:>\s*|[-*]\s+|\d+\.\s+)/, '').replace(/^\*\*(.*)\*\*$/, '$1').trim()
    return text || null
  }
  return null
}

import { getAllStories } from '@vismay/content-source/content'
import { getEpic, listEpicsForHome } from '@vismay/content-source/epics'
import { listEditions } from '@vismay/dc-editions/dcEditions'
import { formatEditionDate, formatSigned, moodTone, moodWord } from '@vismay/dc-editions/dcEditionTypes'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import { getHtmlStoryCards } from '@/lib/htmlStoryListing'
import { boomScore, editionHref } from '@/app/ai-daily/doom-v-boom/components/editionUtils'
import { EDITION_CSS_VARS, resolveAiDataCentersTheme, type AiDataCentersTheme } from '@/app/ai-data-centers/theme'
import { BEATS, BEAT_LIMIT, BEAT_MIN, beatForDesk, spinLabels } from './beats'
import { FRONT_PAGE_LIMIT, type HomeBeat, type HomeData, type HomeDailyEdition, type HomeEpic, type HomeStory } from './homeShape'
import { loadStorySpins } from './storyBeats'

type FontSet = { serif?: string; sans?: string; mono?: string }

/** Everything the home page shows: the stories, their beats, the epics and the last three Doom v Boom editions. */
export async function loadHomeData(): Promise<HomeData> {
  const [stories, htmlStories, spins, epics, editions, dcEpic] = await Promise.all([
    getAllStories('vizmaya-fyi'),
    getHtmlStoryCards(),
    loadStorySpins(),
    // Best-effort, like the editions: the home page must not 500 because the epics or editions tables are unavailable.
    listEpicsForHome('vizmaya-fyi').catch((err) => {
      console.error('[home] epics listing failed:', err)
      return []
    }),
    listEditions(3).catch(() => []),
    getEpic('ai-data-centers').catch(() => null),
  ])

  // Agent-authored HTML stories (/s/<slug>) lead, newest first, ahead of the
  // curated viz-engine order.
  const beatOf = new Map<string, string>()
  const homeStories: HomeStory[] = [
    // A story picked by a randomizer desk says what it is about (the country,
    // the prize, the field) in its meta line, and belongs to that desk's beat.
    ...htmlStories.map((s) => {
      const spin = spins.get(s.slug)
      if (!spin) return s
      const beat = beatForDesk(spin.desk)
      if (beat) beatOf.set(s.slug, beat.id)
      const { topic, mark } = spinLabels(spin.desk, spin.reels)
      return { ...s, topic: s.topic ?? topic, mark }
    }),
    ...stories.map((s) => ({
      slug: s.slug,
      title: s.title,
      subtitle: s.subtitle,
      date: s.date,
      byline: s.byline ?? '',
      aura: s.aura,
      theme: s.theme,
      topic: s.topic,
      thumbnail: s.thumbnail,
      thumbnailTextColor: s.thumbnailTextColor,
    })),
  ]

  // A beat shows its newest stories that the wall doesn't already show.
  const below = homeStories.slice(FRONT_PAGE_LIMIT)
  const beats: HomeBeat[] = BEATS.map((b) => ({
    id: b.id,
    stories: below.filter((s) => beatOf.get(s.slug) === b.id).slice(0, BEAT_LIMIT[b.layout]),
  })).filter((b) => b.stories.length >= BEAT_MIN)

  const homeEpics: HomeEpic[] = epics.map((e) => ({
    slug: e.slug,
    name: e.name,
    description: e.description,
    theme: e.theme,
  }))

  const dailyEditions: HomeDailyEdition[] = editions.map((e) => ({
    href: editionHref(e.date),
    date: formatEditionDate(e.date, { year: false }),
    number: e.number,
    headline: e.headline,
    moodScore: e.moodScore,
    score: boomScore(e.moodScore),
    signed: formatSigned(e.moodScore),
    word: moodWord(e.moodScore),
    tone: moodTone(e.moodScore),
  }))

  // The Doom v Boom cards wear the edition's own palette (the epic's theme
  // override over the dark defaults), as the CSS variables the ring reads.
  const dailyTheme = resolveAiDataCentersTheme(dcEpic?.theme)
  const dailyVars: Record<string, string> = {}
  for (const [key, cssVar] of Object.entries(EDITION_CSS_VARS)) {
    if (cssVar) dailyVars[cssVar] = dailyTheme[key as keyof AiDataCentersTheme]
  }

  // Story and epic cards render in their own theme's typefaces, so collect
  // every distinct font set and resolve the Google Fonts links to load.
  const fontSets: FontSet[] = []
  for (const s of homeStories) if (s.theme?.fonts) fontSets.push(s.theme.fonts)
  for (const e of homeEpics) {
    const f = e.theme?.fonts as FontSet | undefined
    if (f) fontSets.push(f)
  }
  const fontUrls = Array.from(
    new Set(fontSets.map((f) => getFontImportUrl(f)).filter((u): u is string => Boolean(u)))
  )

  return { stories: homeStories, epics: homeEpics, beats, dailyEditions, dailyVars, fontUrls }
}

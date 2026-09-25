import type { Metadata } from 'next'
import { getAllStories } from '@vismay/content-source/content'
import { getEpic, listEpicsForHome } from '@vismay/content-source/epics'
import { listEditions } from '@vismay/content-source/dcEditions'
import { formatEditionDate, formatSigned, moodTone, moodWord } from '@vismay/content-source/dcEditionTypes'
import { getFontImportUrl } from '@vismay/content-source/getFontImports'
import HomeClient, { type HomeStory, type HomeEpic, type HomeDailyEdition } from '@/components/HomeClient'
import { boomScore, editionHref } from './ai-daily/doom-v-boom/components/editionUtils'
import { EDITION_CSS_VARS, resolveAiDataCentersTheme, type AiDataCentersTheme } from './ai-data-centers/theme'

type FontSet = { serif?: string; sans?: string; mono?: string }

export const revalidate = 0

export const metadata: Metadata = {
  title: 'vizmaya — Visual Stories',
  description:
    'Data-driven narratives on geopolitics, technology, and the asymmetries that reshape markets.',
  alternates: { canonical: '/' },
}

export default async function HomePage() {
  const [stories, epics, editions, dcEpic] = await Promise.all([
    getAllStories('vizmaya-fyi'),
    listEpicsForHome('vizmaya-fyi'),
    // Best-effort: the home page must not 500 if the editions table is unavailable.
    listEditions(3).catch(() => []),
    getEpic('ai-data-centers').catch(() => null),
  ])
  const homeStories: HomeStory[] = stories.map((s) => ({
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
  }))
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

  // Each story/epic card renders in its own theme's typefaces, so collect every
  // distinct font set and resolve the Google Fonts links to load.
  const fontSets: FontSet[] = []
  for (const s of homeStories) if (s.theme?.fonts) fontSets.push(s.theme.fonts)
  for (const e of homeEpics) {
    const f = e.theme?.fonts as FontSet | undefined
    if (f) fontSets.push(f)
  }
  const fontUrls = Array.from(
    new Set(fontSets.map((f) => getFontImportUrl(f)).filter((u): u is string => Boolean(u)))
  )

  return <HomeClient stories={homeStories} epics={homeEpics} dailyEditions={dailyEditions} dailyVars={dailyVars} fontUrls={fontUrls} />
}

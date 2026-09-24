import { ImageResponse } from 'next/og'
import { notFound } from 'next/navigation'
import { getEdition, listEditions } from '@vismay/content-source/dcEditions'
import { formatEditionDate, formatSigned, moodWord } from '@vismay/content-source/dcEditionTypes'
import { StoryOgCard } from '@/components/seo/StoryOgCard'
import { AI_DATA_CENTERS_THEME_DEFAULTS as T } from '../../../ai-data-centers/theme'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AI Data Centers Daily edition preview'

const COLORS = { background: T.ink, text: T.bone, accent: T.accent, accent2: T.accentLo, surface: T.elevated, muted: T.muted }

export async function generateStaticParams() {
  const editions = await listEditions(400).catch(() => [])
  return editions.map((e) => ({ date: e.date }))
}

export default async function Image({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params
  const e = /^\d{4}-\d{2}-\d{2}$/.test(date) ? await getEdition(date).catch(() => null) : null
  if (!e) notFound()
  const reading = e.moodScore == null ? '' : ` · Doom v Boom ${moodWord(e.moodScore)} ${formatSigned(e.moodScore)}`
  return new ImageResponse(
    (
      <StoryOgCard
        title={e.headline}
        subtitle={`${e.counts.stories} stories · ${e.counts.papers} papers${reading}`}
        byline={`AI Data Centers Daily${e.number != null ? ` · Edition ${e.number}` : ''} · ${formatEditionDate(e.date)}`}
        date={e.publishedAt ?? `${e.date}T09:00:00Z`}
        colors={COLORS}
      />
    ),
    { ...size },
  )
}

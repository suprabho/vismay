import { ImageResponse } from 'next/og'
import { getLatestEdition } from '@vismay/content-source/dcEditions'
import { formatEditionDate, formatSigned, moodWord } from '@vismay/content-source/dcEditionTypes'
import { StoryOgCard } from '@/components/seo/StoryOgCard'
import { AI_DATA_CENTERS_THEME_DEFAULTS as T } from '../../ai-data-centers/theme'

export const runtime = 'nodejs'
export const revalidate = 900
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'AI Data Centers Daily — the latest edition'

const COLORS = { background: T.ink, text: T.bone, accent: T.accent, accent2: T.accentLo, surface: T.elevated, muted: T.muted }

export default async function Image() {
  const e = await getLatestEdition().catch(() => null)
  if (!e) {
    return new ImageResponse(
      <StoryOgCard title="AI Data Centers Daily" subtitle="One frozen edition a day: the previous 24 hours of AI, energy and sustainability news, every claim traceable to its source." byline="vizmaya · AI Data Centers" date={new Date().toISOString()} colors={COLORS} />,
      { ...size },
    )
  }
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

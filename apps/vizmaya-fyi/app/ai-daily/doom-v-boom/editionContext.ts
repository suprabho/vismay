import type { Metadata } from 'next'
import { getEpic } from '@vismay/content-source/epics'
import { getEditionNeighbours, listEditions } from '@vismay/content-source/dcEditions'
import type { DcEditionNeighbours, DcEditionSummary, DcEditionWithContent } from '@vismay/content-source/dcEditionTypes'
import { formatEditionDate, formatSigned, moodWord } from '@vismay/content-source/dcEditionTypes'
import { aiDataCentersThemeOverrides, type AiDataCentersTheme } from '../../ai-data-centers/theme'

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://vizmaya.fyi'

export interface EditionContext {
  neighbours: DcEditionNeighbours
  previous: DcEditionSummary[]
  themeOverrides: Partial<AiDataCentersTheme>
}

/** The bits around an edition: its neighbours, the archive rail, the epic theme override. */
export async function loadEditionContext(date: string): Promise<EditionContext> {
  const [neighbours, previous, epic] = await Promise.all([
    getEditionNeighbours(date).catch(() => ({ prev: null, next: null })),
    listEditions(5, { before: date }).catch(() => [] as DcEditionSummary[]),
    getEpic('ai-data-centers').catch(() => null),
  ])
  return { neighbours, previous, themeOverrides: aiDataCentersThemeOverrides(epic?.theme) }
}

/** Page metadata for an edition; `alias` marks the /daily route that always points at the latest. */
export function editionMetadata(e: DcEditionWithContent, opts: { alias?: boolean; noindex?: boolean } = {}): Metadata {
  const path = opts.alias ? '/ai-daily/doom-v-boom' : `/ai-daily/doom-v-boom/${e.date}`
  const title = `${e.headline} — AI Data Centers Daily, ${formatEditionDate(e.date, { weekday: false })}`
  const description = e.sub.replace(/\*/g, '')
  const reading = e.moodScore == null ? '' : ` · Doom v Boom ${moodWord(e.moodScore)} ${formatSigned(e.moodScore)}`
  return {
    title,
    description,
    alternates: { canonical: `/ai-daily/doom-v-boom/${e.date}` },
    robots: opts.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: 'article',
      title: e.headline,
      description: `${description}${reading}`,
      url: path,
      siteName: 'vizmaya',
      publishedTime: e.publishedAt ?? undefined,
    },
    twitter: { card: 'summary_large_image', title: e.headline, description },
  }
}

import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getEdition, listEditions } from '@vismay/content-source/dcEditions'
import { formatEditionDate } from '@vismay/content-source/dcEditionTypes'
import JsonLd from '@/components/JsonLd'
import { buildBreadcrumbJsonLd, buildEditionJsonLd } from '@/lib/jsonLd'
import EditionPage from '../components/EditionPage'
import { SITE_URL, editionMetadata, loadEditionContext } from '../editionContext'

// A published edition never changes, so its page is generated once and never
// revalidated on a timer. Dates that aren't published yet 404; the publish
// hook (/api/ai-data-centers/editions/revalidate) re-renders the path the
// moment the edition freezes.
export const revalidate = false
export const dynamicParams = true

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

interface RouteParams {
  params: Promise<{ date: string }>
}

export async function generateStaticParams() {
  const editions = await listEditions(400).catch(() => [])
  return editions.map((e) => ({ date: e.date }))
}

export async function generateMetadata({ params }: RouteParams): Promise<Metadata> {
  const { date } = await params
  if (!DATE_RE.test(date)) return {}
  const e = await getEdition(date).catch(() => null)
  if (!e) return { title: `AI Data Centers Daily — ${date}` }
  return editionMetadata(e)
}

export default async function DailyEditionPage({ params }: RouteParams) {
  const { date } = await params
  if (!DATE_RE.test(date)) notFound()
  const edition = await getEdition(date).catch((err) => {
    console.warn(`ai-data-centers/daily/${date}: getEdition failed: ${err}`)
    return null
  })
  if (!edition) notFound()
  const ctx = await loadEditionContext(edition.date)
  return (
    <>
      <JsonLd
        data={[
          buildEditionJsonLd({ date: edition.date, number: edition.number, headline: edition.headline, sub: edition.sub.replace(/\*/g, ''), publishedAt: edition.publishedAt }),
          buildBreadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: 'AI Data Centers', url: '/ai-data-centers' },
            { name: 'Daily snapshot', url: '/ai-data-centers/daily' },
            { name: formatEditionDate(edition.date), url: `/ai-data-centers/daily/${edition.date}` },
          ]),
        ]}
      />
      <EditionPage edition={edition} neighbours={ctx.neighbours} previous={ctx.previous} themeOverrides={ctx.themeOverrides} siteUrl={SITE_URL} />
    </>
  )
}

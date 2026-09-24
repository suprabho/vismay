import type { Metadata } from 'next'
import Link from 'next/link'
import { getLatestEdition } from '@vismay/content-source/dcEditions'
import JsonLd from '@/components/JsonLd'
import { buildBreadcrumbJsonLd, buildEditionJsonLd } from '@/lib/jsonLd'
import EditionPage from './components/EditionPage'
import { SITE_URL, editionMetadata, loadEditionContext } from './editionContext'

// The alias for the latest edition. Static, re-rendered on demand by the
// publish hook (/api/ai-data-centers/editions/revalidate) and, as a safety
// net, every 15 minutes — a missed ping delays a new edition by minutes.
export const revalidate = 900

export async function generateMetadata(): Promise<Metadata> {
  const e = await getLatestEdition().catch(() => null)
  if (!e) {
    return {
      title: 'AI Data Centers Daily — vizmaya',
      description: 'One frozen edition a day: the previous 24 hours of AI, energy and sustainability news, every claim traceable to its source.',
      alternates: { canonical: '/ai-daily/doom-v-boom' },
    }
  }
  return editionMetadata(e, { alias: true })
}

export default async function DailyLatestPage() {
  const edition = await getLatestEdition().catch((err) => {
    console.warn(`ai-daily/doom-v-boom: getLatestEdition failed: ${err}`)
    return null
  })
  if (!edition) {
    return (
      <main className="wrap">
        <div className="empty">
          <span className="eyebrow">AI Data Centers · Daily snapshot</span>
          <h1>The first edition is on its way.</h1>
          <p>
            One frozen edition a day, composed at 06:15 UTC from the previous 24 hours of AI, energy and sustainability news and published at
            09:00 UTC. Nothing has been published yet — the live explorer keeps moving in the meantime.
          </p>
          <Link className="cta" href="/ai-data-centers">
            Open the live explorer →
          </Link>
          <Link className="cta" href="/ai-daily/doom-v-boom/sample">
            See a sample edition →
          </Link>
        </div>
      </main>
    )
  }
  const ctx = await loadEditionContext(edition.date)
  return (
    <>
      <JsonLd
        data={[
          buildEditionJsonLd({ date: edition.date, number: edition.number, headline: edition.headline, sub: edition.sub.replace(/\*/g, ''), publishedAt: edition.publishedAt }),
          buildBreadcrumbJsonLd([
            { name: 'Home', url: '/' },
            { name: 'AI Data Centers', url: '/ai-data-centers' },
            { name: 'Daily snapshot', url: '/ai-daily/doom-v-boom' },
          ]),
        ]}
      />
      <EditionPage edition={edition} neighbours={ctx.neighbours} previous={ctx.previous} themeOverrides={ctx.themeOverrides} siteUrl={SITE_URL} />
    </>
  )
}
